# Agent Enhancement Design

**Version:** 1.0
**Date:** 2026-05-29
**Status:** Pending Approval

---

## Overview

Agent 增强三个方向：更多 electron-helper 操作、多 agent 并行协作、断点续传。

---

## 功能 1: 新增 electron-helper 操作

### 现有操作

`packages/electron-helper/src/operation-handler.ts` 已有 5 个操作：`execute_main`, `send_ipc`, `mock_dialog`, `get_menu_items`, `health_check`。

### 新增操作

| 操作 | 功能 | 实现方式 |
|------|------|----------|
| `take_screenshot` | 截取当前页面截图 | CDP `Page.captureScreenshot` |
| `get_console_logs` | 获取渲染进程控制台日志 | CDP `Runtime.consoleAPICalled` 监听 |
| `evaluate_in_page` | 在渲染进程执行 JS | CDP `Runtime.evaluate` (frame 上下文) |
| `get_network_requests` | 获取网络请求列表 | CDP `Network.requestWillBeSent` 监听 |
| `set_window_bounds` | 设置窗口大小/位置 | CDP `Browser.getWindowForTarget` + `Browser.setWindowBounds` |

### 实现位置

`packages/electron-helper/src/operation-handler.ts` — 添加新 case 到 `handleOperation()` switch。

每个操作遵循现有模式：
```typescript
case 'take_screenshot': {
  const screenshot = await cdpSession.send('Page.captureScreenshot', {
    format: 'png',
    quality: 80,
  });
  return { screenshot: screenshot.data }; // base64
}
```

---

## 功能 2: 多 Agent 并行协作

### 问题

当前 audit-chain 是纯串行管道。多个分析角色无法并行执行，浪费时间。

### 设计

将 audit-chain 改为并行 + 汇总模式：

```
                    ┌─ test-planner ─────────┐
                    │                        │
AgentLoop 结果 ─────┼─ execution-analyst ────┼──── report-synthesizer
                    │                        │
                    └─ security-reviewer ────┘
```

**三个分析角色并行执行，最后由 report-synthesizer 汇总。**

### 实现

**文件:** `packages/agent-core/src/sub-agents/audit-chain.ts`

```typescript
export async function runAuditChain(context: AuditContext): Promise<AuditReport> {
  // Wave 1: 并行执行三个分析角色
  const [planResult, analysisResult, securityResult] = await Promise.all([
    runSubAgent('test-planner', context),
    runSubAgent('execution-analyst', context),
    runSubAgent('security-reviewer', context),
  ]);

  // Wave 2: 汇总
  const report = await runSubAgent('report-synthesizer', {
    ...context,
    planResult,
    analysisResult,
    securityResult,
  });

  return report;
}
```

### 错误处理

- 单个角色失败不影响其他角色
- 失败角色的结果标记为 `{ error: string }`，synthesizer 降级处理
- 超时：每个角色最长 60 秒，超时视为失败

---

## 功能 3: 断点续传

### 问题

AgentLoop 因崩溃、超时、或用户中断停止后，无法从上次中断点恢复。已执行的步骤全部丢失。

### 设计

**Checkpoint 机制：** 每个 step 完成后写入 checkpoint，恢复时从 checkpoint 继续。

**Checkpoint 结构：**
```typescript
interface AgentCheckpoint {
  sessionId: string;
  currentStep: number;
  maxSteps: number;
  taskPrompt: string;
  config: AgentLoopConfig;
  lastObservation: Observation;
  lastPlan: Plan;
  lastExecutionResult: ExecutionResult;
  sessionEntries: SessionEntry[];  // 已有历史
  timestamp: string;
}
```

**存储：** SQLite 表 `agent_checkpoints`

```sql
CREATE TABLE IF NOT EXISTS agent_checkpoints (
  session_id TEXT PRIMARY KEY,
  checkpoint TEXT NOT NULL,       -- JSON AgentCheckpoint
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**流程：**

1. **保存：** AgentLoop 每个 step 结束后，调用 `checkpointManager.save(sessionId, state)`
2. **恢复：** `runner.ts` 启动时检查是否有未完成的 checkpoint，如有则调用 `agentLoop.resume(checkpoint)`
3. **清理：** 任务完成（pass/fail/stuck）后删除 checkpoint

**AgentLoop 改动：**

```typescript
class AgentLoop {
  // 新增 resume 方法
  async resume(checkpoint: AgentCheckpoint): Promise<AgentRunResult> {
    // 恢复状态
    this.sessionId = checkpoint.sessionId;
    this.currentStep = checkpoint.currentStep;
    // 从 checkpoint 的 step+1 继续
    return this.run(checkpoint.taskPrompt, checkpoint.config);
  }
}
```

**Runner 改动：**

```typescript
async function runTest(params: RunTestParams): Promise<RunTestResult> {
  // 检查是否有未完成的 checkpoint
  const checkpoint = await checkpointManager.get(params.sessionId);
  if (checkpoint) {
    return agentLoop.resume(checkpoint);
  }
  // 正常运行
  return agentLoop.run(params.taskPrompt, params.config);
}
```

---

## 文件清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `packages/agent-core/src/session/checkpointManager.ts` | Checkpoint 管理 |
| `packages/agent-core/src/__tests__/checkpoint.test.ts` | Checkpoint 测试 |
| `packages/agent-core/src/sub-agents/__tests__/parallel-audit.test.ts` | 并行 audit 测试 |
| `packages/electron-helper/src/__tests__/new-operations.test.ts` | 新操作测试 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `packages/electron-helper/src/operation-handler.ts` | 新增 5 个操作 |
| `packages/agent-core/src/sub-agents/audit-chain.ts` | 串行 → 并行 |
| `packages/agent-core/src/runtime/agentLoop.ts` | 添加 resume() 方法 |
| `packages/agent-core/src/runner.ts` | 集成 checkpoint 恢复 |
| `apps/server/src/db/migrations.ts` | 新增 agent_checkpoints 表 |

---

## 验收标准

### 新操作
- [ ] 5 个新操作在 operation-handler.ts 中实现
- [ ] 每个操作有单元测试
- [ ] 操作通过 CDP session 正确执行

### 并行协作
- [ ] audit-chain 三个角色并行执行
- [ ] 总时间 < 串行时间的 50%
- [ ] 单个角色失败不影响其他角色
- [ ] report-synthesizer 正确处理失败角色的结果

### 断点续传
- [ ] 每个 step 完成后 checkpoint 保存到数据库
- [ ] 崩溃后可从 checkpoint 恢复
- [ ] 完成后 checkpoint 自动清理
- [ ] 恢复后从正确的 step 继续

---

## 执行顺序

```
Wave 1 (并行):
  ├── Agent 1: electron-helper 5 个新操作 + 测试
  ├── Agent 2: 并行 audit-chain + 测试
  └── Agent 3: checkpointManager + 测试

Wave 2 (串行):
  ├── AgentLoop.resume() + runner.ts 集成
  └── 全量测试验证
```
