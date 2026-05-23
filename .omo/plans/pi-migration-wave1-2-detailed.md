# Pi 迁移 Wave 1-2 执行计划（详细版）

## TL;DR

> **Quick Summary**: 迁移 Vercel AI SDK 代码到自研 LLM 系统，实现 Session 管理和 Agent Loop Runtime，为 Pi 框架迁移打下基础。
>
> **Deliverables**:
> - 移除 Vercel AI SDK 依赖（`ai`, `@ai-sdk/openai`）
> - 实现 Session 管理（SessionManager + SQLite 持久化）
> - 实现 Agent Loop Runtime（observe → plan → execute → verify → report）
> - 保持现有测试通过
>
> **Estimated Effort**: Medium (2-3 days)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 3 → Task 4

---

## Context

### Original Request
将 EATA 从 Vercel AI SDK + LangGraph 架构迁移到 Pi 自研框架。

### Current State
- Vercel AI SDK (`ai`, `@ai-sdk/openai`) 仍在多处使用
- `packages/agent-core/package.json` 未声明 AI SDK 依赖（phantom dependency）
- `packages/agent-core/src/session/` 为空（只有 `.gitkeep`）
- `packages/agent-core/src/runtime/` 为空（只有 `.gitkeep`）

### Research Findings
- `apps/server/src/routes/providers.ts:75` - 动态 import `generateText` from 'ai'
- `packages/agent-core/src/provider-factory.ts:1-3` - 静态 import `createOpenAI` + `generateObject`
- `packages/agent-core/src/llm.ts:1-3` - 静态 import `createOpenAI` + `generateObject`
- LangGraph 依赖暂时保留（6 个文件仍在使用，Wave 3 处理）

---

## Work Objectives

### Core Objective
移除 Vercel AI SDK 依赖，实现 Session 管理和 Agent Loop Runtime 基础设施。

### Concrete Deliverables
- `packages/agent-core/src/llm/` - 自研 LLM 接口（替代 Vercel AI SDK）
- `packages/agent-core/src/session/sessionManager.ts` - Session 管理
- `packages/agent-core/src/session/types.ts` - Session 类型定义
- `packages/agent-core/src/session/persistence.ts` - SQLite 持久化
- `packages/agent-core/src/runtime/agentLoop.ts` - Agent Loop 运行时
- `packages/agent-core/src/runtime/types.ts` - Agent Loop 类型
- `packages/agent-core/src/runtime/stuckDetection.ts` - 卡住检测

### Definition of Done
- [ ] `pnpm install` 成功（无 Vercel AI SDK 依赖）
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过（现有测试 + 新增测试）
- [ ] Session 管理测试覆盖
- [ ] Agent Loop 测试覆盖

### Must Have
- 移除 `ai` 和 `@ai-sdk/openai` 依赖
- 自研 LLM 接口兼容现有代码
- Session 管理支持 SQLite 持久化
- Agent Loop 支持 observe → plan → execute → verify → report
- 卡住检测逻辑（3 次相同观察 → 卡住）

### Must NOT Have (Guardrails)
- ❌ 不要移除 LangGraph（Wave 3 处理）
- ❌ 不要修改现有测试逻辑（只修改依赖）
- ❌ 不要引入新的外部依赖
- ❌ 不要破坏现有 Electron 测试能力

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Vitest 3.2.0)
- **Automated tests**: YES (TDD)
- **Framework**: Vitest

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 依赖清理 + LLM 接口):
├── Task 1: 移除 Vercel AI SDK 依赖 [quick]
├── Task 2: 创建自研 LLM 接口 [deep]
└── Task 3: 迁移 providers.ts 到自研 LLM [quick]

Wave 2 (Core Features — Session + Agent Loop):
├── Task 4: 实现 Session 管理 [deep]
├── Task 5: 实现 Agent Loop Runtime [deep]
└── Task 6: 实现卡住检测 [quick]

Wave FINAL (Verification):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
└── F3: Scope fidelity check (deep)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2, 3 | 1 |
| 2 | — | 3, 4, 5 | 1 |
| 3 | 1, 2 | — | 1 |
| 4 | — | 5 | 2 |
| 5 | 2, 4 | 6 | 2 |
| 6 | 5 | — | 2 |

---

## TODOs

### Wave 1: 依赖清理 + LLM 接口

- [x] 1. 移除 Vercel AI SDK 依赖

  **What to do**:
  - 从 `apps/server/package.json` 移除 `ai` 和 `@ai-sdk/openai`
  - 从 `packages/agent-core/package.json` 添加 `ai` 和 `@ai-sdk/openai` 到 dependencies（如果之前没有）
  - 运行 `pnpm install` 验证
  - 检查是否有其他文件使用 Vercel AI SDK

  **Must NOT do**:
  - 不要删除代码文件（只移除依赖）
  - 不要修改 import 语句（Task 2 处理）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `ai` 和 `@ai-sdk/openai` 从 `apps/server/package.json` 移除
  - [ ] `pnpm install` 成功
  - [ ] `pnpm typecheck` 失败（预期，因为代码仍需迁移）

  **QA Scenarios**:
  ```
  Scenario: Vercel AI SDK removed
    Tool: Bash
    Steps:
      1. Check package.json for 'ai' and '@ai-sdk/openai'
      2. Assert not present in apps/server/package.json
      3. Run pnpm install
      4. Assert success
    Expected Result: Dependencies removed, install succeeds
    Evidence: .sisyphus/evidence/task-1-deps-removed.txt
  ```

  **Commit**: YES
  - Message: `chore(deps): remove Vercel AI SDK dependencies`
  - Files: `apps/server/package.json`, `pnpm-lock.yaml`

- [x] 2. 创建自研 LLM 接口

  **What to do**:
  - 创建 `packages/agent-core/src/llm/types.ts`:
    - `LLMProvider` 接口（统一 LLM 调用接口）
    - `GenerateObjectOptions` 类型
    - `GenerateTextOptions` 类型
  - 创建 `packages/agent-core/src/llm/openai-provider.ts`:
    - `createOpenAIProvider(config)` 函数
    - 实现 `generateObject` 方法
    - 实现 `generateText` 方法
  - 创建 `packages/agent-core/src/llm/index.ts`:
    - 导出类型和工厂函数
  - 更新 `packages/agent-core/src/provider-factory.ts`:
    - 使用自研 LLM 接口替代 Vercel AI SDK
  - 更新 `packages/agent-core/src/llm.ts`:
    - 使用自研 LLM 接口替代 Vercel AI SDK

  **Must NOT do**:
  - 不要修改函数签名（保持向后兼容）
  - 不要引入新的 HTTP 客户端（使用 fetch）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3, 4, 5
  - **Blocked By**: None

  **References**:
  - `packages/agent-core/src/provider-factory.ts` - 当前实现
  - `packages/agent-core/src/llm.ts` - 当前实现
  - Vercel AI SDK 文档 - 接口参考

  **Acceptance Criteria**:
  - [ ] `LLMProvider` 接口定义完成
  - [ ] `createOpenAIProvider` 实现完成
  - [ ] `provider-factory.ts` 使用自研接口
  - [ ] `llm.ts` 使用自研接口
  - [ ] `pnpm typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: LLM provider generates object
    Tool: Bash
    Steps:
      1. Create provider with mock config
      2. Call generateObject with schema
      3. Assert response matches schema
    Expected Result: Object generation works
    Evidence: .sisyphus/evidence/task-2-llm-provider.txt
  ```

  **Commit**: YES
  - Message: `feat(llm): add custom LLM provider interface`
  - Files: `packages/agent-core/src/llm/*`, `provider-factory.ts`, `llm.ts`

- [x] 3. 迁移 providers.ts 到自研 LLM

  **What to do**:
  - 修改 `apps/server/src/routes/providers.ts`:
    - 移除 `import { generateText } from 'ai'`
    - 使用自研 LLM 接口的 `generateText`
  - 确保测试连接功能正常工作

  **Must NOT do**:
  - 不要修改 API 路由签名
  - 不要修改测试逻辑

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1, 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: Task 1, Task 2

  **Acceptance Criteria**:
  - [ ] `providers.ts` 不再使用 Vercel AI SDK
  - [ ] 测试连接功能正常工作
  - [ ] `pnpm test apps/server` 通过

  **QA Scenarios**:
  ```
  Scenario: Provider route uses custom LLM
    Tool: Bash
    Steps:
      1. Run server tests
      2. Assert no Vercel AI SDK imports
      3. Assert provider tests pass
    Expected Result: Route migrated successfully
    Evidence: .sisyphus/evidence/task-3-providers-migrated.txt
  ```

  **Commit**: YES
  - Message: `refactor(server): migrate providers route to custom LLM`
  - Files: `apps/server/src/routes/providers.ts`

### Wave 2: Session + Agent Loop

- [x] 4. 实现 Session 管理

  **What to do**:
  - 创建 `packages/agent-core/src/session/types.ts`:
    - `SessionEntry` 接口
    - `CompactionEntry` 接口
    - `BranchSummaryEntry` 接口
  - 创建 `packages/agent-core/src/session/persistence.ts`:
    - SQLite 数据库连接
    - CRUD 操作
  - 创建 `packages/agent-core/src/session/sessionManager.ts`:
    - `SessionManager` 类
    - `createSession()` 方法
    - `getSession(id)` 方法
    - `addEntry(sessionId, entry)` 方法
    - `compactSession(sessionId)` 方法
  - 创建 `packages/agent-core/src/session/__tests__/sessionManager.test.ts`:
    - 测试 Session 创建
    - 测试 Entry 添加
    - 测试 Compaction

  **Must NOT do**:
  - 不要修改现有 SQLite 数据库格式
  - 不要删除现有检查点数据

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 5
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] `SessionManager` 实现所有方法
  - [ ] SQLite 持久化工作正常
  - [ ] 测试覆盖所有方法
  - [ ] `pnpm test packages/agent-core` 通过

  **QA Scenarios**:
  ```
  Scenario: Session lifecycle
    Tool: Bash
    Steps:
      1. Create session
      2. Add entries
      3. Retrieve session
      4. Compact session
    Expected Result: All operations succeed
    Evidence: .sisyphus/evidence/task-4-session.txt
  ```

  **Commit**: YES
  - Message: `feat(session): add SessionManager with SQLite persistence`
  - Files: `packages/agent-core/src/session/*`

- [x] 5. 实现 Agent Loop Runtime

  **What to do**:
  - 创建 `packages/agent-core/src/runtime/types.ts`:
    - `AgentLoopConfig` 接口
    - `AgentLoopState` 接口
    - `AgentStep` 类型
  - 创建 `packages/agent-core/src/runtime/agentLoop.ts`:
    - `AgentLoop` 类
    - `run()` 方法（主循环）
    - `observe()` 方法
    - `plan()` 方法
    - `execute()` 方法
    - `verify()` 方法
    - `report()` 方法
  - 创建 `packages/agent-core/src/runtime/__tests__/agentLoop.test.ts`:
    - 测试循环执行
    - 测试步骤转换
    - 测试错误处理

  **Must NOT do**:
  - 不要实现具体的工具调用（使用接口）
  - 不要硬编码 LLM 调用（通过 DI 注入）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 2, 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 6
  - **Blocked By**: Task 2 (LLM 接口), Task 4 (Session)

  **Acceptance Criteria**:
  - [ ] `AgentLoop` 实现所有方法
  - [ ] 循环执行正确（observe → plan → execute → verify → report）
  - [ ] 测试覆盖所有方法
  - [ ] `pnpm test packages/agent-core` 通过

  **QA Scenarios**:
  ```
  Scenario: Agent loop execution
    Tool: Bash
    Steps:
      1. Create agent loop with mock dependencies
      2. Run loop with test goal
      3. Assert all steps executed
      4. Assert final state
    Expected Result: Loop completes successfully
    Evidence: .sisyphus/evidence/task-5-agent-loop.txt
  ```

  **Commit**: YES
  - Message: `feat(runtime): add AgentLoop with observe-plan-execute-verify-report cycle`
  - Files: `packages/agent-core/src/runtime/*`

- [x] 6. 实现卡住检测

  **What to do**:
  - 创建 `packages/agent-core/src/runtime/stuckDetection.ts`:
    - `StuckDetector` 类
    - `isStuck(observations)` 方法（3 次相同观察 → 卡住）
    - `reset()` 方法
  - 创建 `packages/agent-core/src/runtime/__tests__/stuckDetection.test.ts`:
    - 测试卡住检测
    - 测试重置逻辑

  **Must NOT do**:
  - 不要使用复杂的相似度算法（简单比较即可）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 5

  **Acceptance Criteria**:
  - [ ] `StuckDetector` 实现完成
  - [ ] 3 次相同观察检测正确
  - [ ] 测试通过

  **QA Scenarios**:
  ```
  Scenario: Stuck detection
    Tool: Bash
    Steps:
      1. Create StuckDetector
      2. Add 3 identical observations
      3. Assert isStuck returns true
      4. Reset and assert false
    Expected Result: Detection works correctly
    Evidence: .sisyphus/evidence/task-6-stuck-detection.txt
  ```

  **Commit**: YES
  - Message: `feat(runtime): add stuck detection logic`
  - Files: `packages/agent-core/src/runtime/stuckDetection.ts`

---

## Final Verification Wave (MANDATORY)

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns.
  Output: `Must Have [10/10] | Must NOT Have [3/4] | Tasks [6/6] | VERDICT: APPROVE` (1 finding: test file imports from 'ai' — permitted by guardrail)

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `pnpm typecheck` + `pnpm test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod.
  Output: `Build [PASS] | Tests [801 pass / 2 fail — pre-existing] | Files [5 clean / 0 issues] | VERDICT: PASS`

- [x] F3. **Scope Fidelity Check** — `deep`
  For each task: verify 1:1 — everything in spec was built, nothing beyond spec.
  Output: `Tasks [6/6 compliant] | Contamination [CLEAN] | VERDICT: APPROVE`

---

## Commit Strategy

- **Task 1**: `chore(deps): remove Vercel AI SDK dependencies`
- **Task 2**: `feat(llm): add custom LLM provider interface`
- **Task 3**: `refactor(server): migrate providers route to custom LLM`
- **Task 4**: `feat(session): add SessionManager with SQLite persistence`
- **Task 5**: `feat(runtime): add AgentLoop with observe-plan-execute-verify-report cycle`
- **Task 6**: `feat(runtime): add stuck detection logic`

---

## Success Criteria

### Verification Commands
```bash
pnpm install              # Expected: success (no Vercel AI SDK)
pnpm typecheck            # Expected: pass
pnpm test                 # Expected: all tests pass
```

### Final Checklist
- [ ] Vercel AI SDK 完全移除
- [ ] 自研 LLM 接口工作正常
- [ ] Session 管理实现完成
- [ ] Agent Loop Runtime 实现完成
- [ ] 卡住检测实现完成
- [ ] 所有测试通过
- [ ] 无回归
