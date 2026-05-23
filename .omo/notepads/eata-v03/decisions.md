# Decisions: EATA v0.3 Sub-Agent Audit Chain

## ExecutionAnalyst refactor
- **Decision**: Remove the legacy `analyze(state)` method entirely; replace with `run(input: SubAgentInput)` conforming to `SubAgentOutput`.
- **Rationale**: The old method was not compatible with the audit chain contract. Keeping two methods would create ambiguity.

## Deterministic vs LLM-based agents
- **Decision**: All 4 sub-agents are fully deterministic (no LLM calls). They use keyword heuristics and rule-based scanning only.
- **Rationale**: Per plan constraint "NO real LLM calls — these are deterministic audit templates." This also eliminates flakiness and cost.

## Context threading in audit chain
- **Decision**: Each agent's output is injected into the downstream agent's `context` under a named key (e.g. `testPlannerOutput`, `executionAnalystOutput`, `securityReviewerOutput`).
- **Rationale**: Allows `ReportSynthesizer` to read all upstream outputs via known context keys. The `ReportSynthesizer.CONTEXT_KEYS` static makes these keys explicit and discoverable.

## Worst-severity aggregation
- **Decision**: `ReportSynthesizer` reports the worst (most severe) finding across all upstream outputs.
- **Rationale**: Standard audit practice — a chain is as weak as its most critical finding.

## `chainOrder` is hardcoded
- **Decision**: `chainOrder` is a literal 4-element array in the `runAuditChain` function, not derived dynamically.
- **Rationale**: The pipeline order is a fixed contract. Hardcoding it makes it self-documenting and type-safe.

---

## v0.3 Remaining Task Verification (2026-05-21)

### Verified Status vs. Initial Assessment

| Task | Initial | Verified | Key Evidence |
|------|---------|----------|--------------|
| T17 | COMPLETE | **COMPLETE** | report-synthesizer.ts (101 lines) + tests |
| T18 | PARTIAL | **PARTIAL** | runAuditChain exists (155 lines) but NOT called from graph.ts |
| T19 | PARTIAL | **COMPLETE** | WorkerPool IS integrated: server.ts uses getWorkerPool(), routes/tasks.ts uses pool.submit() |
| T20 | COMPLETE | **COMPLETE** | report-graph/nodes/pattern.ts with DI |
| T21 | COMPLETE | **COMPLETE** | report-graph/nodes/summarize.ts |
| T22 | COMPLETE | **COMPLETE** | nodes/report.ts calls createReportGraph() |
| T23 | MISSING | **MISSING** | Zero i18n test files found |
| T24 | MISSING | **MISSING** | Only ci.yml exists, no CD workflow |
| T25 | MISSING | **MISSING** | Zero priority-related UI components |
| T26 | MISSING | **MISSING** | Zero audit display UI components |
| T27 | MISSING | **MISSING** | Zero few-shot management UI |
| T28 | MISSING | **PARTIAL** | Dockerfile exists with T28 limitation comments |
| T29 | MISSING | **MISSING** | i18n config exists but no LanguageSwitch component |
| T30 | PARTIAL | **PARTIAL** | @ai-sdk/openai imported but NOT in package.json |
| F1-F6 | NOT STARTED | **NOT STARTED** | No verification artifacts exist |

### Correction: Task 19 upgraded from PARTIAL to COMPLETE
- tasks/runner.ts creates WorkerPoolManager with priority queue (high/medium/low)
- server.ts decorates with workerPool, adds shutdown hook
- routes/tasks.ts uses pool.submit() with priority
- Old taskQueue.ts is dead code (only in its own test file)

### Critical Blocker: @ai-sdk/openai
- Imported in 13+ files (provider-factory.ts, llm.ts, report-graph nodes)
- NOT declared in any package.json
- NOT installed in node_modules
- Will cause runtime failures for ALL graph execution and report generation

---

## T24: CD Workflow Architecture (2026-05-21)

### CI Gate pattern in CD workflow
- **Decision**: CD workflow includes its own `test` job (mirroring ci.yml) instead of using `workflow_run`.
- **Rationale**: ci.yml only triggers on `push` to `main` and `pull_request` to `main`. CD triggers on `release/**` branches and `v*` tags — ci.yml would never fire for those refs. A `workflow_run` dependency would be a dead condition. Including the test job inline is the only way to gate CD on CI for release branches without modifying ci.yml.

### Three Docker images from one Dockerfile
- **Decision**: Server, dashboard, and combined images all built from the same Dockerfile with the same `runner` target.
- **Rationale**: docker-compose.yml already uses the same image with different `command:` overrides. The differentiation is at runtime, not build time. Separate GHCR repos (`eata-server`, `eata-dashboard`, `eata`) give semantic clarity for consumers.

### Dockerfile stage naming
- **Decision**: Renamed runtime stage from unnamed `FROM node:18-alpine` to `FROM node:18-alpine AS runner`.
- **Rationale**: CD workflow uses `target: runner` in build-push-action. Named stages also make `docker build --target builder` (deps-only) and `--target runner` (full) explicit and self-documenting.

---

## F1: Plan Compliance Audit Results (2026-05-21 20:59)

### Verdict: REJECT (1 blocker)

**Blocking Issue**: 8 server tests failing in priorityQueue.test.ts — priority schema field uses .optional() but tests expect .default('medium').

**Fix Required**: In packages/shared-types/src/task.ts, change priority: TaskPriorityEnum.optional() to priority: TaskPriorityEnum.default('medium') in both CreateTaskRequestSchema and TaskSchema.

### Test Suite Summary
- agent-core: 759 pass / 0 fail
- dashboard: 119 pass / 0 fail
- E2E v0.3: 19 pass / 0 fail
- server: 145 pass / 8 fail

### All 30 Tasks Verified
All tasks have substantive implementation. Minor deviations only:
- T3: loader.ts merged into store.ts
- T9-T11: Class exports vs factory functions (naming only)
- T12: fewShotLoader not injectable via options, hardwired import
- data/few-shot-examples/ is placeholder only
