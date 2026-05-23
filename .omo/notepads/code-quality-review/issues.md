# v0.3 Code Quality Review — Issues & Gotchas

## Issues Found

### 1. Smart/Curly Quotes in security-reviewer.ts (Line 54)
**File:** `packages/agent-core/src/sub-agents/security-reviewer.ts:54`
**Problem:** `'require(’remote’)'` contains Unicode curly quotes (U+2019) instead of straight quotes. Real source code uses straight quotes, so this keyword will never match anything.
**Impact:** Non-blocking — the second keyword `"require('remote')"` provides full coverage. But it's a maintenance hazard: someone might edit only one of them.
**Fix:** Replace smart quotes with regular ASCII quotes.

### 2. Empty Interface `SummarizeNodeOptions` (Summarize Node)
**File:** `packages/agent-core/src/report-graph/nodes/summarize.ts:4-6`
**Problem:** `SummarizeNodeOptions` is an empty interface, triggering `@typescript-eslint/no-empty-object-type`.
**Impact:** Lint error. Functionally harmless but signals "placeholder" that may confuse contributors.
**Fix:** Either remove the empty interface if truly unused, or add a comment explaining its purpose.

### 3. Unused `_options` parameter (Summarize Node)
**File:** `packages/agent-core/src/report-graph/nodes/summarize.ts:8`
**Problem:** Parameter `_options` is declared but never read.
**Impact:** Lint error. May be intentional for DI consistency with other nodes.
**Fix:** Prefix with underscore (already done) or remove.

### 4. Unused `task2Id` in E2E test
**File:** `tests/e2e/full-pipeline-v03.test.ts:611`
**Problem:** Variable assigned but never consumed.
**Impact:** Minor. Test still works. Should be removed for clarity.

## Pre-Existing Lint Debt (Not v0.3 Specific)

147 of 150 total lint errors are in pre-existing code:
- `packages/agent-core/src/tools/cdp.ts` — 10 `as any` + unused vars
- `packages/agent-core/src/tools/types.ts` — 19 `as any`  
- `packages/agent-core/src/tools/registry.ts` — 3 `as any`
- Multiple test files with unused imports

These should be tracked separately and not block v0.3.

## Gotchas Encountered

### LangGraph State Reducer Pattern
The `Annotation.Root` in `state.ts` uses `right replaces left` reducers, which is correct for fan-in because each node writes only to its own state key. But if a node were to read-and-modify a shared key, this would silently overwrite upstream changes.

### Priority Queue FIFO Ordering
Within the same priority level, tasks are processed FIFO. The `shift()` operation on the array means the first task enqueued at a given priority runs first. This is correct behavior but not documented.

### Worker Pool Concurrency Boundary
`submit()` checks `running.size < config.maxConcurrency` before starting. If multiple calls happen rapidly, the counter may not update before the next check. Current implementation is safe because JavaScript is single-threaded and `submit()` is synchronous (not async).
