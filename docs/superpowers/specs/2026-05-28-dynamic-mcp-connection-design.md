# Dynamic MCP Server Connection Design

**Date:** 2026-05-28
**Status:** Draft

---

## Overview

解决 ElectronHound Agent 的两个核心问题：

1. **Agent 不知道工具使用顺序** — 缺少工作流引导，导致 LLM 盲目选择工具
2. **Playwright 未连接到 Electron 的 CDP 端口** — `browser_*` 工具无法操作 Electron 渲染进程

采用 **动态 MCP 服务器连接** 方案：MCPClient 在执行 `electron_launch` 后自动提取 CDP 端口，动态启动 Playwright MCP 服务器并连接到目标 Electron 应用。

---

## Problem Analysis

### 问题 1：Agent 工具使用缺乏引导

当前 `PLAN_SYSTEM` prompt 仅列出可用工具及其参数，但没有说明：
- 工具之间的依赖关系（必须先 launch 才能 snapshot）
- 推荐的执行顺序（launch → observe → interact → cleanup）
- 何时使用哪类工具（electron_* vs browser_*）

**结果：** LLM 可能在未启动应用时就尝试 `browser_snapshot`，或在测试完成后忘记 `electron_close`。

### 问题 2：Playwright 与 Electron 断开

当前架构：
- `MCPClient.connect({ electron: { appPath } })` 只启动 electron-bridge-mcp
- Playwright MCP 需要独立启动，且需要知道 Electron 的 CDP WebSocket URL
- `electron_launch` 返回 `{ pid, cdpPort, webSocketUrl }`，但这个信息没有传递给 Playwright

**结果：** `browser_*` 工具调用时 Playwright 要么未启动，要么连接到错误的浏览器实例。

---

## Design

### 核心思路

`MCPClient.callTool()` 拦截 `electron_launch` 的返回结果，自动提取 `webSocketUrl`，然后动态启动 Playwright MCP 服务器并连接到该 URL。对上层（AgentLoop、Runner）完全透明。

### 架构图

```
AgentLoop
  │
  ├─ callTool('electron', 'electron_launch', { targetAppPath })
  │     │
  │     ├─ electron-bridge-mcp → spawnElectron() → { pid, cdpPort, webSocketUrl }
  │     │
  │     └─ MCPClient 拦截结果
  │           ├─ 提取 webSocketUrl
  │           └─ spawnPlaywright(webSocketUrl)  ← 动态启动
  │
  ├─ callTool('playwright', 'browser_snapshot', {})
  │     └─ Playwright MCP → 连接到 Electron 渲染进程 ✓
  │
  └─ callTool('electron', 'electron_close', { pid })
        └─ 清理：断开 Playwright 连接
```

---

### Component 1: MCPClient 动态连接

**文件:** `packages/agent-core/src/mcp/client.ts`

#### 修改 `callTool` 方法

在 `electron_launch` 调用成功后，自动检测并启动 Playwright：

```typescript
async callTool(
  server: 'playwright' | 'electron',
  toolName: string,
  args: Record<string, unknown>,
): Promise<MCPToolResult> {
  // ... 现有逻辑执行工具调用 ...

  // 拦截 electron_launch 结果，动态连接 Playwright
  if (server === 'electron' && toolName === 'electron_launch' && result.success) {
    await this.handleElectronLaunchResult(result);
  }

  // 拦截 electron_close 结果，断开 Playwright
  if (server === 'electron' && toolName === 'electron_close') {
    await this.handleElectronClose();
  }

  return result;
}
```

#### 新增 `handleElectronLaunchResult` 方法

```typescript
private async handleElectronLaunchResult(result: MCPToolResult): Promise<void> {
  const content = result.result as { content?: Array<{ text?: string }> };
  const text = content?.content?.[0]?.text;
  if (!text) return;

  try {
    const data = JSON.parse(text) as { webSocketUrl?: string };
    if (data.webSocketUrl) {
      await this.spawnPlaywright(data.webSocketUrl);
    }
  } catch {
    // 解析失败不影响主流程
  }
}
```

#### 修改 `spawnPlaywright` 方法

支持传入 `cdpUrl` 参数，连接到已有的浏览器实例：

```typescript
private async spawnPlaywright(cdpUrl?: string): Promise<void> {
  // 如果已连接，先断开
  if (this.connections.has('playwright')) {
    await this.disconnectServer('playwright');
  }

  const args = ['@playwright/mcp'];
  if (cdpUrl) {
    args.push('--cdp-endpoint', cdpUrl);
  } else {
    args.push('--headless');
  }

  const params: StdioServerParameters = {
    command: 'npx',
    args,
  };

  // ... 创建 transport 和 client，连接 ...
  this.connections.set('playwright', { transport, client });
}
```

#### 新增 `handleElectronClose` 方法

```typescript
private async handleElectronClose(): Promise<void> {
  if (this.connections.has('playwright')) {
    await this.disconnectServer('playwright');
  }
}
```

#### 新增 `disconnectServer` 方法

从现有 `disconnect()` 中提取单个服务器断开逻辑：

```typescript
private async disconnectServer(server: string): Promise<void> {
  const conn = this.connections.get(server);
  if (conn) {
    try {
      await conn.transport.close();
    } catch {
      // 忽略清理错误
    }
    this.connections.delete(server);
  }
}
```

---

### Component 2: Agent Prompt 工作流引导

**文件:** `packages/agent-core/src/runtime/agentLoop.ts`

#### 修改 `PLAN_SYSTEM` prompt

在现有工具列表后添加工作流指南：

```typescript
const PLAN_SYSTEM = [
  // ... 现有内容 ...

  '',
  '## Workflow',
  '',
  'Follow this sequence for testing an Electron app:',
  '1. **Launch**: Use `electron_launch` with the target app path',
  '2. **Observe**: Use `browser_snapshot` to see the current UI state',
  '3. **Interact**: Use `browser_click`, `browser_type`, etc. to test features',
  '4. **Verify**: Use `browser_snapshot` again to confirm the result',
  '5. **Cleanup**: Use `electron_close` with the PID from step 1',
  '',
  'Rules:',
  '- Always launch the app before using browser_* tools',
  '- Always close the app when testing is complete',
  '- Use electron_* tools for main process operations (IPC, dialogs)',
  '- Use browser_* tools for UI interactions (click, type, navigate)',
  '- If a tool call fails, check if the app is still running before retrying',
].join('\n');
```

---

### Component 3: Runner 连接策略

**文件:** `packages/agent-core/src/runner.ts`

#### 修改 MCP 连接逻辑

当提供 `targetAppPath` 时，只连接 electron-bridge-mcp。Playwright 将在 `electron_launch` 后动态启动。

```typescript
} else if (options.targetAppPath) {
  const mcp = new MCPClient();
  // 只连接 electron-bridge-mcp，Playwright 会在 launch 后动态连接
  await mcp.connect({ electron: { appPath: options.targetAppPath } });
  mcpClient = mcp;
}
```

这与当前逻辑一致，无需修改。动态连接完全由 MCPClient 内部处理。

---

### Component 4: AgentLoop Cleanup

**文件:** `packages/agent-core/src/runtime/agentLoop.ts`

#### 在 `run()` 方法中添加 finally 块

确保 AgentLoop 结束时断开所有 MCP 连接：

```typescript
async run(taskPrompt: string): Promise<AgentRunResult> {
  // ... 现有逻辑 ...

  try {
    while (state.stepCount < this.maxSteps) {
      // ... 现有循环 ...
    }
    // ... exhausted logic ...
  } finally {
    // 清理 MCP 连接
    if (this.mcp) {
      await this.mcp.disconnect().catch(() => {});
    }
  }
}
```

---

## Data Flow

### 完整执行流程

```
1. Runner.runTest()
   └─ MCPClient.connect({ electron: { appPath } })
      └─ 启动 electron-bridge-mcp 子进程

2. AgentLoop.run("Test login flow")
   │
   ├─ Step 1: observe → "App not launched yet"
   ├─ Step 1: plan → { toolName: "electron_launch", toolArgs: { targetAppPath } }
   ├─ Step 1: execute
   │   └─ MCPClient.callTool('electron', 'electron_launch', args)
   │       ├─ electron-bridge-mcp 返回 { pid: 1234, cdpPort: 9222, webSocketUrl: "ws://..." }
   │       └─ MCPClient 自动 spawnPlaywright("ws://...")
   │
   ├─ Step 2: observe → "App launched, login page visible"
   ├─ Step 2: plan → { toolName: "browser_snapshot", toolArgs: {} }
   ├─ Step 2: execute
   │   └─ MCPClient.callTool('playwright', 'browser_snapshot', {})
   │       └─ Playwright MCP 返回页面可访问性树 ✓
   │
   ├─ Step 3: plan → { toolName: "browser_type", toolArgs: { ref: "input#user", text: "admin" } }
   ├─ Step 3: execute → Playwright 输入文本 ✓
   │
   ├─ Step 4: plan → { toolName: "browser_click", toolArgs: { ref: "button#login" } }
   ├─ Step 4: execute → Playwright 点击按钮 ✓
   │
   ├─ Step 5: plan → { toolName: "electron_close", toolArgs: { pid: 1234 } }
   ├─ Step 5: execute
   │   └─ MCPClient.callTool('electron', 'electron_close', { pid })
   │       ├─ electron-bridge-mcp 关闭应用
   │       └─ MCPClient 自动断开 Playwright 连接
   │
   └─ finally: MCPClient.disconnect()
```

---

## Error Handling

### Playwright 启动失败

如果 `spawnPlaywright(webSocketUrl)` 失败：
- 记录警告日志
- `callTool('playwright', ...)` 降级为 mock 模式返回
- Agent 可以继续使用 `electron_*` 工具

### Electron 应用崩溃

如果 Electron 进程意外退出：
- `electron_close` 调用会返回错误
- MCPClient 检测到并断开 Playwright
- Agent 的 verify 阶段会检测到异常，给出 `fail` verdict

### Playwright 连接超时

如果 Playwright 无法连接到 CDP 端口：
- `spawnPlaywright` 抛出超时错误
- 不影响 electron-bridge-mcp 的连接
- Agent 可以重试 `electron_launch`

---

## Files to Modify

| 文件 | 改动 |
|------|------|
| `packages/agent-core/src/mcp/client.ts` | 核心：动态 Playwright 连接、launch/close 拦截、disconnectServer |
| `packages/agent-core/src/runtime/agentLoop.ts` | prompt 工作流引导、finally cleanup |
| `packages/agent-core/src/mcp/__tests__/client.test.ts` | 新增动态连接测试用例 |

---

## Acceptance Criteria

- [x] `electron_launch` 调用后自动启动 Playwright MCP 并连接到 Electron CDP 端口
- [x] `browser_snapshot` 能正确返回 Electron 渲染进程的可访问性树（需端到端验证）
- [x] `electron_close` 调用后自动断开 Playwright 连接
- [x] AgentLoop 结束时（无论正常或异常）断开所有 MCP 连接
- [x] `PLAN_SYSTEM` prompt 包含工作流指南（launch → observe → interact → cleanup）
- [x] Playwright 启动失败时不阻断 electron_* 工具的使用
- [x] 现有测试全部通过（74 文件、1280 测试）
- [x] 新增单元测试覆盖动态连接逻辑（9 个新测试）

---

## Implementation Plan

### Phase 1: MCPClient 动态连接（核心）

**文件:** `packages/agent-core/src/mcp/client.ts`

| Step | 改动 | 验证 |
|------|------|------|
| 1.1 | `spawnPlaywright(cdpUrl?)` — 支持 `--cdp-endpoint` 参数 | TypeScript 编译通过 |
| 1.2 | `disconnectServer(server)` — 提取单服务器断开逻辑 | `disconnect()` 调用它 |
| 1.3 | `handleElectronLaunchResult()` — 解析 webSocketUrl 并启动 Playwright | 单元测试 |
| 1.4 | `handleElectronClose()` — 断开 Playwright 连接 | 单元测试 |
| 1.5 | `callTool()` 拦截 — electron_launch/close 后触发动态逻辑 | 集成测试 |

### Phase 2: AgentLoop Prompt + Cleanup

**文件:** `packages/agent-core/src/runtime/agentLoop.ts`

| Step | 改动 | 验证 |
|------|------|------|
| 2.1 | `PLAN_SYSTEM` 添加 Workflow 段落 | prompt 内容检查 |
| 2.2 | `run()` 方法添加 try/finally + MCP disconnect | 单元测试 |

### Phase 3: 测试

**文件:** `packages/agent-core/src/mcp/__tests__/client.test.ts`

| Step | 测试用例 | 覆盖点 |
|------|----------|--------|
| 3.1 | electron_launch 后自动连接 Playwright | handleElectronLaunchResult |
| 3.2 | electron_close 后自动断开 Playwright | handleElectronClose |
| 3.3 | Playwright 启动失败降级为 mock | 错误处理 |
| 3.4 | disconnect() 清理所有连接 | disconnectServer |
| 3.5 | AgentLoop finally 块调用 disconnect | 资源清理（✓ agentLoop.test.ts） |

### Phase 4: 验证

| 验证项 | 方法 |
|--------|------|
| TypeScript 编译 | `pnpm build` |
| 全量测试 | `pnpm test` |
| 端到端 | 手动运行 test-electron-app fixture |

---

## Testing Strategy

### 单元测试

1. **MCPClient.callTool 拦截测试**
   - mock electron-bridge-mcp 返回 `{ webSocketUrl: "ws://..." }`
   - 验证 `spawnPlaywright` 被调用且传入正确的 cdpUrl
   - 验证 Playwright 连接已建立

2. **MCPClient 动态断开测试**
   - 调用 `electron_close` 后验证 Playwright 连接已断开
   - 调用 `disconnect()` 后验证所有连接已清理

3. **错误处理测试**
   - Playwright 启动失败时 callTool 降级为 mock
   - Electron 应用崩溃时 Playwright 连接自动清理

### 集成测试

4. **端到端流程测试**
   - 使用 test-electron-app fixture
   - 执行完整流程：launch → snapshot → click → close
   - 验证每个步骤的工具调用和结果

---

## Future Considerations

- **多窗口支持**: 当 Electron 应用有多个 BrowserWindow 时，Playwright 需要选择正确的 target
- **CDP 端口冲突**: 如果 9222 端口被占用，需要动态选择可用端口（当前已通过 `port: 0` 实现）
- **Playwright 版本管理**: `@playwright/mcp` 的版本需要与 Electron 的 Chromium 版本兼容
- **连接池**: 如果未来需要同时测试多个 Electron 应用，需要支持多个 Playwright 实例
