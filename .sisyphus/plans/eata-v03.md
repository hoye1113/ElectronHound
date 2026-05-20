# EATA v0.3: Enterprise-Grade Testing Agent

## TL;DR

> **Quick Summary**: 将 EATA 从单用户本地工具升级为可部署的企业级测试平台。引入多语言国际化、Sub-Agent 多角色审核、AI 能力增强（Few-shot + Context Learning）、多任务并行执行、Report Graph 4 路并行分析接入主循环、以及完整的 CI/CD 与 Docker 容器化部署方案。
> 
> **Deliverables**:
> - **国际化**: react-i18next 中英文切换，所有 UI 文本可配置
> - **多角色审核**: 4 个 Sub-Agent（测试规划师、执行分析师、安全审查员、综合报告师）串行审核链
> - **AI 能力增强**: Few-shot 示例注入、上下文学习、动态 Prompt 模板
> - **多任务并行**: Worker 池 (max 3)、任务优先级队列、资源隔离
> - **Report Graph**: 4 路并行分析（Safety/Perf/A11y/Pattern）→ Summarize → 主循环集成
> - **CI/CD & Docker**: GitHub Actions 自动化、Docker 镜像、一键部署
> 
> **Estimated Effort**: Large (4-6 weeks for 1 developer, 2-3 weeks for 2 developers)
> **Parallel Execution**: YES - 6 waves, max 8 concurrent tasks
> **Critical Path**: T1 → T5 → T12 → T20 → T26 → F1-F4

---

## Context

### Original Request
v0.3 将 EATA 从"能跑"升级为"能部署、能协作、能扩展"。核心目标：
1. 让非技术用户能用（多语言）
2. 让测试结果更可信（多角色审核 + AI 增强）
3. 让效率更高（并行执行 + Report Graph）
4. 让部署更简单（CI/CD + Docker）

### Interview Summary
**Key Discussions**:
- 6 个方向全部确认，优先级：CI/CD > Report Graph > 多任务并行 > 多角色审核 > AI 增强 > 国际化
- 国际化仅支持中英文（v0.3 scope），不扩展其他语言
- Sub-Agent 审核链为串行，非并行（保证审核深度）
- Worker 池上限 3 个并发任务（资源限制考虑）
- CI/CD 优先 GitHub Actions，Docker 支持 Windows/Linux
- Report Graph 必须接入主循环，不能只停留在独立模块

**Research Findings (from explore agent)**:
- 国际化：Dashboard 使用 React + Zustand，无现有 i18n 基础设施
- Sub-Agent：当前 plan/verify 节点为单 LLM 调用，无多 Agent 架构
- AI 增强：plan.ts/verify.ts 有 DI 注入点，但缺少 Few-shot 示例管理
- 多任务并行：workerManager.ts 仅支持单任务执行，无队列管理
- Report Graph：`report-graph/` 目录已存在但未被主循环调用
- CI/CD：当前无 CI 配置，无 Dockerfile

### Metis Review
**Identified Gaps** (all addressed):
- 国际化缺少翻译工作流 → RESOLVED: 新建 i18n 配置 + 翻译资源文件
- Sub-Agent 架构设计不明确 → RESOLVED: 明确 4 角色串行审核链
- Few-shot 示例存储位置未定义 → RESOLVED: `data/few-shot-examples/` 目录
- Worker 池资源隔离方案缺失 → RESOLVED: 每个 Worker 独立 MCP 进程
- Report Graph 与主循环集成点不明确 → RESOLVED: report.ts 节点调用 createReportGraph
- Docker 多平台构建策略未定 → RESOLVED: `docker buildx` 多架构支持

---

## Work Objectives

### Core Objective
将 EATA 从单用户本地工具升级为可部署的企业级测试平台，支持多语言、多角色审核、AI 增强、并行执行、完整报告分析和一键部署。

### Concrete Deliverables
- `apps/dashboard/src/i18n/` — 国际化配置 + 中英文翻译资源
- `packages/agent-core/src/sub-agents/` — 4 角色 Sub-Agent 审核链
- `packages/agent-core/src/prompts/few-shot/` — Few-shot 示例管理 + 动态注入
- `apps/server/src/services/workerPool.ts` — Worker 池 + 优先级队列
- `packages/agent-core/src/nodes/report.ts` — Report Graph 接入主循环
- `.github/workflows/` — GitHub Actions CI/CD 配置
- `Dockerfile` + `docker-compose.yml` — Docker 容器化配置

### Definition of Done
- [ ] Dashboard 支持中英文切换，所有 UI 文本可配置
- [ ] 4 角色 Sub-Agent 审核链正常工作，输出结构化审核报告
- [ ] Few-shot 示例可注入到 plan/verify 节点，提升测试准确性
- [ ] 最多 3 个任务可并行执行，优先级队列正常工作
- [ ] Report Graph 4 路并行分析接入主循环，生成综合报告
- [ ] GitHub Actions 自动化测试 + Docker 镜像构建 + 一键部署
- [ ] 现有 571 测试不回归，新增测试全部通过

### Must Have
- react-i18next 中英文切换（Dashboard 所有文本）
- 4 角色 Sub-Agent 审核链（测试规划师、执行分析师、安全审查员、综合报告师）
- Few-shot 示例注入 + 上下文学习（plan/verify 节点）
- Worker 池（max 3 并发）+ 任务优先级队列
- Report Graph 4 路并行分析（Safety/Perf/A11y/Pattern）→ Summarize → 主循环
- GitHub Actions CI（test + lint + typecheck）
- Docker 容器化（Dockerfile + docker-compose）
- 现有 571 测试不能回归
- TDD for all new modules

### Must NOT Have (Guardrails)
- ❌ NO 多语言扩展（仅中英文，v0.3 scope）
- ❌ NO Sub-Agent 并行审核（串行保证深度）
- ❌ NO 非 OpenAI 兼容 LLM 支持（保持 v0.3-multi-provider 成果）
- ❌ NO Worker 池超过 3 并发（资源限制）
- ❌ NO Kubernetes 编排（Docker Compose 足够）
- ❌ NO 实时协作功能（多用户独立使用）
- ❌ NO 付费/订阅系统
- ❌ NO 跨平台 UI 测试（Windows-first）
- ❌ NO 触摸 electron-bridge-mcp 包
- ❌ NO 新增模板引擎（HTML 报告用模板字符串）
- ❌ NO AI slop: excessive comments, over-abstraction, generic names

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (v0.1-v0.2 已搭建 Vitest)
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
Wave 1 (Foundation — 基础架构):
├── Task 1: 国际化基础架构 (i18n config + useTranslation hook) [quick]
├── Task 2: Sub-Agent 类型定义 + 审核链设计 [quick]
├── Task 3: Few-shot 示例存储结构 + 加载机制 [quick]
├── Task 4: Worker 池核心架构 (TaskQueue + WorkerManager) [deep]
├── Task 5: Report Graph DI 重构 (createReportGraph options) [deep]
├── Task 6: GitHub Actions CI 配置 (test + lint + typecheck) [quick]
└── Task 7: Dockerfile + docker-compose 基础配置 [deep]

Wave 2 (Core Features — 核心功能实现):
├── Task 8: 国际化翻译资源 + Dashboard 文本替换 [deep]
├── Task 9: Sub-Agent 1: 测试规划师 (TestPlannerAgent) [deep]
├── Task 10: Sub-Agent 2: 执行分析师 (ExecutionAnalyst) [deep]
├── Task 11: Sub-Agent 3: 安全审查员 (SecurityReviewer) [deep]
├── Task 12: Few-shot 注入 plan/verify 节点 (depends: 3) [deep]
├── Task 13: Worker 池实现 (max 3 并发) [deep]
├── Task 14: Report Graph Safety 节点 DI [deep]
├── Task 15: Report Graph Performance 节点 DI [deep]
└── Task 16: Report Graph A11y 节点 DI [deep]

Wave 3 (Integration — 功能集成):
├── Task 17: Sub-Agent 4: 综合报告师 (ReportSynthesizer) [deep]
├── Task 18: Sub-Agent 审核链接入主循环 (depends: 9-11, 17) [deep]
├── Task 19: Worker 优先级队列 + 资源隔离 [deep]
├── Task 20: Report Graph Pattern 节点 DI [deep]
├── Task 21: Report Graph Summarize 节点集成 [deep]
├── Task 22: 主循环调用 Report Graph (nodes/report.ts) [deep]
├── Task 23: 国际化 Dashboard 测试 [deep]
└── Task 24: GitHub Actions CD + Docker 构建 [deep]

Wave 4 (UX + Polish — 用户体验优化):
├── Task 25: Dashboard 多任务视图 + 优先级控制 [visual-engineering]
├── Task 26: Sub-Agent 审核报告展示 [visual-engineering]
├── Task 27: Few-shot 示例管理 UI [visual-engineering]
├── Task 28: Docker 镜像优化 + 文档 [deep]
├── Task 29: 国际化语言切换 UI [visual-engineering]
└── Task 30: E2E 测试: 完整流程验证 [deep]

Wave FINAL (After ALL tasks — 6 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
├── F4: Scope fidelity check (deep)
├── F5: Docker deployment verification (unspecified-high)
└── F6: i18n quality check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 8, 23, 29 | 1 |
| 2 | — | 9-11, 17 | 1 |
| 3 | — | 12 | 1 |
| 4 | — | 13, 19 | 1 |
| 5 | — | 14-16, 20-22 | 1 |
| 6 | — | 24 | 1 |
| 7 | — | 24, 28 | 1 |
| 8 | 1 | 23 | 2 |
| 9 | 2 | 18 | 2 |
| 10 | 2 | 18 | 2 |
| 11 | 2 | 18 | 2 |
| 12 | 3 | 18 | 2 |
| 13 | 4, 19 | 25, 30 | 2 |
| 14 | 5 | 21 | 2 |
| 15 | 5 | 21 | 2 |
| 16 | 5 | 21 | 2 |
| 17 | 2, 9-11 | 18 | 3 |
| 18 | 9-11, 17 | 26, 30 | 3 |
| 19 | 4, 13 | 25 | 3 |
| 20 | 5 | 21 | 3 |
| 21 | 14-16, 20 | 22 | 3 |
| 22 | 21 | 30 | 3 |
| 23 | 1, 8 | 29 | 3 |
| 24 | 6, 7 | 28, 30 | 3 |
| 25 | 13, 19 | — | 4 |
| 26 | 18 | — | 4 |
| 27 | 12 | — | 4 |
| 28 | 7, 24 | — | 4 |
| 29 | 1, 8, 23 | — | 4 |
| 30 | 13, 18, 22, 24 | F1-F6 | 4 |

### Agent Dispatch Summary

- **Wave 1**: 7 tasks — T1 `quick`, T2 `quick`, T3 `quick`, T4 `deep`, T5 `deep`, T6 `quick`, T7 `deep`
- **Wave 2**: 9 tasks — T8 `deep`, T9 `deep`, T10 `deep`, T11 `deep`, T12 `deep`, T13 `deep`, T14 `deep`, T15 `deep`, T16 `deep`
- **Wave 3**: 8 tasks — T17 `deep`, T18 `deep`, T19 `deep`, T20 `deep`, T21 `deep`, T22 `deep`, T23 `deep`, T24 `deep`
- **Wave 4**: 6 tasks — T25 `visual-engineering`, T26 `visual-engineering`, T27 `visual-engineering`, T28 `deep`, T29 `visual-engineering`, T30 `deep`
- **FINAL**: 6 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`, F5 `unspecified-high`, F6 `deep`

---

## TODOs

### Wave 1: Foundation — 基础架构

- [ ] 1. 国际化基础架构 (i18n config + useTranslation hook)

  **What to do**:
  - 安装 `react-i18next` + `i18next` 依赖
  - 创建 `apps/dashboard/src/i18n/config.ts` — i18n 初始化配置
  - 创建 `apps/dashboard/src/i18n/en.json` — 英文翻译资源（空模板）
  - 创建 `apps/dashboard/src/i18n/zh.json` — 中文翻译资源（空模板）
  - 创建 `useTranslation` hook wrapper
  - 修改 `apps/dashboard/src/App.tsx` — 引入 i18n 初始化
  - 写测试：i18n 初始化、语言切换

  **Must NOT do**:
  - 不要在 v0.3 添加其他语言（仅中英文）
  - 不要直接替换 UI 文本（T8 的事）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`frontend-interface-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T8, T23, T29
  - **Blocked By**: None

  **References**:
  - `apps/dashboard/src/App.tsx` — 当前应用入口
  - react-i18next docs: https://react.i18next.com/

  **Acceptance Criteria**:
  - [ ] `react-i18next` 和 `i18next` 安装在 dependencies
  - [ ] `i18n/config.ts` 正确初始化，默认语言为英文
  - [ ] `en.json` 和 `zh.json` 存在且结构一致
  - [ ] `useTranslation` hook 可正常使用
  - [ ] `pnpm test apps/dashboard` → PASS

  **QA Scenarios**:
  ```
  Scenario: i18n initializes correctly
    Tool: Bash
    Steps:
      1. Run `pnpm test apps/dashboard/src/__tests__/i18n.test.ts`
      2. Assert i18n initializes with default language 'en'
      3. Assert translation files load correctly
    Expected Result: i18n setup complete
    Evidence: .sisyphus/evidence/v3-task1-i18n.txt

  Scenario: Language switching works
    Tool: Bash
    Steps:
      1. Run language switch test
      2. Assert `i18n.changeLanguage('zh')` succeeds
      3. Assert translations change accordingly
    Expected Result: Language toggle functional
    Evidence: .sisyphus/evidence/v3-task1-i18n-switch.txt
  ```

  **Commit**: YES
  - Message: `feat(i18n): add react-i18next foundation with en/zh support`
  - Files: `apps/dashboard/src/i18n/*`, `apps/dashboard/src/App.tsx`, `package.json`

- [ ] 2. Sub-Agent 类型定义 + 审核链设计

  **What to do**:
  - 创建 `packages/agent-core/src/sub-agents/types.ts` — Sub-Agent 类型定义
  - 定义 `SubAgentRole`: 'test-planner' | 'execution-analyst' | 'security-reviewer' | 'report-synthesizer'
  - 定义 `SubAgentInput` / `SubAgentOutput` 接口
  - 定义 `AuditChainResult` 接口（4 角色串联输出）
  - 创建 `packages/agent-core/src/sub-agents/index.ts` — 导出类型
  - 写测试：类型定义验证

  **Must NOT do**:
  - 不要实现具体 Sub-Agent 逻辑（T9-11, T17 的事）
  - 不要修改现有节点（plan/verify）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T9-11, T17
  - **Blocked By**: None

  **References**:
  - `packages/agent-core/src/state.ts` — 当前状态类型
  - `packages/shared-types/src/task.ts` — 任务类型

  **Acceptance Criteria**:
  - [ ] `SubAgentRole` 包含 4 个角色
  - [ ] `SubAgentInput` / `SubAgentOutput` 接口定义清晰
  - [ ] `AuditChainResult` 包含 4 角色输出
  - [ ] `pnpm test packages/agent-core` → PASS

  **QA Scenarios**:
  ```
  Scenario: Sub-Agent types are valid
    Tool: Bash
    Steps:
      1. Run `pnpm test packages/agent-core/src/__tests__/sub-agent-types.test.ts`
      2. Assert Zod schema validation passes
      3. Assert TypeScript compilation succeeds
    Expected Result: Type definitions correct
    Evidence: .sisyphus/evidence/v3-task2-types.txt
  ```

  **Commit**: YES
  - Message: `feat(sub-agents): add role types and audit chain interfaces`
  - Files: `packages/agent-core/src/sub-agents/types.ts`, `packages/agent-core/src/sub-agents/index.ts`

- [ ] 3. Few-shot 示例存储结构 + 加载机制

  **What to do**:
  - 创建 `packages/agent-core/src/prompts/few-shot/types.ts` — Few-shot 示例类型
  - 创建 `packages/agent-core/src/prompts/few-shot/store.ts` — 示例存储管理
  - 创建 `packages/agent-core/src/prompts/few-shot/loader.ts` — 示例加载机制
  - 定义 `FewShotExample` 接口：`{ goal, steps, expectedResult, metadata }`
  - 实现 `loadExamples(context)` — 根据上下文加载匹配示例
  - 创建 `data/few-shot-examples/` 目录 — 示例存储位置
  - 写测试：示例加载、上下文匹配

  **Must NOT do**:
  - 不要在 plan/verify 节点注入（T12 的事）
  - 不要实现复杂的向量相似度（简单关键词匹配足够）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T12
  - **Blocked By**: None

  **References**:
  - `packages/agent-core/src/nodes/plan.ts` — 待注入的节点
  - `data/` — 现有数据目录

  **Acceptance Criteria**:
  - [ ] `FewShotExample` 接口定义清晰
  - [ ] `loadExamples()` 可根据 goal 关键词加载示例
  - [ ] `data/few-shot-examples/` 目录存在
  - [ ] `pnpm test packages/agent-core` → PASS

  **QA Scenarios**:
  ```
  Scenario: Few-shot examples load correctly
    Tool: Bash
    Steps:
      1. Create sample example JSON
      2. Run loader test
      3. Assert example loaded with correct structure
    Expected Result: Few-shot storage and loading works
    Evidence: .sisyphus/evidence/v3-task3-fewshot.txt
  ```

  **Commit**: YES
  - Message: `feat(prompts): add few-shot example storage and loader`
  - Files: `packages/agent-core/src/prompts/few-shot/*`, `data/few-shot-examples/`

- [ ] 4. Worker 池核心架构 (TaskQueue + WorkerManager)

  **What to do**:
  - 创建 `apps/server/src/services/workerPool/types.ts` — Worker 池类型
  - 定义 `TaskQueue` 类：优先级队列（FIFO + priority）
  - 创建 `apps/server/src/services/workerPool/queue.ts` — 队列实现
  - 创建 `apps/server/src/services/workerPool/manager.ts` — 池管理器
  - 定义 `WorkerPoolConfig`: `{ maxWorkers: 3, resourceLimits }`
  - 实现 `submit(task)`, `cancel(taskId)`, `getStatus(taskId)` 方法
  - 写测试：队列 FIFO、优先级、池限制

  **Must NOT do**:
  - 不要实现真实 Worker 执行（T13 的事）
  - 不要修改现有 workerManager.ts

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T13, T19
  - **Blocked By**: None

  **References**:
  - `apps/server/src/services/workerManager.ts` — 现有单任务管理器
  - `packages/shared-types/src/ipc.ts` — JSON-RPC 消息

  **Acceptance Criteria**:
  - [ ] `TaskQueue` 支持优先级（high > medium > low）
  - [ ] `WorkerPoolManager` 限制 max 3 并发
  - [ ] `submit()` 返回 taskId
  - [ ] `cancel()` 正确终止任务
  - [ ] `pnpm test apps/server` → PASS

  **QA Scenarios**:
  ```
  Scenario: Task queue respects priority
    Tool: Bash
    Steps:
      1. Submit low priority, then high priority task
      2. Assert high priority dequeued first
    Expected Result: Priority queue works
    Evidence: .sisyphus/evidence/v3-task4-queue.txt

  Scenario: Worker pool limits concurrent tasks
    Tool: Bash
    Steps:
      1. Submit 4 tasks with maxWorkers=3
      2. Assert only 3 running simultaneously
    Expected Result: Pool limits enforced
    Evidence: .sisyphus/evidence/v3-task4-pool.txt
  ```

  **Commit**: YES
  - Message: `feat(worker): add WorkerPool with priority queue architecture`
  - Files: `apps/server/src/services/workerPool/*`

- [ ] 5. Report Graph DI 重构 (createReportGraph options)

  **What to do**:
  - 修改 `packages/agent-core/src/report-graph/graph.ts`: `createReportGraph(options?: ReportGraphOptions)`
  - 定义 `ReportGraphOptions`: `{ safety?, perf?, a11y?, pattern?, summarize? }`
  - 确保 DI 支持：每个节点可接受 `generateObject` 注入
  - 修改 `packages/agent-core/src/report-graph/nodes/` — 添加 DI 工厂函数
  - 更新 `packages/agent-core/src/report-graph/index.ts` — 导出新接口
  - 写测试：DI 注入、向后兼容

  **Must NOT do**:
  - 不要修改节点核心逻辑（只添加 DI 参数）
  - 不要破坏现有 `createReportGraph()` 无参数调用

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T14-16, T20-22
  - **Blocked By**: None

  **References**:
  - `packages/agent-core/src/report-graph/graph.ts` — 当前图定义
  - `packages/agent-core/src/report-graph/nodes/` — 4 个分析节点

  **Acceptance Criteria**:
  - [ ] `createReportGraph(options)` 接受 DI 参数
  - [ ] 每个节点支持 `generateObject` 注入
  - [ ] 无参数调用 `createReportGraph()` 仍工作
  - [ ] `pnpm test packages/agent-core` → PASS

  **QA Scenarios**:
  ```
  Scenario: Report Graph DI options propagate
    Tool: Bash
    Steps:
      1. Run `pnpm test packages/agent-core/src/report-graph/__tests__/`
      2. Assert DI injection test passes
      3. Assert backward compatibility test passes
    Expected Result: Report Graph supports DI
    Evidence: .sisyphus/evidence/v3-task5-report-di.txt
  ```

  **Commit**: YES
  - Message: `refactor(report-graph): parameterize createReportGraph with DI options`
  - Files: `packages/agent-core/src/report-graph/graph.ts`, `nodes/*.ts`, `index.ts`

- [ ] 6. GitHub Actions CI 配置 (test + lint + typecheck)

  **What to do**:
  - 创建 `.github/workflows/ci.yml` — CI 配置
  - 触发条件：push to `main`, pull requests
  - 步骤：
    - Checkout code
    - Setup Node.js (18+) + pnpm
    - Install dependencies
    - Typecheck: `pnpm run typecheck`
    - Lint: `pnpm run lint`
    - Test: `pnpm test`
    - Coverage report (optional)
  - 配置缓存：pnpm store cache
  - 写测试：本地验证 YAML 语法

  **Must NOT do**:
  - 不要配置 CD（T24 的事）
  - 不要配置 Docker build（T24 的事）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T24
  - **Blocked By**: None

  **References**:
  - GitHub Actions docs: https://docs.github.com/en/actions
  - `package.json` — 脚本配置

  **Acceptance Criteria**:
  - [ ] `.github/workflows/ci.yml` 存在且语法正确
  - [ ] CI 流程包含 typecheck + lint + test
  - [ ] 本地 YAML lint 通过

  **QA Scenarios**:
  ```
  Scenario: CI YAML is valid
    Tool: Bash
    Steps:
      1. Run `npx yaml-lint .github/workflows/ci.yml`
      2. Assert no syntax errors
    Expected Result: CI config valid
    Evidence: .sisyphus/evidence/v3-task6-ci.txt
  ```

  **Commit**: YES
  - Message: `ci: add GitHub Actions workflow for test/lint/typecheck`
  - Files: `.github/workflows/ci.yml`

- [ ] 7. Dockerfile + docker-compose 基础配置

  **What to do**:
  - 创建 `Dockerfile` — 多阶段构建镜像
  - 基础镜像：`node:18-alpine`
  - 构建步骤：install pnpm → install deps → build → 运行
  - 创建 `docker-compose.yml` — 服务编排
  - 服务：`server` + `dashboard` (如果分开)
  - 网络配置：暴露端口 3000 (API) + 5173 (Dashboard)
  - 创建 `.dockerignore` — 排除 node_modules, .git 等
  - 写测试：本地 `docker build` 验证

  **Must NOT do**:
  - 不要配置多架构构建（T28 的事）
  - 不要配置环境变量持久化

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T24, T28
  - **Blocked By**: None

  **References**:
  - Docker docs: https://docs.docker.com/
  - `apps/server/` — 服务器应用
  - `apps/dashboard/` — Dashboard 应用

  **Acceptance Criteria**:
  - [ ] `Dockerfile` 存在且语法正确
  - [ ] `docker-compose.yml` 定义服务编排
  - [ ] `.dockerignore` 排除不必要文件
  - [ ] 本地 `docker build` 成功

  **QA Scenarios**:
  ```
  Scenario: Docker image builds successfully
    Tool: Bash
    Steps:
      1. Run `docker build -t eata-test .`
      2. Assert build completes without errors
      3. Assert image size < 500MB
    Expected Result: Docker build works
    Evidence: .sisyphus/evidence/v3-task7-docker.txt
  ```

  **Commit**: YES
  - Message: `chore(docker): add Dockerfile and docker-compose for containerization`
  - Files: `Dockerfile`, `docker-compose.yml`, `.dockerignore`

### Wave 2: Core Features — 核心功能实现

- [ ] 8. 国际化翻译资源 + Dashboard 文本替换

  **What to do**:
  - 填充 `apps/dashboard/src/i18n/en.json` — 所有 Dashboard 英文文本
  - 填充 `apps/dashboard/src/i18n/zh.json` — 所有 Dashboard 中文文本
  - 修改 `apps/dashboard/src/pages/` — 替换所有硬编码文本为 `t('key')`
  - 修改 `apps/dashboard/src/components/` — 替换组件文本
  - 关键文本域：导航、按钮、表单、错误消息、状态文本
  - 写测试：验证所有文本有对应翻译

  **Must NOT do**:
  - 不要添加其他语言
  - 不要修改组件逻辑（只替换文本）

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`frontend-interface-design`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T23
  - **Blocked By**: T1 (i18n 基础)

  **References**:
  - `apps/dashboard/src/pages/` — 页面组件
  - `apps/dashboard/src/components/` — 通用组件

  **Acceptance Criteria**:
  - [ ] 所有 Dashboard 文本通过 `t()` 引用
  - [ ] `en.json` 和 `zh.json` 包含所有 key
  - [ ] Dashboard 编译无错误
  - [ ] `pnpm test apps/dashboard` → PASS

  **QA Scenarios**:
  ```
  Scenario: All text is internationalized
    Tool: Bash
    Steps:
      1. Run i18n coverage test
      2. Assert no hardcoded strings in rendered output
      3. Assert all translation keys exist in both en.json and zh.json
    Expected Result: Complete i18n coverage
    Evidence: .sisyphus/evidence/v3-task8-i18n-text.txt
  ```

  **Commit**: YES
  - Message: `feat(i18n): add en/zh translations and replace hardcoded strings`
  - Files: `apps/dashboard/src/i18n/*.json`, `pages/*.tsx`, `components/*.tsx`

- [ ] 9. Sub-Agent 1: 测试规划师 (TestPlannerAgent)

  **What to do**:
  - 创建 `packages/agent-core/src/sub-agents/test-planner.ts`
  - 实现 `createTestPlannerAgent(options)` 工厂函数
  - 角色定义：分析测试目标，生成详细测试计划
  - 输入：`{ goal, targetAppPath, context }`
  - 输出：`{ testPlan, priorities, constraints }`
  - 使用 `generateObject` 调用 LLM 生成结构化计划
  - 写测试：mock generateObject 验证输出结构

  **Must NOT do**:
  - 不要实现审核链逻辑（T18 的事）
  - 不要修改 plan 节点

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T18
  - **Blocked By**: T2 (类型定义)

  **References**:
  - `packages/agent-core/src/sub-agents/types.ts` — T2 创建的类型
  - `packages/agent-core/src/nodes/plan.ts` — 参考 LLM 调用模式

  **Acceptance Criteria**:
  - [ ] `createTestPlannerAgent()` 返回可调用函数
  - [ ] 输出符合 `SubAgentOutput` 接口
  - [ ] `pnpm test packages/agent-core` → PASS

  **QA Scenarios**:
  ```
  Scenario: TestPlanner generates structured plan
    Tool: Bash
    Steps:
      1. Create TestPlanner with mock generateObject
      2. Call with test goal
      3. Assert output contains testPlan, priorities, constraints
    Expected Result: TestPlanner outputs structured plan
    Evidence: .sisyphus/evidence/v3-task9-planner.txt
  ```

  **Commit**: YES
  - Message: `feat(sub-agents): add TestPlannerAgent for test planning`
  - Files: `packages/agent-core/src/sub-agents/test-planner.ts`, tests

- [ ] 10. Sub-Agent 2: 执行分析师 (ExecutionAnalyst)

  **What to do**:
  - 创建 `packages/agent-core/src/sub-agents/execution-analyst.ts`
  - 实现 `createExecutionAnalyst(options)` 工厂函数
  - 角色定义：分析测试执行结果，识别问题和模式
  - 输入：`{ executionSteps, results, context }`
  - 输出：`{ analysis, issues, recommendations }`
  - 使用 `generateObject` 调用 LLM 分析
  - 写测试：mock generateObject 验证输出

  **Must NOT do**:
  - 不要实现审核链逻辑（T18 的事）
  - 不要修改 execute 节点

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T18
  - **Blocked By**: T2

  **References**:
  - `packages/agent-core/src/sub-agents/types.ts`
  - `packages/agent-core/src/nodes/execute.ts`

  **Acceptance Criteria**:
  - [ ] `createExecutionAnalyst()` 返回可调用函数
  - [ ] 输出符合 `SubAgentOutput` 接口
  - [ ] `pnpm test packages/agent-core` → PASS

  **QA Scenarios**:
  ```
  Scenario: ExecutionAnalyst identifies issues
    Tool: Bash
    Steps:
      1. Create ExecutionAnalyst with mock generateObject
      2. Call with execution results
      3. Assert output contains analysis, issues, recommendations
    Expected Result: ExecutionAnalyst provides structured analysis
    Evidence: .sisyphus/evidence/v3-task10-analyst.txt
  ```

  **Commit**: YES
  - Message: `feat(sub-agents): add ExecutionAnalyst for result analysis`
  - Files: `packages/agent-core/src/sub-agents/execution-analyst.ts`, tests

- [ ] 11. Sub-Agent 3: 安全审查员 (SecurityReviewer)

  **What to do**:
  - 创建 `packages/agent-core/src/sub-agents/security-reviewer.ts`
  - 实现 `createSecurityReviewer(options)` 工厂函数
  - 角色定义：审查测试行为和应用安全性
  - 输入：`{ testSteps, observations, context }`
  - 输出：`{ securityAssessment, risks, mitigations }`
  - 使用 `generateObject` 调用 LLM 审查
  - 写测试：mock generateObject 验证输出

  **Must NOT do**:
  - 不要实现审核链逻辑（T18 的事）
  - 不要修改现有节点

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T18
  - **Blocked By**: T2

  **References**:
  - `packages/agent-core/src/sub-agents/types.ts`

  **Acceptance Criteria**:
  - [ ] `createSecurityReviewer()` 返回可调用函数
  - [ ] 输出符合 `SubAgentOutput` 接口
  - [ ] `pnpm test packages/agent-core` → PASS

  **QA Scenarios**:
  ```
  Scenario: SecurityReviewer identifies risks
    Tool: Bash
    Steps:
      1. Create SecurityReviewer with mock generateObject
      2. Call with test steps
      3. Assert output contains securityAssessment, risks
    Expected Result: SecurityReviewer provides security analysis
    Evidence: .sisyphus/evidence/v3-task11-security.txt
  ```

  **Commit**: YES
  - Message: `feat(sub-agents): add SecurityReviewer for security assessment`
  - Files: `packages/agent-core/src/sub-agents/security-reviewer.ts`, tests

- [ ] 12. Few-shot 注入 plan/verify 节点

  **What to do**:
  - 修改 `packages/agent-core/src/nodes/plan.ts` — 添加 Few-shot 示例注入
  - 创建 `PlanNodeOptions`: `{ generateObject?, fewShotLoader? }`
  - 在 `createPlanNode` 中加载 Few-shot 示例
  - 将示例注入到 LLM prompt 中
  - 修改 `packages/agent-core/src/nodes/verify.ts` — 同样添加 Few-shot
  - 创建 `VerifyNodeOptions`: `{ generateObject?, fewShotLoader? }`
  - 写测试：验证 Few-shot 示例正确注入到 prompt

  **Must NOT do**:
  - 不要修改节点核心逻辑
  - 不要破坏现有 DI 注入

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T18
  - **Blocked By**: T3 (Few-shot 存储)

  **References**:
  - `packages/agent-core/src/prompts/few-shot/loader.ts` — T3 创建的 loader
  - `packages/agent-core/src/nodes/plan.ts`
  - `packages/agent-core/src/nodes/verify.ts`

  **Acceptance Criteria**:
  - [ ] `PlanNodeOptions` 包含 `fewShotLoader`
  - [ ] `VerifyNodeOptions` 包含 `fewShotLoader`
  - [ ] Few-shot 示例正确注入到 LLM prompt
  - [ ] `pnpm test packages/agent-core` → PASS

  **QA Scenarios**:
  ```
  Scenario: Few-shot examples injected into prompt
    Tool: Bash
    Steps:
      1. Create plan node with mock fewShotLoader
      2. Call plan node
      3. Assert LLM call includes few-shot examples in prompt
    Expected Result: Few-shot examples enhance prompt
    Evidence: .sisyphus/evidence/v3-task12-fewshot-inject.txt
  ```

  **Commit**: YES
  - Message: `feat(prompts): inject few-shot examples into plan/verify nodes`
  - Files: `packages/agent-core/src/nodes/plan.ts`, `verify.ts`

- [ ] 13. Worker 池实现 (max 3 并发)

  **What to do**:
  - 实现 `WorkerPoolManager` 真实执行逻辑
  - 修改 `apps/server/src/services/workerManager.ts` — 集成新池管理器
  - 实现任务提交、执行、取消、状态查询
  - 每个 Worker 独立 spawn 子进程
  - 资源隔离：每个 Worker 独立 MCP 进程
  - 写测试：并发执行、资源限制、取消机制

  **Must NOT do**:
  - 不要超过 3 并发
  - 不要共享 MCP 进程

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T19, T25, T30
  - **Blocked By**: T4 (架构), T19 (优先级队列)

  **References**:
  - `apps/server/src/services/workerPool/manager.ts` — T4 创建
  - `apps/server/src/services/workerManager.ts` — 现有管理器
  - `packages/agent-core/src/worker-entry.ts` — Worker 入口

  **Acceptance Criteria**:
  - [ ] 最多 3 任务并行执行
  - [ ] 每个 Worker 独立 MCP 进程
  - [ ] 任务取消正常工作
  - [ ] `pnpm test apps/server` → PASS

  **QA Scenarios**:
  ```
  Scenario: Worker pool handles concurrent tasks
    Tool: Bash
    Steps:
      1. Submit 3 tasks simultaneously
      2. Assert all 3 run in parallel
      3. Assert each has independent MCP process
    Expected Result: Parallel execution works
    Evidence: .sisyphus/evidence/v3-task13-pool.txt
  ```

  **Commit**: YES
  - Message: `feat(worker): implement WorkerPool with 3 concurrent workers`
  - Files: `apps/server/src/services/workerPool/*`, `workerManager.ts`

- [ ] 14. Report Graph Safety 节点 DI

  **What to do**:
  - 修改 `packages/agent-core/src/report-graph/nodes/safety.ts`
  - 创建 `SafetyNodeOptions`: `{ generateObject? }`
  - 实现 `createSafetyNode(options)` 工厂函数
  - 保持向后兼容：无参数调用仍工作
  - 写测试：DI 注入验证

  **Must NOT do**:
  - 不要修改 Safety 节点核心逻辑
  - 不要破坏现有测试

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T21
  - **Blocked By**: T5

  **References**:
  - `packages/agent-core/src/report-graph/nodes/safety.ts`

  **Acceptance Criteria**:
  - [ ] `SafetyNodeOptions` 定义
  - [ ] `createSafetyNode(options)` 工厂函数
  - [ ] `pnpm test packages/agent-core` → PASS

  **QA Scenarios**:
  ```
  Scenario: Safety node accepts DI options
    Tool: Bash
    Steps:
      1. Run safety node test with mock generateObject
      2. Assert DI injection works
    Expected Result: Safety node supports DI
    Evidence: .sisyphus/evidence/v3-task14-safety.txt
  ```

  **Commit**: YES
  - Message: `refactor(report-graph): add DI support to safety node`
  - Files: `packages/agent-core/src/report-graph/nodes/safety.ts`

- [ ] 15. Report Graph Performance 节点 DI

  **What to do**:
  - 修改 `packages/agent-core/src/report-graph/nodes/performance.ts`
  - 创建 `PerformanceNodeOptions`: `{ generateObject? }`
  - 实现 `createPerformanceNode(options)` 工厂函数
  - 保持向后兼容
  - 写测试：DI 注入验证

  **Must NOT do**:
  - 不要修改 Performance 节点核心逻辑

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T21
  - **Blocked By**: T5

  **References**:
  - `packages/agent-core/src/report-graph/nodes/performance.ts`

  **Acceptance Criteria**:
  - [ ] `PerformanceNodeOptions` 定义
  - [ ] `createPerformanceNode(options)` 工厂函数
  - [ ] `pnpm test packages/agent-core` → PASS

  **QA Scenarios**:
  ```
  Scenario: Performance node accepts DI options
    Tool: Bash
    Steps:
      1. Run performance node test with mock generateObject
      2. Assert DI injection works
    Expected Result: Performance node supports DI
    Evidence: .sisyphus/evidence/v3-task15-perf.txt
  ```

  **Commit**: YES
  - Message: `refactor(report-graph): add DI support to performance node`
  - Files: `packages/agent-core/src/report-graph/nodes/performance.ts`

- [ ] 16. Report Graph A11y 节点 DI

  **What to do**:
  - 修改 `packages/agent-core/src/report-graph/nodes/accessibility.ts`
  - 创建 `AccessibilityNodeOptions`: `{ generateObject? }`
  - 实现 `createAccessibilityNode(options)` 工厂函数
  - 保持向后兼容
  - 写测试：DI 注入验证

  **Must NOT do**:
  - 不要修改 A11y 节点核心逻辑

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T21
  - **Blocked By**: T5

  **References**:
  - `packages/agent-core/src/report-graph/nodes/accessibility.ts`

  **Acceptance Criteria**:
  - [ ] `AccessibilityNodeOptions` 定义
  - [ ] `createAccessibilityNode(options)` 工厂函数
  - [ ] `pnpm test packages/agent-core` → PASS

  **QA Scenarios**:
  ```
  Scenario: Accessibility node accepts DI options
    Tool: Bash
    Steps:
      1. Run a11y node test with mock generateObject
      2. Assert DI injection works
    Expected Result: Accessibility node supports DI
    Evidence: .sisyphus/evidence/v3-task16-a11y.txt
  ```

  **Commit**: YES
  - Message: `refactor(report-graph): add DI support to accessibility node`
  - Files: `packages/agent-core/src/report-graph/nodes/accessibility.ts`

---

## 后续任务摘要

由于计划长度限制，Wave 3-4 和 FINAL 的详细任务描述将在执行时补充。以下是关键任务摘要：

### Wave 3: Integration — 功能集成

| Task | 描述 | 依赖 | 预计时间 |
|------|------|------|----------|
| 17 | Sub-Agent 4: 综合报告师 (ReportSynthesizer) | T2, T9-11 | 45min |
| 18 | Sub-Agent 审核链接入主循环 | T9-11, T17 | 2h |
| 19 | Worker 优先级队列 + 资源隔离 | T4, T13 | 1.5h |
| 20 | Report Graph Pattern 节点 DI | T5 | 30min |
| 21 | Report Graph Summarize 节点集成 | T14-16, T20 | 1.5h |
| 22 | 主循环调用 Report Graph (nodes/report.ts) | T21 | 2h |
| 23 | 国际化 Dashboard 测试 | T1, T8 | 1h |
| 24 | GitHub Actions CD + Docker 构建 | T6, T7 | 2h |

### Wave 4: UX + Polish — 用户体验优化

| Task | 描述 | 依赖 | 预计时间 |
|------|------|------|----------|
| 25 | Dashboard 多任务视图 + 优先级控制 | T13, T19 | 2h |
| 26 | Sub-Agent 审核报告展示 | T18 | 1.5h |
| 27 | Few-shot 示例管理 UI | T12 | 1.5h |
| 28 | Docker 镜像优化 + 文档 | T7, T24 | 2h |
| 29 | 国际化语言切换 UI | T1, T8, T23 | 1h |
| 30 | E2E 测试: 完整流程验证 | T13, T18, T22, T24 | 3h |

### FINAL: 6 并行审核

| Task | 描述 | Agent Profile |
|------|------|---------------|
| F1 | Plan compliance audit | oracle |
| F2 | Code quality review | unspecified-high |
| F3 | Real manual QA | unspecified-high |
| F4 | Scope fidelity check | deep |
| F5 | Docker deployment verification | unspecified-high |
| F6 | i18n quality check | deep |

---

## 风险清单

### 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| Worker 池资源竞争导致性能下降 | 中 | 中 | 每个 Worker 独立 MCP 进程，资源隔离 |
| Sub-Agent 审核链延迟过高 | 中 | 中 | 串行但每个 Agent 限制 timeout |
| Report Graph 4 路并行内存占用过大 | 低 | 高 | 限制并发数，监控内存使用 |
| 国际化翻译遗漏 | 中 | 低 | 编写 i18n 覆盖率测试 |
| Docker 镜像体积过大 | 低 | 中 | 多阶段构建，清理不必要依赖 |

### 项目风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 任务依赖关系复杂，执行顺序受阻 | 中 | 中 | 严格遵循依赖矩阵，提前准备前置任务 |
| 现有测试回归 | 低 | 高 | 每次任务完成后运行全量测试 |
| 时间估算偏差 | 中 | 中 | 预留 20% buffer，及时调整 |

---

## Commit Strategy

- **T1**: `feat(i18n): add react-i18next foundation with en/zh support`
- **T2**: `feat(sub-agents): add role types and audit chain interfaces`
- **T3**: `feat(prompts): add few-shot example storage and loader`
- **T4**: `feat(worker): add WorkerPool with priority queue architecture`
- **T5**: `refactor(report-graph): parameterize createReportGraph with DI options`
- **T6**: `ci: add GitHub Actions workflow for test/lint/typecheck`
- **T7**: `chore(docker): add Dockerfile and docker-compose for containerization`
- **T8**: `feat(i18n): add en/zh translations and replace hardcoded strings`
- **T9**: `feat(sub-agents): add TestPlannerAgent for test planning`
- **T10**: `feat(sub-agents): add ExecutionAnalyst for result analysis`
- **T11**: `feat(sub-agents): add SecurityReviewer for security assessment`
- **T12**: `feat(prompts): inject few-shot examples into plan/verify nodes`
- **T13**: `feat(worker): implement WorkerPool with 3 concurrent workers`
- **T14**: `refactor(report-graph): add DI support to safety node`
- **T15**: `refactor(report-graph): add DI support to performance node`
- **T16**: `refactor(report-graph): add DI support to accessibility node`
- **T17-T30**: (见后续详细任务)

---

## Success Criteria

### Verification Commands

```bash
# 国际化验证
pnpm dev --filter dashboard
# 访问 http://localhost:5173 → 切换语言验证

# Sub-Agent 审核验证
pnpm test --filter @eata/agent-core -- sub-agents

# Few-shot 验证
pnpm test --filter @eata/agent-core -- few-shot

# Worker 池验证
pnpm test --filter @eata/server -- worker-pool

# Report Graph 验证
pnpm test --filter @eata/agent-core -- report-graph

# CI/CD 验证
# Push to branch → 观察 GitHub Actions

# Docker 验证
docker build -t eata .
docker run -p 3000:3000 -p 5173:5173 eata

# 全量测试
pnpm test
```

### Final Checklist

- [ ] Dashboard 支持中英文切换
- [ ] 4 角色 Sub-Agent 审核链正常工作
- [ ] Few-shot 示例可注入
- [ ] 最多 3 任务并行执行
- [ ] Report Graph 4 路并行分析接入主循环
- [ ] GitHub Actions CI 通过
- [ ] Docker 镜像可构建和运行
- [ ] 现有 571 测试不回归
- [ ] 所有新增测试通过

---

## 执行顺序建议

1. **Wave 1** (45min-2h): T1-T7 并行执行，建立基础架构
2. **Wave 2** (3-6h): T8-T16 并行执行，实现核心功能
3. **Wave 3** (3-5h): T17-T24 按依赖顺序执行，完成集成
4. **Wave 4** (3-5h): T25-T30 执行，优化用户体验
5. **FINAL** (1-2h): F1-F6 并行审核，验证完整性

**总计**: ~15-20 小时（单人），可并行优化至 8-12 小时
