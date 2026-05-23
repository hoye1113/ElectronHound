# F2: Issues Found — POST-REMEDIATION Review

## Critical Bugs

### BUG-1: Event Listener Leak in `runner.ts` ProcessTaskExecutor
- **File**: `apps/server/src/tasks/runner.ts:35–42`
- **Mechanism**: Every call to `execute()` registers `workerManager.onEvent(listener)` — appends to array, never removes.
- **Impact**: Over time, `WorkerManager.eventListeners` grows unbounded. Every listener processes every event. Memory leak + performance degradation.
- **Fix**: Add `removeEventListener()` to `WorkerManager`. Capture the listener reference in `execute()` and remove it after `onComplete` fires.

### BUG-2: Double-Terminal-Event on Cancel in `workerManager.ts`
- **File**: `apps/server/src/services/workerManager.ts:113–132` (cancelWorker)
- **Mechanism**: `cancelWorker` registers a 2nd `exit` listener that emits `{type: 'cancelled'}`. The `spawnWorker` exit listener also fires `handleExit()`, which emits `{type: 'failed'}` if status is still `'running'`.
- **Impact**: A cancelled worker emits two terminal events (`cancelled` AND `failed`), breaking any code that expects exactly one terminal event per task.
- **Fix**: Set `handle.status = 'cancelled'` synchronously in `cancelWorker()` BEFORE the exit handler runs, so `handleExit` sees it's no longer `'running'` and doesn't emit `'failed'`.

### BUG-3: Unhandled DB Failures in Pool Event Listener
- **File**: `apps/server/src/tasks/runner.ts:98–126` (attachPoolEventListeners)
- **Mechanism**: `db.prepare(...).run(event.taskId)` can throw (disk full, corrupt DB, etc.), but no try/catch.
- **Impact**: A DB exception crashes the event handler, breaking all subsequent pool event processing.
- **Fix**: Wrap each `db.prepare(...).run()` in try/catch. Log DB errors. Optionally degrade gracefully (skip SSE broadcast if DB fails, or vice versa).

## Error Resilience Gap

### ISSUE-1: `audit-chain.ts` — No Error Recovery
- **File**: `packages/agent-core/src/sub-agents/audit-chain.ts`
- **Mechanism**: All 4 `.run()` calls are unwrapped — any throw aborts the chain with an unhandled rejection.
- **Impact**: A transient error in one sub-agent loses all work from the other 3 sub-agents.
- **Recommendation**: Wrap each `.run()` in try/catch. Return a partial `AuditChainResult` with the error info for the failed role. Mark `AuditChainResult` with an optional `partialError?: string` field.

## Architecture Recommendations (non-blocking)

### REC-1: Formal `SubAgent` Interface
- **File**: `packages/agent-core/src/sub-agents/types.ts`
- **Add**: `export interface SubAgent { run(input: SubAgentInput): Promise<SubAgentOutput> }`
- **Apply**: `class TestPlanner implements SubAgent`, etc.
- **Why**: Provides compile-time enforcement when adding new sub-agents.

### REC-2: Runtime Validation for Context Casts
- **Files**: `execution-analyst.ts:19`, `report-synthesizer.ts:27`
- **Issue**: `input.context[key] as SomeType` — casts from `unknown` without validation.
- **Recommendation**: Use Zod `.safeParse()` or discriminated-union type guards before trusting the shape.
