# EATA v0.2: Real LLM + MCP + UX

## TL;DR

> **Quick Summary**: Wire real LLM (Vercel AI SDK) and real MCP (@playwright/mcp) into the v0.1 skeleton, enabling the AI agent to perform real automated testing on Electron applications. Add settings page, screenshot viewing, HTML report export, and task cancel control to Dashboard.
> 
> **Deliverables**:
> - Real LLM integration: createOpenAI() provider + generateObject() DI into plan/verify nodes
> - Real MCP client: stdio child process for @playwright/mcp and electron-bridge-mcp
> - Worker JSON-RPC bridge: stdin control + stdout progress notifications
> - Graph DI refactor: createTestGraph(options) parameterized
> - Settings page: LLM Key + model + base URL configuration (localStorage)
> - Screenshot capture + viewing: execute node captures, LiveMonitor displays
> - HTML report generation + download endpoint
> - Task cancel API + Dashboard UI
> - E2E test with fixture app using real LLM + real MCP
> 
> **Estimated Effort**: Medium (1-2 weeks for 1 developer)
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: T1 (Schema) → T3 (Graph DI) → T6 (LLM Wire) → T10 (E2E) → F1-F4

---

## Context

### Original Request
v0.2 将 v0.1 的 AI loop 接入真实 LLM 和真实 MCP 工具链，让 AI agent 能对 Electron 应用执行真实的自动化测试。Dashboard UX（设置页、截图查看、HTML 报告导出、任务取消）作为配套功能。

### Interview Summary
**Key Discussions**:
- User selected directions A (real LLM) + B (UX) + C (production), NOT D (AI enhancement)
- Core pipeline priority: LLM + MCP wiring comes first, Dashboard features second
- LLM providers: support all (OpenAI + compatible endpoints via OPENAI_BASE_URL)
- Test target: fixture app first, then user's own Electron product (later waves)
- Usage: individual developer first, architecture reserves team extension
- Dashboard 4 features: settings page, screenshot viewing, HTML report export, task cancel (pause/resume deferred)
- Test strategy: TDD

**Research Findings (from explore agent)**:
- Worker process: FULLY IMPLEMENTED (real spawn, JSON-RPC, heartbeat)
- Dashboard: PARTIAL (basic CRUD works, missing settings/search/export/control)
- LLM integration: STUB — plan.ts/verify.ts have DI injection points but called with empty options
- MCP client: MOCK — callTool returns string template, no real Playwright/Electron
- Zero OPENAI_API_KEY references, zero createOpenAI() calls
- @ai-sdk/openai only in type annotations, never runtime

### Metis Review
**Identified Gaps** (all addressed):
- createTestGraph() 不接受参数 → RESOLVED: 重构为 createTestGraph(options)
- Worker 无 JSON-RPC 桥 → RESOLVED: 新建 worker-entry.ts
- MCPClient 是 mock → RESOLVED: 重写为真实 stdio MCP 客户端
- llmModel 枚举过严 → RESOLVED: 放宽为 z.string().min(1) + 新字段
- report-graph 未调用 → RESOLVED: 明确排除出 v0.2 scope
- execute 节点未截图 → RESOLVED: v0.2 添加 screenshot 逻辑
- @playwright/mcp 未在依赖中 → RESOLVED: v0.2 添加依赖

---

## Work Objectives

### Core Objective
将 v0.1 的 AI loop 接入真实 LLM 和真实 MCP 工具链，让 AI agent 能对 Electron 应用执行真实的自动化测试。

### Concrete Deliverables
- `packages/agent-core/src/llm.ts` — LLM provider 初始化 (createOpenAI + env vars)
- `packages/agent-core/src/graph.ts` — 重构为 createTestGraph(options)
- `packages/agent-core/src/worker-entry.ts` — JSON-RPC bridge (stdin/stdout)
- `packages/agent-core/src/mcp/client.ts` — 真实 stdio MCP 客户端
- `packages/agent-core/src/nodes/execute.ts` — 截图捕获
- `packages/shared-types/src/task.ts` — llmModel 放宽 + 新字段
- `apps/dashboard/src/pages/Settings.tsx` — 设置页面
- `apps/server/src/routes/reports.ts` — HTML 报告端点
- `apps/server/src/routes/tasks.ts` — cancel 端点
- `tests/e2e/real-llm.test.ts` — 真实 LLM E2E 测试

### Definition of Done
- [x] AI loop 用真实 LLM 对 fixture app 执行测试并产生报告
- [x] Dashboard 设置页可以配置和保存 LLM Key
- [x] 截图在 execute 步骤捕获并在 TaskDetail 页面显示
- [x] HTML 报告可以下载
- [x] 正在运行的任务可以取消

### Must Have
- Vercel AI SDK createOpenAI() 初始化 + generateObject() DI 注入
- 真实 MCP 客户端（stdio 子进程连接 @playwright/mcp + electron-bridge-mcp）
- Worker JSON-RPC 桥（stdin 控制命令 + stdout 进度通知）
- Graph DI 参数化（createTestGraph 接受 options）
- OPENAI_API_KEY / OPENAI_BASE_URL / LLM_MODEL 环境变量支持
- Dashboard 设置页（localStorage 存储 LLM 配置）
- 截图捕获（execute 步骤）+ TaskDetail 页面展示
- HTML 报告生成 + /api/tasks/:id/report/html 端点
- 任务取消（DELETE /api/tasks/:id/cancel + Dashboard UI）
- TDD for all new modules
- 现有 450 测试不能回归

### Must NOT Have (Guardrails)
- ❌ NO report-graph Sub Graph 接入（推到 v0.3）
- ❌ NO AI 能力增强（few-shot、上下文学习、多策略）（推到 v0.3+）
- ❌ NO 多任务并行执行
- ❌ NO pause/resume 任务控制（v0.2 只做 cancel）
- ❌ NO 团队/多用户功能
- ❌ NO PDF 导出
- ❌ NO 跨平台验证（v0.2 Windows-first）
- ❌ NO CI/CD 集成
- ❌ NO 触摸 electron-bridge-mcp 包（已正常工作）
- ❌ NO 新增模板引擎依赖（HTML 报告用模板字符串）
- ❌ NO API Key 服务器端存储（v0.2 用 localStorage，个人优先）
- ❌ NO AI slop: excessive comments, over-abstraction, generic names

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (v0.1 已搭建 Vitest)
- **Automated tests**: YES (TDD)
- **Framework**: Vitest 3.2.4
- **If TDD**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 解锁核心链路):
├── Task 1: Schema 更新 (llmModel 放宽 + 新字段) [quick]
├── Task 2: @playwright/mcp 依赖安装 + 类型定义 [quick]
├── Task 3: Graph DI 重构 — createTestGraph(options) [deep]
├── Task 4: LLM Provider 初始化 (llm.ts) [quick]
├── Task 5: MCP Client 真实化 (stdio 进程) [deep]
└── Task 6: Worker JSON-RPC Bridge (worker-entry.ts) [deep]

Wave 2 (Core Pipeline — AI 真正跑起来):
├── Task 7: Wire generateObject into plan/verify nodes (depends: 3, 4) [deep]
├── Task 8: 截图捕获 in execute node (depends: 5) [quick]
├── Task 9: E2E 测试: fixture app + real LLM + real MCP (depends: 6, 7, 8) [deep]
└── Task 10: Dashboard 设置页 (depends: 1) [visual-engineering]

Wave 3 (UX — Dashboard 功能补齐):
├── Task 11: 截图查看 — TaskDetail/LiveMonitor 展示 (depends: 8) [visual-engineering]
├── Task 12: HTML 报告生成 + 下载端点 (depends: 8) [unspecified-high]
├── Task 13: 任务取消 API + Dashboard UI (depends: 6) [unspecified-high]
└── Task 14: Dashboard 导航 + 路由更新 (depends: 10, 11) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: T1 → T3 → T7 → T9 → F1-F4
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 6 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 4, 10 | 1 |
| 2 | — | 5, 8 | 1 |
| 3 | — | 7 | 1 |
| 4 | — | 7 | 1 |
| 5 | 2 | 8 | 1 |
| 6 | — | 9, 13 | 1 |
| 7 | 3, 4 | 9 | 2 |
| 8 | 5 | 9, 11, 12 | 2 |
| 9 | 6, 7, 8 | F1-F4 | 2 |
| 10 | 1 | 14 | 2 |
| 11 | 8 | 14 | 3 |
| 12 | 8 | — | 3 |
| 13 | 6 | — | 3 |
| 14 | 10, 11 | F1-F4 | 3 |

### Agent Dispatch Summary

- **Wave 1**: 6 tasks — T1 `quick`, T2 `quick`, T3 `deep`, T4 `quick`, T5 `deep`, T6 `deep`
- **Wave 2**: 4 tasks — T7 `deep`, T8 `quick`, T9 `deep`, T10 `visual-engineering`
- **Wave 3**: 4 tasks — T11 `visual-engineering`, T12 `unspecified-high`, T13 `unspecified-high`, T14 `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Schema 更新 — llmModel 放宽 + 新字段

  **What to do**:
  - 修改 `packages/shared-types/src/task.ts`: `llmModel` 从 `z.enum([...])` 改为 `z.string().min(1)`
  - 添加可选字段: `llmBaseUrl: z.string().url().optional()`, `llmApiKey: z.string().optional()`
  - 更新 `packages/shared-types/src/__tests__/schemas.test.ts` 相关测试
  - 确保现有 450 测试不回归

  **Must NOT do**:
  - 不要删除现有的模型枚举值测试，改为测试 string 类型
  - 不要修改其他 schema

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2-T6)
  - **Blocks**: T4, T10
  - **Blocked By**: None

  **References**:
  - `packages/shared-types/src/task.ts:15` — 当前 llmModel 枚举定义
  - `packages/shared-types/src/__tests__/schemas.test.ts` — 现有 schema 测试

  **Acceptance Criteria**:
  - [ ] `llmModel` 接受任意非空字符串（如 "deepseek-chat", "qwen-plus"）
  - [ ] `llmBaseUrl` 可选，必须是合法 URL
  - [ ] `llmApiKey` 可选，字符串类型
  - [ ] `pnpm test packages/shared-types` → PASS

  **QA Scenarios**:
  ```
  Scenario: Schema accepts custom model names
    Tool: Bash
    Steps:
      1. Run `pnpm test packages/shared-types`
      2. Assert all tests pass including new test for "deepseek-chat" model
    Expected Result: Custom model names accepted by schema
    Evidence: .sisyphus/evidence/v2-task1-schema.txt

  Scenario: Existing tests still pass
    Tool: Bash
    Steps:
      1. Run `pnpm test` (full suite)
      2. Assert 0 failures
    Expected Result: No regression from schema change
    Evidence: .sisyphus/evidence/v2-task1-regression.txt
  ```

  **Commit**: YES
  - Message: `refactor(types): relax llmModel enum, add llmBaseUrl/llmApiKey fields`
  - Files: `packages/shared-types/src/task.ts`, `packages/shared-types/src/__tests__/schemas.test.ts`

- [x] 2. @playwright/mcp 依赖安装 + 类型定义

  **What to do**:
  - 在 `packages/agent-core/package.json` 添加 `@playwright/mcp` 依赖
  - 在 `packages/agent-core/package.json` 添加 `@modelcontextprotocol/sdk` 依赖（如未有）
  - 运行 `pnpm install` 确认安装成功
  - 创建 `packages/agent-core/src/mcp/types.ts` — MCP 工具类型定义（如果需要）

  **Must NOT do**:
  - 不要修改 MCP client 逻辑（T5 的事）
  - 不要安装 @playwright/test（不需要完整 Playwright）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T5, T8
  - **Blocked By**: None

  **References**:
  - `packages/agent-core/package.json` — 当前依赖列表
  - `packages/electron-bridge-mcp/package.json` — 参考 MCP SDK 版本

  **Acceptance Criteria**:
  - [ ] `@playwright/mcp` 在 agent-core 的 dependencies 中
  - [ ] `pnpm install` 成功
  - [ ] `import { createServer } from '@playwright/mcp'` 或类似导入不报错

  **QA Scenarios**:
  ```
  Scenario: Dependencies install correctly
    Tool: Bash
    Steps:
      1. Run `pnpm install`
      2. Assert exit code 0
      3. Assert `packages/agent-core/node_modules/@playwright/mcp` exists
    Expected Result: New dependencies installed without conflicts
    Evidence: .sisyphus/evidence/v2-task2-deps.txt
  ```

  **Commit**: YES
  - Message: `chore(deps): add @playwright/mcp dependency to agent-core`
  - Files: `packages/agent-core/package.json`, `pnpm-lock.yaml`

- [x] 3. Graph DI 重构 — createTestGraph(options)

  **What to do**:
  - 定义 `GraphOptions` 接口: `{ plan?: PlanNodeOptions, verify?: VerifyNodeOptions, execute?: ExecuteNodeOptions }`
  - 修改 `packages/agent-core/src/graph.ts`: `createTestGraph(options?: GraphOptions)`
  - 将 `options.plan` 传入 `createPlanNode(options?.plan ?? {})`
  - 将 `options.verify` 传入 `createVerifyNode(options?.verify ?? {})`
  - 修改 `packages/agent-core/src/runner.ts`: 传递 LLM options 到 `createTestGraph()`
  - 修改 `packages/agent-core/src/cli.ts`: 传递 LLM options 到 `createTestGraph()`
  - 更新所有测试中 `createTestGraph()` 调用（无参数仍可工作）
  - 使用 `lsp_find_references` 找到所有 `createTestGraph` 调用点

  **Must NOT do**:
  - 不要破坏现有测试（无参数调用必须仍可工作）
  - 不要修改 observe/execute/abort/report 节点的签名（只改 plan/verify）
  - 不要引入全局单例

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - 需要仔细追踪所有调用点，确保不遗漏

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T7
  - **Blocked By**: None

  **References**:
  - `packages/agent-core/src/graph.ts` — `createTestGraph()` 函数（当前无参数）
  - `packages/agent-core/src/nodes/plan.ts` — `createPlanNode(options)` 工厂函数
  - `packages/agent-core/src/nodes/verify.ts` — `createVerifyNode(options)` 工厂函数
  - `packages/agent-core/src/runner.ts` — 调用 `createTestGraph()`
  - `packages/agent-core/src/cli.ts` — 调用 `createTestGraph()`
  - `packages/agent-core/src/__tests__/graph.test.ts` — 现有图测试
  - `tests/e2e/full-test-cycle.test.ts` — E2E 中的 `createTestGraph()` 调用
  - `tests/e2e/crash-recovery.test.ts` — E2E 中的 `createTestGraph()` 调用
  - `tests/e2e/report-parallel.test.ts` — 不直接使用 createTestGraph，但引用 report graph

  **Acceptance Criteria**:
  - [ ] `createTestGraph()` 无参数调用仍可工作（向后兼容）
  - [ ] `createTestGraph({ plan: { generateObject: mockFn } })` 注入 mock 成功
  - [ ] 所有现有 450 测试仍通过
  - [ ] 新增测试: 验证 options 注入到 plan/verify 节点

  **QA Scenarios**:
  ```
  Scenario: DI options propagate to nodes
    Tool: Bash
    Steps:
      1. Run `pnpm test packages/agent-core`
      2. Assert new DI injection test passes
      3. Run `pnpm test` (full suite)
      4. Assert 0 regressions
    Expected Result: Options correctly injected, no regression
    Evidence: .sisyphus/evidence/v2-task3-graph-di.txt
  ```

  **Commit**: YES
  - Message: `refactor(agent): parameterize createTestGraph with GraphOptions DI`
  - Files: `packages/agent-core/src/graph.ts`, `runner.ts`, `cli.ts`, tests

- [x] 4. LLM Provider 初始化 (llm.ts)

  **What to do**:
  - 创建 `packages/agent-core/src/llm.ts`:
    - `createLLMProvider(config?)` — 使用 `createOpenAI({ apiKey, baseURL })` 初始化
    - 读取环境变量: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `LLM_MODEL`
    - 导出 `getGenerateObject(config?)` — 返回绑定 provider 的 `generateObject` 函数
    - 支持无 API Key 时的 graceful fallback（返回 deterministic mock，保持向后兼容）
  - 写测试: env var 读取、provider 创建、fallback 行为

  **Must NOT do**:
  - 不要硬编码 API endpoint
  - 不要在模块加载时自动调用 createOpenAI（延迟到使用时）
  - 不要引入多余的 provider 抽象层

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T7
  - **Blocked By**: None

  **References**:
  - Vercel AI SDK docs: `import { createOpenAI } from '@ai-sdk/openai'`
  - `packages/agent-core/src/nodes/plan.ts` — 已有 `generateObject` 参数的 DI 接口
  - 环境变量模式: `process.env.OPENAI_API_KEY`, `process.env.OPENAI_BASE_URL`, `process.env.LLM_MODEL`

  **Acceptance Criteria**:
  - [ ] `createLLMProvider({ apiKey: 'sk-test' })` 返回有效 provider
  - [ ] `getGenerateObject()` 无 key 时返回 fallback mock
  - [ ] 环境变量正确读取和覆盖
  - [ ] `pnpm test packages/agent-core/src/__tests__/llm.test.ts` → PASS

  **QA Scenarios**:
  ```
  Scenario: LLM provider with API key
    Tool: Bash
    Steps:
      1. Run test with OPENAI_API_KEY set
      2. Assert provider created with correct base URL
      3. Assert generateObject function returned
    Expected Result: Provider initialized from env vars
    Evidence: .sisyphus/evidence/v2-task4-llm.txt

  Scenario: Fallback without API key
    Tool: Bash
    Steps:
      1. Run test without OPENAI_API_KEY
      2. Assert deterministic mock returned
      3. Assert mock generateObject returns valid structure
    Expected Result: Graceful degradation to mock
    Evidence: .sisyphus/evidence/v2-task4-llm-fallback.txt
  ```

  **Commit**: YES
  - Message: `feat(llm): add LLM provider initialization service`
  - Files: `packages/agent-core/src/llm.ts`, `packages/agent-core/src/__tests__/llm.test.ts`

- [x] 5. MCP Client 真实化 (stdio 进程)

  **What to do**:
  - 重写 `packages/agent-core/src/mcp/client.ts`:
    - `MCPClient` 真实实现: spawn `@playwright/mcp` 和 `electron-bridge-mcp` 作为 stdio 子进程
    - 实现 MCP 协议握手: initialize → initialized → tool calls
    - `callTool(server, toolName, args)` 通过 MCP 协议发送真实请求
    - `connect(servers)` 启动指定 MCP 服务器子进程
    - `disconnect()` 关闭子进程
    - 保持向后兼容: 无参数 `connect()` 仍返回 mock/disconnected 状态
  - 写测试: mock child_process.spawn, 验证 JSON-RPC 消息格式

  **Must NOT do**:
  - 不要在测试中启动真实 MCP 服务器（mock child_process）
  - 不要修改 `packages/electron-bridge-mcp/`（已正常工作）
  - 不要破坏 E2E 测试中的 `new MCPClient()` 用法

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - MCP 协议实现需要仔细处理 stdio 通信

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T8
  - **Blocked By**: T2 (依赖安装)

  **References**:
  - `packages/agent-core/src/mcp/client.ts` — 当前 mock 实现
  - `packages/electron-bridge-mcp/src/server.ts` — MCP server 实现（参考协议）
  - `@modelcontextprotocol/sdk` Client class — MCP 客户端 SDK
  - `@playwright/mcp` — Playwright MCP server binary

  **Acceptance Criteria**:
  - [ ] `MCPClient` 可以 spawn 子进程并通过 stdio 通信
  - [ ] `callTool('playwright', 'browser_snapshot', {})` 通过 MCP 协议发送
  - [ ] 现有 E2E 测试中 `new MCPClient()` + `connect({})` 仍可工作（mock 模式）
  - [ ] 新增测试: 验证 JSON-RPC 消息格式正确
  - [ ] `pnpm test packages/agent-core` → PASS

  **QA Scenarios**:
  ```
  Scenario: MCP client spawns and communicates
    Tool: Bash
    Steps:
      1. Run `pnpm test packages/agent-core/src/__tests__/mcp-client.test.ts`
      2. Assert spawn called with correct binary
      3. Assert JSON-RPC initialize message sent
    Expected Result: MCP client correctly manages child process
    Evidence: .sisyphus/evidence/v2-task5-mcp.txt

  Scenario: Backward compatibility with mock mode
    Tool: Bash
    Steps:
      1. Run existing E2E tests
      2. Assert all 15 E2E tests still pass
    Expected Result: No regression from MCP client rewrite
    Evidence: .sisyphus/evidence/v2-task5-regression.txt
  ```

  **Commit**: YES
  - Message: `feat(mcp): implement real stdio MCP client`
  - Files: `packages/agent-core/src/mcp/client.ts`, tests

- [x] 6. Worker JSON-RPC Bridge (worker-entry.ts)

  **What to do**:
  - 创建 `packages/agent-core/src/worker-entry.ts`:
    - 从命令行参数读取 taskId, goal, targetAppPath 等
    - 包装 `runTest()` 调用，拦截 LangGraph 执行过程
    - stdout 输出 JSON-RPC 通知: `step_start`, `step_complete`, `heartbeat`, `task_end`, `error`
    - stdin 监听 JSON-RPC 控制消息: `cancel`
    - 心跳: 每 2s 发送 `{"jsonrpc":"2.0","method":"heartbeat"}`
    - SIGINT 处理: 优雅退出
  - 修改 `apps/server/src/services/workerManager.ts`: RUNNER_SCRIPT 指向 `worker-entry.ts`
  - 写测试: 验证 JSON-RPC 消息格式、cancel 响应、心跳间隔

  **Must NOT do**:
  - 不要实现 pause/resume（v0.2 只做 cancel）
  - 不要修改 runner.ts 的核心逻辑（只添加桥接层）
  - 不要使用复杂的进程间通信（只用 stdin/stdout）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - 进程通信 + JSON-RPC 协议需要仔细实现

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T9, T13
  - **Blocked By**: None

  **References**:
  - `apps/server/src/services/workerManager.ts` — Worker 管理器（JSON-RPC 解析逻辑）
  - `packages/agent-core/src/runner.ts` — 当前 runner 入口
  - `packages/shared-types/src/ipc.ts` — JSON-RPC 消息 schema
  - Worker 协议: `step_start`, `step_complete`, `heartbeat`, `task_end`, `error`, `cancel`

  **Acceptance Criteria**:
  - [ ] `tsx packages/agent-core/src/worker-entry.ts --task-id test-1 --goal "test" --target-app ./fixtures/test-electron-app` 启动并发送心跳
  - [ ] 收到 `cancel` 命令后优雅退出
  - [ ] stdout 输出格式为合法 JSON-RPC 消息
  - [ ] `pnpm test packages/agent-core/src/__tests__/worker-entry.test.ts` → PASS

  **QA Scenarios**:
  ```
  Scenario: Worker emits JSON-RPC notifications
    Tool: Bash
    Steps:
      1. Run worker-entry.ts with test args (no real LLM)
      2. Assert stdout contains heartbeat messages
      3. Assert heartbeat format: {"jsonrpc":"2.0","method":"heartbeat"}
    Expected Result: Worker bridge correctly emits notifications
    Evidence: .sisyphus/evidence/v2-task6-worker.txt

  Scenario: Worker responds to cancel
    Tool: Bash
    Steps:
      1. Start worker, send cancel via stdin
      2. Assert worker exits gracefully
      3. Assert task_end notification emitted before exit
    Expected Result: Cancel command processed correctly
    Evidence: .sisyphus/evidence/v2-task6-worker-cancel.txt
  ```

  **Commit**: YES
  - Message: `feat(worker): add JSON-RPC bridge (worker-entry.ts)`
  - Files: `packages/agent-core/src/worker-entry.ts`, `apps/server/src/services/workerManager.ts`, tests

- [x] 7. Wire generateObject into plan/verify nodes

  **What to do**:
  - 修改 `packages/agent-core/src/runner.ts`:
    - 调用 `getGenerateObject()` 获取真实或 fallback 的 generateObject
    - 传递给 `createTestGraph({ plan: { generateObject }, verify: { generateObject } })`
  - 修改 `packages/agent-core/src/cli.ts`:
    - 同样传递 generateObject
  - 修改 `packages/agent-core/src/nodes/plan.ts`:
    - 当有真实 generateObject 时，调用 LLM 生成 PlanResult
    - 保持 fallback 行为（无 LLM 时返回确定性结果）
  - 修改 `packages/agent-core/src/nodes/verify.ts`:
    - 当有真实 generateObject 时，调用 LLM 生成 VerdictResult
    - 保持 fallback 行为
  - 写测试: mock generateObject → 验证注入成功 → 验证 LLM 调用参数正确

  **Must NOT do**:
  - 不要删除 fallback 逻辑（无 API Key 时仍需工作）
  - 不要在节点中直接 import @ai-sdk/openai（通过 DI 注入）
  - 不要修改 observe/execute 节点（observe 用 MCP，execute 确定性）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T3 + T4)
  - **Parallel Group**: Wave 2
  - **Blocks**: T9
  - **Blocked By**: T3 (Graph DI), T4 (LLM provider)

  **References**:
  - `packages/agent-core/src/llm.ts` — T4 创建的 LLM provider
  - `packages/agent-core/src/graph.ts` — T3 重构后的 createTestGraph(options)
  - `packages/agent-core/src/nodes/plan.ts` — createPlanNode 工厂，已有 options.generateObject
  - `packages/agent-core/src/nodes/verify.ts` — createVerifyNode 工厂，已有 options.generateObject
  - `packages/agent-core/src/runner.ts` — 调用 createTestGraph
  - `packages/agent-core/src/__tests__/nodes/plan.test.ts` — 现有 plan 节点测试（参考 DI mock 模式）

  **Acceptance Criteria**:
  - [ ] `runner.ts` 传递真实 generateObject 到 createTestGraph
  - [ ] `cli.ts` 传递真实 generateObject 到 createTestGraph
  - [ ] 有 API Key 时 plan 节点调用 LLM
  - [ ] 无 API Key 时 plan 节点返回确定性 fallback
  - [ ] 有 API Key 时 verify 节点调用 LLM
  - [ ] 无 API Key 时 verify 节点返回确定性 fallback
  - [ ] `pnpm test packages/agent-core` → PASS (含新增测试)

  **QA Scenarios**:
  ```
  Scenario: Real generateObject injected into graph
    Tool: Bash
    Steps:
      1. Run test with mock generateObject
      2. Assert plan node calls generateObject with correct schema
      3. Assert verify node calls generateObject with correct schema
    Expected Result: DI wiring works correctly
    Evidence: .sisyphus/evidence/v2-task7-wire.txt

  Scenario: Fallback without API key
    Tool: Bash
    Steps:
      1. Run graph without OPENAI_API_KEY
      2. Assert graph still completes (deterministic fallback)
      3. Assert no LLM calls attempted
    Expected Result: Graceful degradation
    Evidence: .sisyphus/evidence/v2-task7-fallback.txt
  ```

  **Commit**: YES
  - Message: `feat(agent): wire real generateObject into plan/verify nodes`
  - Files: `packages/agent-core/src/runner.ts`, `cli.ts`, `nodes/plan.ts`, `nodes/verify.ts`, tests

- [x] 8. 截图捕获 in execute node

  **What to do**:
  - 修改 `packages/agent-core/src/nodes/execute.ts`:
    - execute 完成后调用 MCP `callTool('playwright', 'browser_screenshot', {})` 或 Playwright page.screenshot()
    - 保存截图到 `data/reports/{taskId}/screenshots/step-{N}-execute.png`
    - 设置 `state.currentExecResult.screenshot` 为截图路径
  - 确保截图目录在执行前创建
  - 写测试: mock MCP callTool 返回 screenshot buffer

  **Must NOT do**:
  - 不要在 observe 节点截图（v0.2 只在 execute 截图）
  - 不要用 Playwright 直接 API（通过 MCP callTool）
  - 不要硬编码截图路径（用 dataDir 配置）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T5)
  - **Parallel Group**: Wave 2
  - **Blocks**: T9, T11, T12
  - **Blocked By**: T5 (MCP client)

  **References**:
  - `packages/agent-core/src/nodes/execute.ts` — 当前 execute 节点（确定性）
  - `packages/shared-types/src/agent-state.ts` — ExecResultSchema 有 `screenshot?: string`
  - `packages/agent-core/src/mcp/client.ts` — MCP callTool 接口

  **Acceptance Criteria**:
  - [ ] execute 节点执行后调用 screenshot
  - [ ] 截图保存到 `data/reports/{taskId}/screenshots/` 目录
  - [ ] `state.currentExecResult.screenshot` 设置为文件路径
  - [ ] MCP 断开时不崩溃（优雅跳过截图）
  - [ ] `pnpm test packages/agent-core` → PASS

  **QA Scenarios**:
  ```
  Scenario: Screenshot captured after execution
    Tool: Bash
    Steps:
      1. Run execute node test with mock MCP
      2. Assert callTool called with screenshot tool
      3. Assert screenshot path set in result
    Expected Result: Screenshot captured and path recorded
    Evidence: .sisyphus/evidence/v2-task8-screenshot.txt
  ```

  **Commit**: YES
  - Message: `feat(agent): add screenshot capture in execute node`
  - Files: `packages/agent-core/src/nodes/execute.ts`, tests

- [x] 9. E2E 测试: fixture app + real LLM + real MCP

  **What to do**:
  - 创建 `tests/e2e/real-llm.test.ts`:
    - 测试用例需要 `OPENAI_API_KEY` 环境变量
    - 如无 key，测试 skip（使用 `describe.skipIf`）
    - 测试完整链路: 创建任务 → 启动 fixture app → AI loop 执行 → 验证结果
    - 验证: manifest.json 创建, timeline.jsonl 有记录, 截图文件存在
  - 测试内容: "Click the Settings button" 简单目标
  - 超时设置: 60s（LLM 调用可能较慢）

  **Must NOT do**:
  - 不要在无 API key 时让测试失败（skip）
  - 不要测试复杂场景（简单点击即可）
  - 不要 mock LLM（这个测试就是验证真实 LLM）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T6, T7, T8)
  - **Parallel Group**: Wave 2
  - **Blocks**: F1-F4
  - **Blocked By**: T6 (Worker bridge), T7 (LLM wire), T8 (Screenshot)

  **References**:
  - `tests/e2e/full-test-cycle.test.ts` — v0.1 E2E 测试参考
  - `packages/agent-core/src/llm.ts` — LLM provider
  - `packages/agent-core/src/mcp/client.ts` — 真实 MCP 客户端
  - `fixtures/test-electron-app/` — fixture app

  **Acceptance Criteria**:
  - [ ] 有 OPENAI_API_KEY 时测试通过
  - [ ] 无 key 时测试 skip（不 fail）
  - [ ] 现有 450 测试不回归

  **QA Scenarios**:
  ```
  Scenario: Real LLM E2E test passes or skips
    Tool: Bash
    Steps:
      1. Run `npx vitest run --config tests/e2e/vitest.config.ts tests/e2e/real-llm.test.ts`
      2. Assert exit code 0 (pass or skip)
    Expected Result: Test passes with key, skips without
    Evidence: .sisyphus/evidence/v2-task9-e2e.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): add real LLM + real MCP integration test`
  - Files: `tests/e2e/real-llm.test.ts`

- [x] 10. Dashboard 设置页

  **What to do**:
  - 创建 `apps/dashboard/src/pages/Settings.tsx`:
    - LLM API Key 输入框（password 类型，可切换可见）
    - Base URL 输入框（默认 https://api.openai.com/v1）
    - Model 输入框（自由文本，默认 gpt-4o）
    - 保存到 localStorage（key: 'eata-settings'）
    - 页面加载时从 localStorage 读取
    - 测试连接按钮（可选：调用 /api/health 验证 server 连接）
  - 更新 `apps/dashboard/src/App.tsx`: 添加 `/settings` 路由
  - 更新 `apps/dashboard/src/components/Layout.tsx`: 侧边栏添加设置链接
  - 写测试: 渲染、输入、保存、读取

  **Must NOT do**:
  - 不要添加服务器端存储（v0.2 localStorage 足够）
  - 不要过度设计设置页面（简洁表单即可）
  - 不要在设置页配置 MCP 路径（v0.2 不需要）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-interface-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T7-T9)
  - **Blocks**: T14
  - **Blocked By**: T1 (schema 更新)

  **References**:
  - `apps/dashboard/src/App.tsx` — 当前路由配置
  - `apps/dashboard/src/components/Layout.tsx` — 侧边栏导航
  - `apps/dashboard/src/stores/uiStore.ts` — UI 状态管理
  - Dashboard 风格: Tailwind CSS + zinc-900/950 背景 + indigo-600 强调色

  **Acceptance Criteria**:
  - [ ] `/settings` 路由可访问
  - [ ] 表单可以输入和保存 LLM 配置
  - [ ] 刷新页面后配置仍在（localStorage）
  - [ ] 侧边栏有设置入口
  - [ ] `pnpm test apps/dashboard` → PASS

  **QA Scenarios**:
  ```
  Scenario: Settings page saves and loads configuration
    Tool: Bash
    Steps:
      1. Run settings page test
      2. Assert form renders with default values
      3. Assert save stores to localStorage
      4. Assert page reload reads from localStorage
    Expected Result: Settings persist across page loads
    Evidence: .sisyphus/evidence/v2-task10-settings.txt
  ```

  **Commit**: YES
  - Message: `feat(ui): add Settings page with LLM configuration`
  - Files: `apps/dashboard/src/pages/Settings.tsx`, `App.tsx`, `Layout.tsx`, tests

- [x] 11. 截图查看 — TaskDetail/LiveMonitor 展示

  **What to do**:
  - 修改 `apps/dashboard/src/pages/TaskDetail.tsx`:
    - 截图画廊: 显示每步骤截图缩略图
    - 点击缩略图 → 弹出大图预览（Radix Dialog）
    - 从 `/api/tasks/:id/steps/:stepIndex/screenshot` 获取截图
  - 修改 `apps/dashboard/src/components/ScreenshotGallery.tsx`:
    - 接受 steps 数组，过滤有 screenshotPath 的步骤
    - 网格布局展示缩略图
  - 添加截图 API 端点: `GET /api/tasks/:id/steps/:stepIndex/screenshot` 返回 PNG
  - 写测试: 组件渲染、API 端点

  **Must NOT do**:
  - 不要添加截图对比功能（推到 v0.3）
  - 不要在 LiveMonitor 实时流截图（v0.2 只在 TaskDetail 查看已完成截图）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-interface-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T14
  - **Blocked By**: T8 (截图捕获)

  **References**:
  - `apps/dashboard/src/pages/TaskDetail.tsx` — 当前详情页
  - `apps/dashboard/src/components/ScreenshotGallery.tsx` — 当前截图组件（可能是占位）
  - `apps/dashboard/src/__tests__/ScreenshotGallery.test.tsx` — 现有测试
  - `apps/server/src/routes/reports.ts` — 报告路由（添加截图端点）

  **Acceptance Criteria**:
  - [ ] TaskDetail 页面显示截图缩略图网格
  - [ ] 点击缩略图弹出大图
  - [ ] `GET /api/tasks/:id/steps/:stepIndex/screenshot` 返回 PNG
  - [ ] 无截图时显示占位符
  - [ ] `pnpm test` → PASS

  **QA Scenarios**:
  ```
  Scenario: Screenshots displayed in task detail
    Tool: Bash
    Steps:
      1. Run ScreenshotGallery test
      2. Assert thumbnails render from step data
      3. Assert click opens dialog with full image
    Expected Result: Screenshot viewing works
    Evidence: .sisyphus/evidence/v2-task11-screenshots.txt
  ```

  **Commit**: YES
  - Message: `feat(ui): add screenshot viewing in TaskDetail/LiveMonitor`
  - Files: `apps/dashboard/src/pages/TaskDetail.tsx`, `components/ScreenshotGallery.tsx`, `apps/server/src/routes/reports.ts`, tests

- [x] 12. HTML 报告生成 + 下载端点

  **What to do**:
  - 创建 `apps/server/src/services/htmlReport.ts`:
    - `generateHTMLReport(task, steps)` — 从 manifest + timeline 生成 HTML 字符串
    - 使用模板字符串插值（不引入模板引擎）
    - 包含: 任务概要、步骤时间线（带状态颜色）、截图引用、LLM 思考过程
    - 内联 CSS（深色主题，匹配 Dashboard 风格）
  - 添加路由: `GET /api/tasks/:id/report/html` — 返回 `text/html`
  - 修改 `apps/dashboard/src/pages/TaskDetail.tsx`: 添加 "Download HTML Report" 按钮
  - 写测试: HTML 生成、API 端点

  **Must NOT do**:
  - 不要引入 Handlebars/EJS/Pug 等模板引擎
  - 不要生成 PDF（v0.2 只做 HTML）
  - 不要接入 report-graph（v0.2 只用 manifest+timeline 数据）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T8 (需要截图路径数据)

  **References**:
  - `apps/server/src/services/reportService.ts` — 现有报告服务
  - `apps/server/src/routes/reports.ts` — 现有报告路由
  - `apps/dashboard/src/pages/TaskDetail.tsx` — 报告查看页面

  **Acceptance Criteria**:
  - [ ] `GET /api/tasks/:id/report/html` 返回有效 HTML
  - [ ] HTML 包含任务概要、步骤时间线、截图引用
  - [ ] Dashboard 有下载按钮
  - [ ] `pnpm test apps/server` → PASS

  **QA Scenarios**:
  ```
  Scenario: HTML report generated correctly
    Tool: Bash
    Steps:
      1. Create test task with steps
      2. Call GET /api/tasks/{id}/report/html
      3. Assert response content-type is text/html
      4. Assert HTML contains task goal, step timeline
    Expected Result: Valid HTML report generated from data
    Evidence: .sisyphus/evidence/v2-task12-html-report.txt
  ```

  **Commit**: YES
  - Message: `feat(reports): add HTML report generation + download endpoint`
  - Files: `apps/server/src/services/htmlReport.ts`, `apps/server/src/routes/reports.ts`, `apps/dashboard/src/pages/TaskDetail.tsx`, tests

- [x] 13. 任务取消 API + Dashboard UI

  **What to do**:
  - 添加路由: `POST /api/tasks/:id/cancel`:
    - 调用 WorkerManager 发送 cancel 控制消息
    - 更新任务状态为 'cancelled'
    - 发送 SSE 事件通知 Dashboard
  - 修改 `apps/dashboard/src/pages/TaskList.tsx`:
    - 运行中的任务显示 "Cancel" 按钮
    - 点击后确认对话框 → 调用 cancel API
  - 修改 `apps/dashboard/src/pages/LiveMonitor.tsx`:
    - 添加 "Cancel Task" 按钮
  - 写测试: cancel 端点、WorkerManager cancel 逻辑

  **Must NOT do**:
  - 不要实现 pause/resume（v0.2 只做 cancel）
  - 不要修改 Worker JSON-RPC 协议（cancel 命令在 T6 已定义）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T6 (Worker bridge 的 cancel 命令)

  **References**:
  - `apps/server/src/routes/tasks.ts` — 当前任务路由
  - `apps/server/src/services/workerManager.ts` — Worker 管理（cancel 逻辑）
  - `apps/dashboard/src/pages/TaskList.tsx` — 任务列表页
  - `apps/dashboard/src/pages/LiveMonitor.tsx` — 实时监控页
  - `packages/shared-types/src/ipc.ts` — cancel 控制消息格式

  **Acceptance Criteria**:
  - [ ] `POST /api/tasks/:id/cancel` → 200 + 任务状态变为 'cancelled'
  - [ ] Dashboard 任务列表有 Cancel 按钮（仅 running 状态）
  - [ ] LiveMonitor 有 Cancel Task 按钮
  - [ ] SSE 事件通知任务取消
  - [ ] `pnpm test` → PASS

  **QA Scenarios**:
  ```
  Scenario: Task cancel API works
    Tool: Bash
    Steps:
      1. Create a task, start it (mock worker)
      2. Call POST /api/tasks/{id}/cancel
      3. Assert 200 response
      4. Assert task status is 'cancelled'
    Expected Result: Task cancellation works end-to-end
    Evidence: .sisyphus/evidence/v2-task13-cancel.txt
  ```

  **Commit**: YES
  - Message: `feat(tasks): add task cancel API + Dashboard UI`
  - Files: `apps/server/src/routes/tasks.ts`, `apps/dashboard/src/pages/TaskList.tsx`, `LiveMonitor.tsx`, tests

- [x] 14. Dashboard 导航 + 路由更新

  **What to do**:
  - 更新 `apps/dashboard/src/App.tsx`:
    - 添加 `/settings` 路由（指向 Settings 页面）
    - 添加 404 catch-all 路由
  - 更新 `apps/dashboard/src/components/Layout.tsx`:
    - 侧边栏添加设置图标/链接
    - 高亮当前路由
  - 确保 Dashboard build 无错误

  **Must NOT do**:
  - 不要添加其他新路由（v0.2 不需要）
  - 不要修改现有路由结构

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T10, T11)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: T10 (Settings page), T11 (Screenshots in TaskDetail)

  **References**:
  - `apps/dashboard/src/App.tsx` — 当前路由配置
  - `apps/dashboard/src/components/Layout.tsx` — 侧边栏

  **Acceptance Criteria**:
  - [ ] `/settings` 路由可访问
  - [ ] 未知路由显示 404
  - [ ] 侧边栏高亮当前路由
  - [ ] `pnpm build --filter dashboard` → 成功

  **QA Scenarios**:
  ```
  Scenario: Dashboard routes work correctly
    Tool: Bash
    Steps:
      1. Run `pnpm build --filter dashboard`
      2. Assert build succeeds
    Expected Result: Dashboard builds with new routes
    Evidence: .sisyphus/evidence/v2-task14-routes.txt
  ```

  **Commit**: YES
  - Message: `feat(ui): update Dashboard navigation and routing`
  - Files: `apps/dashboard/src/App.tsx`, `Layout.tsx`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle` (CONDITIONAL APPROVE - fixes applied)
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high` (Tests 509/509, 0 `as any`, code clean)
- [x] F3. **Real Manual QA** — `unspecified-high` (5/5 scenarios pass, APPROVE)
- [x] F4. **Scope Fidelity Check** — `deep` (14/14 tasks compliant, no scope creep, APPROVE)
  For each task: verify 1:1 — everything in spec was built, nothing beyond spec. Check "Must NOT do" compliance.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **T1**: `refactor(types): relax llmModel enum, add llmBaseUrl/llmApiKey fields`
- **T2**: `chore(deps): add @playwright/mcp dependency`
- **T3**: `refactor(agent): parameterize createTestGraph with GraphOptions DI`
- **T4**: `feat(llm): add LLM provider initialization service`
- **T5**: `feat(mcp): implement real stdio MCP client`
- **T6**: `feat(worker): add JSON-RPC bridge (worker-entry.ts)`
- **T7**: `feat(agent): wire real generateObject into plan/verify nodes`
- **T8**: `feat(agent): add screenshot capture in execute node`
- **T9**: `test(e2e): add real LLM + real MCP integration test`
- **T10**: `feat(ui): add Settings page with LLM configuration`
- **T11**: `feat(ui): add screenshot viewing in TaskDetail/LiveMonitor`
- **T12**: `feat(reports): add HTML report generation + download endpoint`
- **T13**: `feat(tasks): add task cancel API + Dashboard UI`
- **T14**: `feat(ui): update Dashboard navigation and routing`

---

## Success Criteria

### Verification Commands
```bash
pnpm install                    # Expected: 0 errors
pnpm test                       # Expected: all tests pass (450+ existing + new)
# Real LLM E2E (requires OPENAI_API_KEY)
OPENAI_API_KEY=sk-xxx npx vitest run tests/e2e/real-llm.test.ts  # Expected: pass
# Dashboard
pnpm dev                        # Expected: Dashboard :5173, Fastify :3000
# Settings page
curl http://localhost:5173/settings  # Expected: HTML with settings form
# HTML report
curl http://localhost:3000/api/tasks/{id}/report/html  # Expected: valid HTML
```

### Final Checklist
- [x] All "Must Have" items present and verified
- [x] All "Must NOT Have" items absent
- [x] All tests pass (existing 450 + new) → **509 passed, 1 skipped, 0 failures**
- [x] AI loop completes test against fixture app with real LLM
- [x] Dashboard shows real-time test progress + screenshots
- [x] Settings page saves and loads LLM configuration
- [x] HTML report downloadable
- [x] Task cancel works end-to-end
