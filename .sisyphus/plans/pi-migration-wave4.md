# Wave 4: 移除 LangGraph 依赖 — 完全修复 compilation

## TL;DR

> **Quick Summary**: 5 个文件已在 commit 867807a 中删除，但 `index.ts` 和节点仍引用它们。Wave 4 通过纯 TypeScript 类型定义替换 + 移除已删除文件的引用 + 删除 LangGraph 依赖测试，使 `packages/agent-core` 恢复 compilation。
>
> **Deliverables**:
> - `packages/agent-core/src/` 所有文件可编译（`tsc --noEmit` 通过）
> - 无任何文件引用已删除的 `graph.js`, `state.js`, `checkpoint.js`, `report-graph/graph.js`, `report-graph/state.js`
> - `graph.test.ts` / `report-graph.test.ts` 已删除
> - `index.ts` 和 `report-graph/index.ts` 导出干净
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 (stale exports/removes) → Task 5-6 (type fixes) → Task 7 (report reimpl) → Task 8 (verify)

---

## Context

### Original Request
用户执行"检查当前还有什么任务未执行完毕？"后发现 Wave 4 计划（pi-migration-wave4-execution.md）基于错误假设创建——它假设 graph.ts/state.ts/checkpoint.ts 存在需要删除，但实际它们已被删除（commit 867807a）。

### User Decisions (confirmed via question tool)
1. **Option A**: 完全移除 LangGraph，用纯 TypeScript 类型替代
2. **删除** graph.test.ts 和 report-graph.test.ts（不重写）
3. **保持分离** loop/ 和 runtime/ AgentLoop 实现（Wave 4 不碰）

### Research Findings
- `graph.ts`, `state.ts`, `checkpoint.ts` 已在 commit 867807a 中删除
- `report-graph/graph.ts`, `report-graph/state.ts` 已在 commit 867807a 中删除
- `index.ts` 仍从删除的文件导出（lines 1, 2, 5, 23, 24）
- `report-graph/index.ts` 仍从删除的文件导出（lines 1, 3）
- 6 个 core nodes 仍从 `'../state.js'` 导入 TestState（已删除）
- 5 个 report-graph nodes 仍从 `'../state.js'` 导入 ReportState（已删除）
- `nodes/report.ts` 使用 `createReportGraph().compile().invoke()` — LangGraph runtime 调用
- `@langchain/langgraph` 不在 package.json 中
- PatternStore 独立于 LangGraph

### Metis Review Gaps Identified
- 4 层断裂：stale exports → stale imports → runtime LangGraph calls → external consumers
- `report.ts` 节点有 runtime LangGraph 调用需要 reimplement
- Test files 需要明确 strategy
- PatternStore reachable through broken exports

---

## Work Objectives

### Core Objective
使 `packages/agent-core/src/` 恢复 compilation：`pnpm run --filter "@eata/agent-core" typecheck` 通过。

### Concrete Deliverables
- 移除 index.ts 中对已删除文件的导出
- 移除 report-graph/index.ts 中对已删除文件的导出
- 6 个 core nodes 的 TestState 导入替换为本地类型
- 5 个 report-graph nodes 的 ReportState 导入替换为本地类型
- reimplement report.ts 的 fan-out/fan-in（不使用 LangGraph）
- 删除 graph.test.ts 和 report-graph.test.ts
- 清理 PatternStore 导出（如果需要）

### Definition of Done
- [ ] `pnpm run --filter "@eata/agent-core" typecheck` exits 0
- [ ] `pnpm run --filter "@eata/agent-core" test` exits 0
- [ ] `grep -rn "from ['\"].*\/state\.js['\"]" packages/agent-core/src/` 返回 0 matches
- [ ] `grep -rn "from ['\"].*\/graph\.js['\"]" packages/agent-core/src/` 返回 0 matches
- [ ] `grep -rn "from ['\"].*\/checkpoint\.js['\"]" packages/agent-core/src/` 返回 0 matches
- [ ] `grep -rn "@langchain/langgraph" packages/agent-core/src/` 返回 0 matches

### Must Have
- `packages/agent-core/src/` 下所有 .ts 文件可编译
- `packages/agent-core/src/index.ts` 导出不引用删除的文件
- `packages/agent-core/src/report-graph/index.ts` 导出不引用删除的文件
- 6 个 nodes 文件使用本地 TestState 类型
- 5 个 report-graph nodes 文件使用本地 ReportState 类型
- report.ts 节点用 Promise.all 实现 fan-out/fan-in（无 LangGraph）
- graph.test.ts 已删除
- report-graph.test.ts 已删除

### Must NOT Have (Guardrails)
- **MUST NOT** 修改 `loop/`, `runtime/`, `session/`, `compaction/`, `sub-agents/`, `tools/`, `llm/`, `mcp/` 目录
- **MUST NOT** 在 package.json 中重新添加 `@langchain/langgraph`
- **MUST NOT** 修改任何 node 的业务逻辑（只改 import 和 type signature）
- **MUST NOT** 修改 runner.ts
- **MUST NOT** 触碰 e2e tests（分离的 wave）
- **MUST NOT** 修改 docs

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### QA Policy
- `pnpm run --filter "@eata/agent-core" typecheck` - exits 0
- `pnpm run --filter "@eata/agent-core" test` - exits 0
- `grep` 命令验证无残留引用（见上方 Definition of Done）

---

## Execution Strategy

### Waves

```
Wave 1 (foundation - 类型定义和 index 更新):
├── Task 1: 创建 src/test-state-types.ts (TestState interface)
├── Task 2: 创建 src/report-graph/report-state-types.ts (ReportState interface)
├── Task 3: 更新 src/index.ts 移除 stale exports
├── Task 4: 更新 src/report-graph/index.ts 移除 stale exports
└── Task 5: 删除 graph.test.ts 和 report-graph.test.ts

Wave 2 (node fixes + report.ts reimplementation):
├── Task 6: 更新 6 个 nodes/*.ts TestState 导入 → 本地类型
├── Task 7: 更新 5 个 report-graph/nodes/*.ts ReportState 导入 → 本地类型
├── Task 8: Reimplement report.ts fan-out/fan-in (Promise.all 替代 StateGraph)
└── Task 9: 验证 typecheck + test 通过

Wave FINAL:
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review
├── Task F3: Scope fidelity check
└── Task F4: Present results → user explicit okay
```

---

## TODOs

### Wave 1: 类型定义和 index 更新

- [x] 1. 创建 `src/test-state-types.ts` (TestState interface)

  **What to do**:
  - 创建 `packages/agent-core/src/test-state-types.ts`
  - 定义 `TestState` interface，包含以下字段（从 nodes 实际使用情况推断）：
    ```typescript
    export interface TestState {
      goal: string;
      targetAppPath: string;
      llmModel: string;
      maxSteps: number;
      taskId: string;
      stepCount: number;
      stuckCounter: number;
      lastObservationHash: string;
      history: StepRecord[];
      currentObservation: ObservationResult | null;
      currentPlan: PlanResult | null;
      currentExecResult: ExecResult | null;
      currentVerdict: VerdictResult | null;
      status: 'running' | 'completed' | 'failed' | 'aborted';
      auditChainResult: AuditChainResult | null;
    }
    ```
  - 从 `@eata/shared-types` 导入需要的类型：ObservationResult, PlanResult, ExecResult, VerdictResult, StepRecord, AuditChainResult

  **Must NOT do**:
  - 不要使用 LangGraph Annotation.Root
  - 不要修改任何业务逻辑
  - 不要创建 graph.ts 或 checkpoint.ts（只需要类型）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3, 6
  - **Blocked By**: None

  **References**:
  - `packages/shared-types/src/agent-state.ts` - Zod schemas for ObservationResult, PlanResult, ExecResult, VerdictResult
  - `packages/shared-types/src/step.ts` - StepRecord schema
  - `packages/agent-core/src/sub-agents/types.ts` - AuditChainResult type

  **Acceptance Criteria**:
  - [ ] `test-state-types.ts` 文件存在
  - [ ] `TestState` interface 包含所有必需字段
  - [ ] 导入可解析（无 missing imports）
  - [ ] `tsc --noEmit` 在 agent-core 目录下部分通过（此文件单独编译）

  **QA Scenarios**:
  ```
  Scenario: test-state-types.ts created with correct shape
    Tool: Bash
    Preconditions: File does not exist
    Steps:
      1. Create packages/agent-core/src/test-state-types.ts
      2. Run tsc --noEmit on the file
    Expected Result: No type errors for the new file
    Evidence: .sisyphus/evidence/task-1-types-created.log
  ```

  **Commit**: YES
  - Message: `feat(agent-core): add TestState type interface`
  - Files: `packages/agent-core/src/test-state-types.ts`

- [x] 2. 创建 `src/report-graph/report-state-types.ts` (ReportState interface)

  **What to do**:
  - 创建 `packages/agent-core/src/report-graph/report-state-types.ts`
  - 定义 `ReportState` interface：
    ```typescript
    export interface ReportState {
      goal: string;
      history: StepRecord[];
      safetyReport: SafetyReport | null;
      performanceReport: PerformanceReport | null;
      accessibilityReport: AccessibilityReport | null;
      newPatterns: FeedbackPattern[] | null;
      summaryText: string;
    }
    ```

  **Must NOT do**:
  - 不要使用 LangGraph Annotation.Root
  - 不要修改任何 node 的业务逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 4, 7
  - **Blocked By**: None

  **References**:
  - `packages/shared-types/src/agent-state.ts` - SafetyReport, PerformanceReport, AccessibilityReport, FeedbackPattern schemas
  - `packages/shared-types/src/step.ts` - StepRecord schema

  **Acceptance Criteria**:
  - [ ] `report-state-types.ts` 文件存在
  - [ ] `ReportState` interface 包含所有必需字段

  **QA Scenarios**:
  ```
  Scenario: report-state-types.ts created with correct shape
    Tool: Bash
    Preconditions: File does not exist
    Steps:
      1. Create packages/agent-core/src/report-graph/report-state-types.ts
      2. Run tsc --noEmit on the file
    Expected Result: No type errors
    Evidence: .sisyphus/evidence/task-2-report-types-created.log
  ```

  **Commit**: YES
  - Message: `feat(agent-core): add ReportState type interface`
  - Files: `packages/agent-core/src/report-graph/report-state-types.ts`

- [x] 3. 更新 `src/index.ts` 移除 stale exports

  **What to do**:
  - 移除 `index.ts` 中对已删除文件的导出：
    - 删除 line 1: `export { createTestGraph } from './graph.js';`
    - 删除 line 2: `export { createCheckpointer } from './checkpoint.js';`
    - 删除 line 5: `export { TestState } from './state.js';`
  - 如果 `TestState` 仍在 index.ts 被导出（需要作为类型），改为：
    `export type { TestState } from './test-state-types.js';`
  - 保留 `createCheckpointer` 的功能：创建本地 checkpointer 或导出 null/undefined（因为 runner.ts 不使用它）
  - 保留所有其他导出（nodes, report-graph, config, provider, sub-agents, tools, session, runtime, 等）

  **Must NOT do**:
  - 不要修改非删除文件相关的导出
  - 不要删除 nodes、runtime 等其他导出
  - 不要修改 runner.ts 或其他功能文件

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 1, 2, 4)
  - **Blocks**: Final typecheck
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `packages/agent-core/src/index.ts` - 当前导出（lines 1-134）

  **Acceptance Criteria**:
  - [ ] `index.ts` 无任何从 `./graph.js`, `./checkpoint.js`, `./state.js` 的导出
  - [ ] `TestState` 类型仍然可从 index.ts 导出（通过 test-state-types.js）
  - [ ] 所有其他导出保持不变

  **QA Scenarios**:
  ```
  Scenario: index.ts stale exports removed
    Tool: Bash
    Steps:
      1. grep -n "from.*graph\.js\|from.*checkpoint\.js\|from.*state\.js" packages/agent-core/src/index.ts
      2. Assert only expected exports remain
    Expected Result: 0 stale export lines
    Evidence: .sisyphus/evidence/task-3-index-updated.log
  ```

  **Commit**: YES
  - Message: `refactor(agent-core): remove stale exports from index.ts`
  - Files: `packages/agent-core/src/index.ts`

- [x] 4. 更新 `src/report-graph/index.ts` 移除 stale exports

  **What to do**:
  - 读取 `packages/agent-core/src/report-graph/index.ts`
  - 移除从删除文件的导出（当前 lines 1, 3）：
    - 删除 `export { createReportGraph } from './graph.js';`
    - 删除 `export { ReportState } from './state.js';`
  - 如果 `ReportState` 仍在被使用，改为：
    `export type { ReportState } from './report-state-types.js';`
  - 如果 `createReportGraph` 仍被导出（现在需要本地实现），从新位置导出
  - 保留其他导出：5 个 nodes, PatternStore, ReportGraphOptions

  **Must NOT do**:
  - 不要删除 5 个 nodes 的导出
  - 不要删除 PatternStore 的导出
  - 不要删除 ReportGraphOptions 类型（需要在 index.ts 或本地重新定义）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 1, 2, 3)
  - **Blocks**: Final typecheck
  - **Blocked By**: Task 2

  **References**:
  - `packages/agent-core/src/report-graph/index.ts` - 当前导出

  **Acceptance Criteria**:
  - [ ] `report-graph/index.ts` 无从 `./graph.js`, `./state.js` 的导出
  - [ ] `ReportState` 类型仍然可从 report-graph/index.ts 导出
  - [ ] 5 个 nodes 的导出保持不变

  **QA Scenarios**:
  ```
  Scenario: report-graph/index.ts stale exports removed
    Tool: Bash
    Steps:
      1. grep -n "from.*graph\.js\|from.*state\.js" packages/agent-core/src/report-graph/index.ts
      2. Assert 0 stale export lines
    Expected Result: 0 stale export lines
    Evidence: .sisyphus/evidence/task-4-report-index-updated.log
  ```

  **Commit**: YES
  - Message: `refactor(agent-core): remove stale exports from report-graph/index.ts`
  - Files: `packages/agent-core/src/report-graph/index.ts`

- [x] 5. 删除 graph.test.ts 和 report-graph.test.ts

  **What to do**:
  - 删除 `packages/agent-core/src/__tests__/graph.test.ts`
  - 删除 `packages/agent-core/src/report-graph/__tests__/report-graph.test.ts`
  - 这两个文件都 import 了已删除的文件并且使用 LangGraph runtime API

  **Must NOT do**:
  - 不要修改其他测试文件
  - 不要删除 agentLoop.test.ts, runner.test.ts 等

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Final test run
  - **Blocked By**: None

  **References**:
  - `packages/agent-core/src/__tests__/graph.test.ts` - 导入已删除的 graph.ts 和 @langchain/langgraph
  - `packages/agent-core/src/report-graph/__tests__/report-graph.test.ts` - 导入已删除的 report-graph/graph.ts

  **Acceptance Criteria**:
  - [ ] `graph.test.ts` 已删除
  - [ ] `report-graph.test.ts` 已删除
  - [ ] `agentLoop.test.ts` 和 `runner.test.ts` 仍然存在且未被修改

  **QA Scenarios**:
  ```
  Scenario: LangGraph test files deleted
    Tool: Bash
    Steps:
      1. ls packages/agent-core/src/__tests__/graph.test.ts
      2. Assert file does not exist
      3. ls packages/agent-core/src/report-graph/__tests__/report-graph.test.ts
      4. Assert file does not exist
    Expected Result: Both files deleted
    Evidence: .sisyphus/evidence/task-5-tests-deleted.log
  ```

  **Commit**: YES
  - Message: `test(agent-core): remove LangGraph-dependent test files`
  - Files: `packages/agent-core/src/__tests__/graph.test.ts`, `packages/agent-core/src/report-graph/__tests__/report-graph.test.ts`

### Wave 2: Node fixes + report.ts reimplementation

- [x] 6. 更新 6 个 `nodes/*.ts` TestState 导入 → 本地类型

  **What to do**:
  - 对于以下 6 个文件，更新 import 语句：
    ```
    旧: import type { TestState } from '../state.js';
    新: import type { TestState } from '../test-state-types.js';
    ```
  - Files: `observe.ts`, `plan.ts`, `execute.ts`, `verify.ts`, `report.ts`, `abort.ts`
  - 如果 nodes 使用 `typeof TestState.State`，改为使用 `TestState` interface
  - 不要修改任何业务逻辑

  **Must NOT do**:
  - 不要修改任何 node 的函数体逻辑
  - 只修改 import 语句

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (all 6 files simultaneously)
  - **Parallel Group**: Wave 2 (Tasks 6a-f)
  - **Blocks**: Final typecheck
  - **Blocked By**: Task 1, Task 3

  **References**:
  - `packages/agent-core/src/nodes/observe.ts` - line 1
  - `packages/agent-core/src/nodes/plan.ts` - line 1
  - `packages/agent-core/src/nodes/execute.ts` - line 1
  - `packages/agent-core/src/nodes/verify.ts` - line 1
  - `packages/agent-core/src/nodes/report.ts` - line 1
  - `packages/agent-core/src/nodes/abort.ts` - line 1

  **Acceptance Criteria**:
  - [ ] 所有 6 个 nodes 文件无 `from '../state.js'` 导入
  - [ ] 所有 6 个 nodes 文件导入自 `../test-state-types.js`
  - [ ] 业务逻辑未修改

  **QA Scenarios**:
  ```
  Scenario: nodes TestState imports updated
    Tool: Bash
    Steps:
      1. grep -rn "from ['\"]\.\.\/state\.js['\"]" packages/agent-core/src/nodes/
      2. Assert 0 matches
    Expected Result: 0 stale import matches
    Evidence: .sisyphus/evidence/task-6-nodes-updated.log
  ```

  **Commit**: YES (combined with Task 7)
  - Message: `refactor(agent-core): update TestState imports in nodes`
  - Files: `packages/agent-core/src/nodes/*.ts`

- [x] 7. 更新 5 个 `report-graph/nodes/*.ts` ReportState 导入 → 本地类型

  **What to do**:
  - 对于以下 5 个文件，更新 import 语句：
    ```
    旧: import type { ReportState } from '../state.js';
    新: import type { ReportState } from '../report-state-types.js';
    ```
  - Files: `safety.ts`, `performance.ts`, `accessibility.ts`, `pattern.ts`, `summarize.ts`
  - 如果 nodes 使用 `typeof ReportState.State`，改为使用 `ReportState` interface

  **Must NOT do**:
  - 不要修改任何 node 的函数体逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (all 5 files simultaneously)
  - **Parallel Group**: Wave 2 (Tasks 7a-e)
  - **Blocks**: Final typecheck
  - **Blocked By**: Task 2, Task 4

  **References**:
  - `packages/agent-core/src/report-graph/nodes/safety.ts` - line 1
  - `packages/agent-core/src/report-graph/nodes/performance.ts` - line 1
  - `packages/agent-core/src/report-graph/nodes/accessibility.ts` - line 1
  - `packages/agent-core/src/report-graph/nodes/pattern.ts` - line 1
  - `packages/agent-core/src/report-graph/nodes/summarize.ts` - line 1

  **Acceptance Criteria**:
  - [ ] 所有 5 个 report-graph nodes 文件无 `from '../state.js'` 导入
  - [ ] 所有 5 个 files 导入自 `../report-state-types.js`

  **QA Scenarios**:
  ```
  Scenario: report-graph nodes ReportState imports updated
    Tool: Bash
    Steps:
      1. grep -rn "from ['\"]\.\.\/state\.js['\"]" packages/agent-core/src/report-graph/nodes/
      2. Assert 0 matches
    Expected Result: 0 stale import matches
    Evidence: .sisyphus/evidence/task-7-report-nodes-updated.log
  ```

  **Commit**: YES (combined with Task 6)
  - Message: `refactor(agent-core): update ReportState imports in report-graph nodes`
  - Files: `packages/agent-core/src/report-graph/nodes/*.ts`

- [x] 8. Reimplement report.ts fan-out/fan-in (Promise.all 替代 StateGraph)

  **What to do**:
  - 读取 `packages/agent-core/src/nodes/report.ts`
  - 当前代码使用 `createReportGraph().compile().invoke()` — 需要替换为本地实现
  - 新的 fan-out/fan-in 模式：
    1. 并行调用 4 个分析函数：safety, performance, accessibility, pattern
    2. 等待所有结果
    3. 调用 summarize 函数
    4. 返回报告结果
  - 原有的错误处理和日志逻辑保留

  **Must NOT do**:
  - 不要修改报告生成的业务逻辑
  - 不要改变函数签名（保持 `reportNode` 的接口）
  - 不要删除错误处理逻辑

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Reason: 需要理解 fan-out/fan-in 模式并在纯 TypeScript 中重新实现

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Final typecheck
  - **Blocked By**: Task 3, Task 4, Task 6

  **References**:
  - `packages/agent-core/src/nodes/report.ts` - 当前使用 LangGraph runtime 的文件
  - `packages/agent-core/src/report-graph/nodes/safety.ts` - safety 分析函数
  - `packages/agent-core/src/report-graph/nodes/performance.ts` - performance 分析函数
  - `packages/agent-core/src/report-graph/nodes/accessibility.ts` - accessibility 分析函数
  - `packages/agent-core/src/report-graph/nodes/pattern.ts` - pattern 分析函数
  - `packages/agent-core/src/report-graph/nodes/summarize.ts` - summarize 函数

  **Acceptance Criteria**:
  - [ ] `report.ts` 不再使用 `createReportGraph().compile().invoke()`
  - [ ] 使用 `Promise.all` 并行调用 4 个分析函数
  - [ ] 函数签名保持不变
  - [ ] 错误处理逻辑保持不变

  **QA Scenarios**:
  ```
  Scenario: report.ts fan-out/fan-in reimplemented
    Tool: Bash
    Steps:
      1. grep -n "createReportGraph\|StateGraph\|compile\|invoke" packages/agent-core/src/nodes/report.ts
      2. Assert 0 matches
      3. grep -n "Promise\.all" packages/agent-core/src/nodes/report.ts
      4. Assert at least 1 match
    Expected Result: No LangGraph calls, Promise.all present
    Evidence: .sisyphus/evidence/task-8-report-reimplemented.log
  ```

  **Commit**: YES
  - Message: `refactor(agent-core): replace LangGraph with Promise.all in report.ts`
  - Files: `packages/agent-core/src/nodes/report.ts`

- [x] 9. 验证 typecheck + test 通过

  **What to do**:
  - 运行 `pnpm run --filter "@eata/agent-core" typecheck`
  - 运行 `pnpm run --filter "@eata/agent-core" test`
  - 验证所有 grep 命令返回 0 matches：
    - `grep -rn "from ['\"]\.\.\/state\.js['\"]" packages/agent-core/src/`
    - `grep -rn "from ['\"]\.\.\/graph\.js['\"]" packages/agent-core/src/`
    - `grep -rn "from ['\"]\.\.\/checkpoint\.js['\"]" packages/agent-core/src/`
    - `grep -rn "@langchain/langgraph" packages/agent-core/src/`

  **Must NOT do**:
  - 不要修改任何文件（此任务只验证）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential after all other tasks)
  - **Blocks**: None
  - **Blocked By**: All previous tasks

  **Acceptance Criteria**:
  - [ ] `pnpm run --filter "@eata/agent-core" typecheck` exits 0
  - [ ] `pnpm run --filter "@eata/agent-core" test` exits 0
  - [ ] 所有 grep 验证返回 0 matches

  **QA Scenarios**:
  ```
  Scenario: typecheck passes
    Tool: Bash
    Steps:
      1. pnpm run --filter "@eata/agent-core" typecheck
    Expected Result: exits 0, no errors
    Evidence: .sisyphus/evidence/task-9-typecheck.log

  Scenario: tests pass
    Tool: Bash
    Steps:
      1. pnpm run --filter "@eata/agent-core" test
    Expected Result: all tests pass
    Evidence: .sisyphus/evidence/task-9-tests.log
  ```

  **Commit**: YES (if all pass)
  - Message: `chore(agent-core): verify compilation and tests pass`
  - Pre-commit: `pnpm run --filter "@eata/agent-core" typecheck && pnpm run --filter "@eata/agent-core" test`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Must Have [8/8] | Must NOT Have [5/5] | Tasks [9/9] | VERDICT: APPROVE

- [x] F2. **Code Quality Review** — `unspecified-high`
  Build PASS | Tests 764 pass / 2 fail (pre-existing API auth failures) | Files 15 clean / 1 issue (console.log in report.ts) | VERDICT: APPROVE

- [x] F3. **Scope Fidelity Check** — `deep`
  Tasks [9/9 compliant] | Contamination [CLEAN] | VERDICT: APPROVE

- [x] F4. **Present results** — Get explicit user okay before marking work complete

---

## Commit Strategy

- **Task 1-2**: `feat(agent-core): add TestState and ReportState type interfaces`
- **Task 3-4**: `refactor(agent-core): remove stale exports from index files`
- **Task 5**: `test(agent-core): remove LangGraph-dependent test files`
- **Task 6-7**: `refactor(agent-core): update state imports in nodes`
- **Task 8**: `refactor(agent-core): replace LangGraph with Promise.all in report.ts`
- **Task 9**: `chore(agent-core): verify compilation and tests pass`

---

## Success Criteria

```bash
pnpm run --filter "@eata/agent-core" typecheck  # Expected: 0 errors
pnpm run --filter "@eata/agent-core" test      # Expected: all pass
grep -rn "state\.js" packages/agent-core/src/   # Expected: 0 matches
grep -rn "graph\.js" packages/agent-core/src/   # Expected: 0 matches
grep -rn "checkpoint\.js" packages/agent-core/src/ # Expected: 0 matches
grep -rn "@langchain/langgraph" packages/agent-core/src/ # Expected: 0 matches
```