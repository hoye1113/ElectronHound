# v0.3 Code Quality Review — Unresolved Problems

## Open Items

### 1. Pre-existing `as any` in tools/ (28 instances)
**Scope:** `packages/agent-core/src/tools/types.ts` (19), `cdp.ts` (10), `registry.ts` (3)
**Problem:** These `as any` assertions bypass type safety in tool definitions. While they work correctly, they reduce the value of TypeScript's type checking for the tool system.
**Status:** Not blocking — out of scope for v0.3 review. Track as tech debt.
**Recommendation:** Investigate whether specific types can replace `as any` in the tool registry/CDP layer. These may require upstream library type improvements.

### 2. MaxListenersExceededWarning in tests
**Scope:** Server test processes (PIDs 24832, 19956) — `11 SIGINT listeners added to [process]. MaxListeners is 10`
**Problem:** Multiple tests register process signal handlers without cleanup. In isolation this is fine; in aggregation it triggers a Node.js warning.
**Status:** Non-blocking — tests still pass. Cosmetic warning only.
**Recommendation:** Either increase `process.setMaxListeners()` in test setup, or ensure signal handlers are properly deregistered in `afterEach`.

### 3. PatternStore reads entire JSONL file for every upsert
**Scope:** `packages/agent-core/src/report-graph/pattern-store.ts:41`
**Problem:** `upsert()` calls `readAll()` which reads the entire `patterns.jsonl` file. For large pattern stores, this could become slow.
**Status:** Non-blocking for v0.3 — pattern files are expected to be small.
**Recommendation:** Consider adding an in-memory cache with file-change detection, or switch to SQLite-backed storage as pattern volume grows.

### 4. `as` type assertions in report-graph nodes
**Scope:** `nodes/safety.ts:44`, `nodes/performance.ts:56`, `nodes/accessibility.ts:46`, `nodes/pattern.ts:64`, `nodes/summarize.ts:14-16`
**Problem:** `result.object as SafetyReport` and similar assertions cast `Partial<X>` to `X`. This bypasses validation — if the LLM returns an incomplete object, TypeScript won't catch it.
**Status:** Non-blocking — LLM generates objects via Zod schemas, which should enforce completeness.
**Recommendation:** Add runtime validation (e.g., `SafetyReportSchema.parse(result.object)`) instead of trusting type assertions. This guards against malformed LLM output.

### 5. AuditReportView types duplicated from sub-agents
**Scope:** `apps/dashboard/src/components/AuditReportView.tsx:18-45`
**Problem:** Types are duplicated and must be manually synced with `packages/agent-core/src/sub-agents/types.ts`.
**Status:** Non-blocking — documented with "Keep in sync" comment.
**Recommendation:** If the dashboard package dependency model changes (e.g., shared-types is adopted), these could be deduplicated. Low priority.
