# Pi 迁移 Wave 4: 完全移除 LangGraph 依赖

## TL;DR

> **Quick Summary**: 完全移除 `@langchain/langgraph` 和 `@langchain/langgraph-checkpoint-sqlite` 依赖，清理相关代码。
>
> **Deliverables**:
> - 移除 `package.json` 中的 LangGraph 依赖
> - 移除或替换所有 LangGraph 相关文件
> - 更新测试文件
> - 确保所有测试通过
>
> **Estimated Effort**: Medium (1-2 days)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### Current State
- `runner.ts` 已迁移到 AgentLoop
- 但以下文件仍使用 LangGraph：
  - `packages/agent-core/src/graph.ts` - 主测试图
  - `packages/agent-core/src/state.ts` - 状态定义
  - `packages/agent-core/src/checkpoint.ts` - SQLite 检查点
  - `packages/agent-core/src/report-graph/graph.ts` - 报告图
  - `packages/agent-core/src/report-graph/state.ts` - 报告状态
  - `packages/agent-core/src/__tests__/graph.test.ts` - 测试

### Dependencies
- `@langchain/langgraph` in root `package.json`
- `@langchain/langgraph-checkpoint-sqlite` in root `package.json`

---

## Work Objectives

### Core Objective
完全移除 LangGraph 依赖，清理相关代码。

### Concrete Deliverables
- 移除 `package.json` 中的 LangGraph 依赖
- 移除或替换 `graph.ts`
- 移除或替换 `state.ts`
- 移除或替换 `checkpoint.ts`
- 移除或替换 `report-graph/graph.ts`
- 移除或替换 `report-graph/state.ts`
- 更新 `__tests__/graph.test.ts`

### Definition of Done
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过
- [ ] 无 LangGraph 导入

### Must Have
- 移除所有 LangGraph 依赖
- 保持现有功能
- 所有测试通过

### Must NOT Have (Guardrails)
- ❌ 不要删除现有功能
- ❌ 不要破坏现有测试
- ❌ 不要引入新的外部依赖

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
Wave 1 (移除依赖):
├── Task 1: 移除 package.json 中的 LangGraph 依赖 [quick]
├── Task 2: 移除 graph.ts [quick]
├── Task 3: 移除 state.ts [quick]
└── Task 4: 移除 checkpoint.ts [quick]

Wave 2 (清理报告图):
├── Task 5: 移除 report-graph/graph.ts [quick]
├── Task 6: 移除 report-graph/state.ts [quick]
└── Task 7: 更新 graph.test.ts [quick]

Wave FINAL (Verification):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review
└── F3: Scope fidelity check (deep)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2, 3, 4 | 1 |
| 2 | 1 | — | 1 |
| 3 | 1 | — | 1 |
| 4 | 1 | — | 1 |
| 5 | 1 | — | 2 |
| 6 | 1 | — | 2 |
| 7 | 1 | — | 2 |

---

## TODOs

### Wave 1: 移除依赖

- [ ] 1. 移除 package.json 中的 LangGraph 依赖

  **What to do**:
  - 从 `package.json` 移除 `@langchain/langgraph` 和 `@langchain/langgraph-checkpoint-sqlite`
  - 运行 `pnpm install` 更新依赖

  **Must NOT do**:
  - 不要删除其他依赖

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 2, 3, 4
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `package.json` 中没有 LangGraph 依赖
  - [ ] `pnpm install` 成功

  **QA Scenarios**:
  ```
  Scenario: LangGraph removed
    Tool: Bash
    Steps:
      1. Check package.json for '@langchain/langgraph'
      2. Assert not present
    Expected Result: Dependencies removed
  ```

  **Commit**: YES
  - Message: `chore(deps): remove LangGraph dependencies`
  - Files: `package.json`, `pnpm-lock.yaml`

- [ ] 2. 移除 graph.ts

  **What to do**:
  - 删除 `packages/agent-core/src/graph.ts`
  - 更新引用该文件的其他文件

  **Must NOT do**:
  - 不要删除其他文件

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: Task 1

  **Acceptance Criteria**:
  - [ ] `graph.ts` 已删除
  - [ ] 无引用该文件的其他文件

  **QA Scenarios**:
  ```
  Scenario: graph.ts removed
    Tool: Bash
    Steps:
      1. Check if graph.ts exists
      2. Assert not present
    Expected Result: File removed
  ```

  **Commit**: YES
  - Message: `refactor: remove graph.ts`
  - Files: `packages/agent-core/src/graph.ts`

- [ ] 3. 移除 state.ts

  **What to do**:
  - 删除 `packages/agent-core/src/state.ts`
  - 更新引用该文件的其他文件

  **Must NOT do**:
  - 不要删除其他文件

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: Task 1

  **Acceptance Criteria**:
  - [ ] `state.ts` 已删除
  - [ ] 无引用该文件的其他文件

  **QA Scenarios**:
  ```
  Scenario: state.ts removed
    Tool: Bash
    Steps:
      1. Check if state.ts exists
      2. Assert not present
    Expected Result: File removed
  ```

  **Commit**: YES
  - Message: `refactor: remove state.ts`
  - Files: `packages/agent-core/src/state.ts`

- [ ] 4. 移除 checkpoint.ts

  **What to do**:
  - 删除 `packages/agent-core/src/checkpoint.ts`
  - 更新引用该文件的其他文件

  **Must NOT do**:
  - 不要删除其他文件

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: Task 1

  **Acceptance Criteria**:
  - [ ] `checkpoint.ts` 已删除
  - [ ] 无引用该文件的其他文件

  **QA Scenarios**:
  ```
  Scenario: checkpoint.ts removed
    Tool: Bash
    Steps:
      1. Check if checkpoint.ts exists
      2. Assert not present
    Expected Result: File removed
  ```

  **Commit**: YES
  - Message: `refactor: remove checkpoint.ts`
  - Files: `packages/agent-core/src/checkpoint.ts`

### Wave 2: 清理报告图

- [ ] 5. 移除 report-graph/graph.ts

  **What to do**:
  - 删除 `packages/agent-core/src/report-graph/graph.ts`
  - 更新引用该文件的其他文件

  **Must NOT do**:
  - 不要删除其他文件

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 1

  **Acceptance Criteria**:
  - [ ] `report-graph/graph.ts` 已删除
  - [ ] 无引用该文件的其他文件

  **QA Scenarios**:
  ```
  Scenario: report-graph/graph.ts removed
    Tool: Bash
    Steps:
      1. Check if report-graph/graph.ts exists
      2. Assert not present
    Expected Result: File removed
  ```

  **Commit**: YES
  - Message: `refactor: remove report-graph/graph.ts`
  - Files: `packages/agent-core/src/report-graph/graph.ts`

- [ ] 6. 移除 report-graph/state.ts

  **What to do**:
  - 删除 `packages/agent-core/src/report-graph/state.ts`
  - 更新引用该文件的其他文件

  **Must NOT do**:
  - 不要删除其他文件

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 1

  **Acceptance Criteria**:
  - [ ] `report-graph/state.ts` 已删除
  - [ ] 无引用该文件的其他文件

  **QA Scenarios**:
  ```
  Scenario: report-graph/state.ts removed
    Tool: Bash
    Steps:
      1. Check if report-graph/state.ts exists
      2. Assert not present
    Expected Result: File removed
  ```

  **Commit**: YES
  - Message: `refactor: remove report-graph/state.ts`
  - Files: `packages/agent-core/src/report-graph/state.ts`

- [ ] 7. 更新 graph.test.ts

  **What to do**:
  - 更新 `packages/agent-core/src/__tests__/graph.test.ts`
  - 移除 LangGraph 相关测试
  - 添加 AgentLoop 相关测试

  **Must NOT do**:
  - 不要删除其他测试

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 1

  **Acceptance Criteria**:
  - [ ] `graph.test.ts` 已更新
  - [ ] 测试通过

  **QA Scenarios**:
  ```
  Scenario: graph.test.ts updated
    Tool: Bash
    Steps:
      1. Run tests
      2. Assert all pass
    Expected Result: Tests pass
  ```

  **Commit**: YES
  - Message: `test: update graph.test.ts for AgentLoop`
  - Files: `packages/agent-core/src/__tests__/graph.test.ts`

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

- **Task 1**: `chore(deps): remove LangGraph dependencies`
- **Task 2**: `refactor: remove graph.ts`
- **Task 3**: `refactor: remove state.ts`
- **Task 4**: `refactor: remove checkpoint.ts`
- **Task 5**: `refactor: remove report-graph/graph.ts`
- **Task 6**: `refactor: remove report-graph/state.ts`
- **Task 7**: `test: update graph.test.ts for AgentLoop`

---

## Success Criteria

### Verification Commands
```bash
pnpm typecheck            # Expected: pass
pnpm test                 # Expected: all tests pass
```

### Final Checklist
- [ ] LangGraph 完全移除
- [ ] 所有测试通过
- [ ] 无回归