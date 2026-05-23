# Pi 迁移 Wave 3: runner.ts 迁移到 Agent Loop

## TL;DR

> **Quick Summary**: 将 `runner.ts` 从 LangGraph (`@langchain/langgraph`) 迁移到自研 AgentLoop，实现完全去 LangGraph 化。
>
> **Deliverables**:
> - `runner.ts` 重写为使用 AgentLoop
> - 适配器桥接现有工具到 AgentLoop
> - 移除 `@langchain/langgraph` 和 `@langchain/langgraph-checkpoint-sqlite` 依赖
> - 所有测试通过
>
> **Estimated Effort**: Medium (1-2 days)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 4 → Task 5

---

## Context

### Current State
- `runner.ts` 使用 LangGraph (`createTestGraph`)
- `graph.ts` 使用 `@langchain/langgraph` 的 `StateGraph`
- `state.ts` 使用 `@langchain/langgraph` 的 `Annotation`
- `checkpoint.ts` 使用 `@langchain/langgraph-checkpoint-sqlite`
- `report-graph/` 也使用 LangGraph

### Wave 1-2 成果
- ✅ 自定义 LLM Provider（native fetch）
- ✅ SessionManager + SQLite 持久化
- ✅ AgentLoop（observe→plan→execute→verify→report）
- ✅ StuckDetector

---

## Work Objectives

### Core Objective
将 `runner.ts` 从 LangGraph 迁移到自研 AgentLoop，实现完全去 LangGraph 化。

### Concrete Deliverables
- `packages/agent-core/src/runner.ts` - 重写为使用 AgentLoop
- `packages/agent-core/src/llm/adapter.ts` - LLMProvider 适配器
- `packages/agent-core/src/tools/adapter.ts` - ToolRegistry 适配器
- `packages/agent-core/src/runner-types.ts` - 新的返回类型

### Definition of Done
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过
- [ ] `runTest` 函数签名保持不变
- [ ] 移除 `@langchain/langgraph` 依赖

### Must Have
- `runner.ts` 使用 AgentLoop 替代 LangGraph
- 保持 `RunTestOptions` 接口不变
- 保持 `runTest` 函数签名不变
- 所有现有测试通过

### Must NOT Have (Guardrails)
- ❌ 不要修改 `RunTestOptions` 接口
- ❌ 不要修改 `runTest` 函数签名
- ❌ 不要删除现有节点逻辑（observe, plan, execute, verify, report）
- ❌ 不要破坏现有测试

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES
- **Framework**: Vitest

### QA Policy
Every task MUST include agent-executed QA scenarios.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 适配器 + 类型):
├── Task 1: 创建 LLMProvider 适配器 [quick]
├── Task 2: 创建 ToolRegistry 适配器 [quick]
└── Task 3: 创建 RunTestResult 类型 [quick]

Wave 2 (Core — runner 重写):
├── Task 4: 重写 runner.ts [deep]
└── Task 5: 更新调用者 [quick]

Wave FINAL (Verification):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review
└── F3: Scope fidelity check (deep)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 4 | 1 |
| 2 | — | 4 | 1 |
| 3 | — | 4 | 1 |
| 4 | 1, 2, 3 | 5 | 2 |
| 5 | 4 | — | 2 |

---

## TODOs

### Wave 1: 适配器 + 类型

- [x] 1. 创建 LLMProvider 适配器

  **What to do**:
  - 创建 `packages/agent-core/src/llm/adapter.ts`
  - 将 Vercel AI SDK 的 `generateObject` 包装为自研 `LLMProvider` 接口
  - 适配器需要处理 `generateObject` 和 `generateText` 的转换

  **Must NOT do**:
  - 不要修改现有的 `llm.ts` 或 `provider-factory.ts`
  - 不要引入新的依赖

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] 适配器文件创建完成
  - [ ] `pnpm typecheck` 通过
  - [ ] 适配器可以被 AgentLoop 使用

  **QA Scenarios**:
  ```
  Scenario: Adapter converts generateObject
    Tool: Bash
    Steps:
      1. Import adapter
      2. Call generateObject with test data
      3. Assert response matches LLMProvider interface
    Expected Result: Adapter works correctly
  ```

  **Commit**: YES
  - Message: `feat(llm): add LLMProvider adapter for AgentLoop`
  - Files: `packages/agent-core/src/llm/adapter.ts`

- [x] 2. 创建 ToolRegistry 适配器

  **What to do**:
  - 创建 `packages/agent-core/src/tools/adapter.ts`
  - 将现有 `ToolRegistry` 包装为 AgentLoop 需要的接口
  - 适配器需要处理工具调用和结果返回

  **Must NOT do**:
  - 不要修改现有的 `tools/registry.ts`
  - 不要删除现有工具

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] 适配器文件创建完成
  - [ ] `pnpm typecheck` 通过
  - [ ] 适配器可以被 AgentLoop 使用

  **QA Scenarios**:
  ```
  Scenario: Adapter wraps ToolRegistry
    Tool: Bash
    Steps:
      1. Import adapter
      2. Call tool execution
      3. Assert result matches expected format
    Expected Result: Adapter works correctly
  ```

  **Commit**: YES
  - Message: `feat(tools): add ToolRegistry adapter for AgentLoop`
  - Files: `packages/agent-core/src/tools/adapter.ts`

- [x] 3. 创建 RunTestResult 类型

  **What to do**:
  - 创建 `packages/agent-core/src/runner-types.ts`
  - 定义新的返回类型，兼容旧接口
  - 确保类型可以被外部使用

  **Must NOT do**:
  - 不要修改现有的 `runner.ts`
  - 不要删除现有类型

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] 类型文件创建完成
  - [ ] `pnpm typecheck` 通过
  - [ ] 类型兼容旧接口

  **QA Scenarios**:
  ```
  Scenario: RunTestResult type is compatible
    Tool: Bash
    Steps:
      1. Import type
      2. Create instance with test data
      3. Assert type matches
    Expected Result: Type works correctly
  ```

  **Commit**: YES
  - Message: `feat(types): add RunTestResult type for AgentLoop`
  - Files: `packages/agent-core/src/runner-types.ts`

### Wave 2: runner 重写

- [x] 4. 重写 runner.ts

  **What to do**:
  - 修改 `packages/agent-core/src/runner.ts`
  - 使用 AgentLoop 替代 LangGraph
  - 保持 `RunTestOptions` 接口不变
  - 保持 `runTest` 函数签名不变

  **Must NOT do**:
  - 不要修改 `RunTestOptions` 接口
  - 不要修改 `runTest` 函数签名
  - 不要删除现有节点逻辑

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 5
  - **Blocked By**: Task 1, 2, 3

  **Acceptance Criteria**:
  - [ ] `runner.ts` 使用 AgentLoop
  - [ ] `RunTestOptions` 接口不变
  - [ ] `runTest` 函数签名不变
  - [ ] `pnpm typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: runner uses AgentLoop
    Tool: Bash
    Steps:
      1. Import runner
      2. Call runTest with test options
      3. Assert result matches expected format
    Expected Result: Runner works correctly
  ```

  **Commit**: YES
  - Message: `refactor(runner): rewrite to use AgentLoop instead of LangGraph`
  - Files: `packages/agent-core/src/runner.ts`

- [x] 5. 更新调用者

  **What to do**:
  - 修改 `packages/agent-core/src/cli.ts`
  - 修改 `packages/agent-core/src/worker-entry.ts`
  - 适配新的返回类型

  **Must NOT do**:
  - 不要修改 `runTest` 调用方式
  - 不要删除现有功能

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 4

  **Acceptance Criteria**:
  - [ ] `cli.ts` 更新完成
  - [ ] `worker-entry.ts` 更新完成
  - [ ] `pnpm typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: cli uses updated runner
    Tool: Bash
    Steps:
      1. Import cli
      2. Call runTest
      3. Assert result matches expected format
    Expected Result: CLI works correctly
  ```

  **Commit**: YES
  - Message: `refactor(cli): adapt to new runner return type`
  - Files: `packages/agent-core/src/cli.ts`, `packages/agent-core/src/worker-entry.ts`

---

## Final Verification Wave (MANDATORY)

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `pnpm typecheck` + `pnpm test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Scope Fidelity Check** — `deep`
  For each task: verify 1:1 — everything in spec was built, nothing beyond spec.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Task 1**: `feat(llm): add LLMProvider adapter for AgentLoop`
- **Task 2**: `feat(tools): add ToolRegistry adapter for AgentLoop`
- **Task 3**: `feat(types): add RunTestResult type for AgentLoop`
- **Task 4**: `refactor(runner): rewrite to use AgentLoop instead of LangGraph`
- **Task 5**: `refactor(cli): adapt to new runner return type`

---

## Success Criteria

### Verification Commands
```bash
pnpm typecheck            # Expected: pass
pnpm test                 # Expected: all tests pass
```

### Final Checklist
- [ ] LangGraph 完全移除
- [ ] runner.ts 使用 AgentLoop
- [ ] 所有测试通过
- [ ] 无回归