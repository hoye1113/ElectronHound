# v0.3 Code Quality Review — Decisions

## Architectural Choices Verified

### 1. Sub-agents are NOT coupled to LLM
**Decision:** All four sub-agents (TestPlanner, ExecutionAnalyst, SecurityReviewer, ReportSynthesizer) are deterministic: keyword heuristics and data transformation only. No LLM calls embedded.
**Rationale:** This makes them fast, testable, and reliable. LLM-powered analysis happens in the report-graph nodes, which are separate.
**Validated:** Yes — confirmed by reading all 6 source files.

### 2. Duplicate types between dashboard and agent-core
**Decision:** `AuditReportView.tsx` duplicates `AuditReport`, `SubAgentOutput`, `AuditFinding`, `SubAgentRole` types from `sub-agents/types.ts`.
**Rationale:** Dashboard does not depend on `@eata/agent-core` (package boundary). Types are documented as "keep in sync if upstream changes."
**Validated:** Yes — this is intentional and documented. The duplicated types are simple and structural (not behavioral), reducing synchronization risk.

### 3. Priority Queue over Heap
**Decision:** `TaskQueue` uses flat bucket arrays rather than a binary heap.
**Rationale:** With only 3 priority levels (high/medium/low), three FIFO queues are simpler and faster than a heap. `dequeue()` is O(1) amortized with bucket checks. `remove()` is O(n) but rare.
**Validated:** Yes — appropriate for the use case.

### 4. PoolTask.priority required field
**Decision:** `PoolTask` has `priority: TaskPriority` as required (no default).
**Rationale:** Priority must be explicitly set when creating a task. Zod schema `CreateTaskRequestSchema` sets the default to 'medium' at the API boundary, so callers always get a valid priority.
**Validated:** Yes — clean separation of concerns.

### 5. Audit Chain Failure Handling
**Decision:** When any sub-agent throws, the chain returns a partial result with `makeFailureOutput()` placeholders for downstream agents, rather than propagating the error.
**Rationale:** This allows partial reporting. The ReportSynthesizer detects missing upstream outputs and adjusts severity accordingly.
**Validated:** Yes — error handling is graceful and informative.

### 6. Report Node DI Pattern
**Decision:** Each report node exposes `createXxxNode(options?: XxxNodeOptions)` alongside a default export `xxxNode = createXxxNode({})`.
**Rationale:** Tests can inject mock `generateObject` functions. Production uses the defaults with no LLM (deterministic fallbacks).
**Validated:** Yes — works well for both production and test isolation.

## Decisions NOT Made (Open Questions)

- Pre-existing lint errors in `tools/types.ts` and `tools/cdp.ts` (19 `as any` + 10 `as any`) are not addressed by this review. These should be tracked as separate technical debt.
- Whether the empty `SummarizeNodeOptions` interface should be removed entirely or kept for DI consistency with other nodes. No strong preference, but the lint error should be suppressed or resolved.
