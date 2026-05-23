# Report-Graph → Main Loop Integration Findings

## Current Architecture

### Main Test Graph (`packages/agent-core/src/graph.ts`)
- Nodes: observe → plan → execute → verify → (pass/fail) → report → END
- The `reportNode` in `nodes/report.ts` is a **stub**: it only sets `status: 'completed' | 'failed'` based on the verdict. It does NOT invoke the report-graph at all.

### Report Graph (`packages/agent-core/src/report-graph/graph.ts`)
- A separate StateGraph with fan-out/fan-in pattern.
- Nodes: START → (safety, perf, a11y, pattern) in parallel → summarize → END
- Has its own state: `ReportState` with `goal`, `history`, `safetyReport`, `performanceReport`, `accessibilityReport`, `newPatterns`, `summaryText`.
- Fully implemented with all 5 analysis nodes working.

### Server Execution Flow
1. Server receives task → `TaskQueue.enqueue()`
2. `WorkerManager.spawnWorker()` spawns child process running `packages/agent-core/src/worker-entry.ts`
3. `worker-entry.ts` calls `runTest()` from `packages/agent-core/src/runner.ts`
4. `runner.ts` creates the main test graph, compiles it, invokes it with initial state
5. The main graph runs observe/plan/execute/verify loop, then hits `reportNode`
6. `reportNode` just sets status, no deep analysis
7. Worker emits `task_end` JSON-RPC notification
8. Server receives `task_end`, updates task status

## Integration Gap

**The report-graph is NEVER invoked in production.**

### Evidence:
- `createReportGraph` is only imported in tests:
  - `tests/e2e/report-parallel.test.ts` (e2e test)
  - `packages/agent-core/src/report-graph/__tests__/report-graph.test.ts` (unit test)
- `apps/server/` has ZERO references to `report-graph`, `ReportGraph`, or `createReportGraph`
- `packages/agent-core/src/nodes/report.ts` does NOT call `createReportGraph`
- `packages/agent-core/src/runner.ts` returns raw TestState — no report-graph post-processing

### The Disconnection:
```
Main Test Graph                    Report Graph (orphaned)
─────────────────                  ───────────────────────
observe → plan → execute           START → safety ─┐
    → verify → report → END         ├─ perf ───────┤
                     │               ├─ a11y ───────┤
                     │               └─ pattern ────┤
                     │                              ▼
                     │                          summarize → END
                     │
                     └── NO CONNECTION ──┘
```

## Where to Wire It In

### Option A: Inside the main `reportNode` (Recommended)
**File:** `packages/agent-core/src/nodes/report.ts`
**Approach:** After the main test loop completes (pass or fail), the report node invokes the report-graph as a post-processing step.

Changes needed:
1. In `report.ts`: Import `createReportGraph`, compile and invoke it with the relevant fields from TestState (goal, history).
2. The result (safetyReport, performanceReport, accessibilityReport, newPatterns, summaryText) should be returned as part of the state update.
3. Add these fields to `TestState` (they don't exist there yet), OR create a separate return channel.

### Option B: In `runner.ts` after graph completion
**File:** `packages/agent-core/src/runner.ts`
**Approach:** After `compiled.invoke()` returns, run the report-graph separately on the result.

### Option C: In the server after task_end
**File:** `apps/server/src/services/workerManager.ts` or a new post-processing service
**Approach:** Server runs report-graph after receiving task_end notification.

## Exact Files That Need Changes

### Primary fix location:
- `packages/agent-core/src/nodes/report.ts` — line 1-21 (entire file)
  Currently just sets status. Needs to invoke createReportGraph.

### Supporting changes:
- `packages/agent-core/src/state.ts` — lines 1-64
  TestState needs fields: safetyReport, performanceReport, accessibilityReport, newPatterns, summaryText
- `packages/agent-core/src/runner.ts` — lines 36-66
  May need to pass generateObject to report-graph options
- `apps/server/src/services/htmlReport.ts` — lines 175-228
  Should render safety/performance/accessibility reports in HTML

### Data flow after fix:
```
Main Graph: observe → plan → execute → verify → report → END
                                                       │
                                                  reportNode now:
                                                  1. Sets status (existing)
                                                  2. Invokes createReportGraph()
                                                     with { goal, history }
                                                  3. Gets back safety/perf/a11y/pattern/summary
                                                  4. Returns all as state updates
```

## Code Changes Required

### 1. Extend TestState (state.ts)
Add to TestState Annotation.Root:
```typescript
safetyReport: Annotation<SafetyReport | null>({
  reducer: (_l, r) => r, default: () => null,
}),
performanceReport: Annotation<PerformanceReport | null>({
  reducer: (_l, r) => r, default: () => null,
}),
accessibilityReport: Annotation<AccessibilityReport | null>({
  reducer: (_l, r) => r, default: () => null,
}),
newPatterns: Annotation<FeedbackPattern[]>({
  reducer: (_l, r) => r, default: () => [],
}),
summaryText: Annotation<string>({
  reducer: (_l, r) => r, default: () => '',
}),
```

### 2. Rewrite reportNode (nodes/report.ts)
```typescript
import { createReportGraph } from '../report-graph/graph.js';
import type { TestState } from '../state.js';

export const reportNode = async (
  state: typeof TestState.State,
): Promise<Partial<typeof TestState.State>> => {
  const verdict = state.currentVerdict?.verdict;
  const isPass = verdict === 'pass';
  const isExplicitFail = verdict === 'fail';
  const isMaxSteps = state.stepCount >= state.maxSteps;
  const status = (isExplicitFail || isMaxSteps) ? 'failed' : 'completed';

  // Invoke report sub-graph for deep analysis
  try {
    const reportGraph = createReportGraph();
    const compiled = reportGraph.compile();
    const reportResult = await compiled.invoke({
      goal: state.goal,
      history: state.history,
    }, { recursionLimit: 20 });

    return {
      status,
      safetyReport: reportResult.safetyReport,
      performanceReport: reportResult.performanceReport,
      accessibilityReport: reportResult.accessibilityReport,
      newPatterns: reportResult.newPatterns,
      summaryText: reportResult.summaryText,
    };
  } catch (err) {
    // If report analysis fails, still return basic status
    console.error('[reportNode] analysis failed:', err);
    return { status };
  }
};
```

### 3. Optional: Pass generateObject to report-graph
In `runner.ts`, if generateObject is available, pass it to report-graph nodes for LLM-powered analysis.
