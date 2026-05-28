# Runner State Integration Design

**Date:** 2026-05-28
**Status:** Approved

---

## Problem

runner.ts creates RunTestResult with stubbed empty values for `history`, `currentObservation`, `currentPlan`, `currentExecResult`, `lastObservationHash`. AgentLoop internally records every step to SessionManager, but runner.ts never reads them back.

## Approach: Post-run Session Read

After AgentLoop.run() completes, runner.ts calls `sessionManager.getSession(sessionId)` to retrieve all entries, then converts them to StepRecord[] and populates RunTestResult.

## Session Entry Layout

AgentLoop writes entries in a deterministic pattern:

| Index | role | type | Phase | Content |
|-------|------|------|-------|---------|
| 0 | user | user | — | taskPrompt |
| 1+4N | assistant | assistant | observe | JSON(Observation) |
| 2+4N | assistant | assistant | plan | JSON(Plan) |
| 3+4N | system | system | execute | JSON(ExecutionResult) |
| 4+4N | assistant | assistant | verify | JSON(Verdict) |

## Conversion: entries → StepRecord[]

- Skip index 0 (user prompt)
- Group remaining entries in chunks of 4: [observe, plan, execute, verify]
- Drop incomplete trailing chunks (loop terminated mid-step)
- Each chunk becomes one StepRecord

### Verdict → StepStatus mapping

| Verdict | StepStatus |
|---------|-----------|
| pass | success |
| retry | retry |
| fail | failed |
| stuck | failed |

## RunTestResult Field Population

| Field | Source |
|-------|--------|
| history | StepRecord[] from converted entries |
| currentObservation | Last complete step's observe entry, parsed as Observation |
| currentPlan | Last complete step's plan entry, parsed as Plan |
| currentExecResult | Last complete step's execute entry, parsed as ExecutionResult |
| currentVerdict | Construct from AgentRunResult.verdict |
| lastObservationHash | fingerprintObservation(lastObservation) |
| stuckCounter | AgentRunResult.verdict === 'stuck' ? stuckThreshold : 0 |

## Files

### New
- `packages/agent-core/src/session/entryConverter.ts` — pure conversion functions

### Modified
- `packages/agent-core/src/runner.ts` — call converter, populate RunTestResult

## Key Design Decisions

1. entryConverter is a pure function (no side effects, no DB access)
2. AgentLoop interface unchanged — no coupling to StepRecord/RunTestResult
3. Incomplete final steps are dropped rather than partial-filled
4. stuckThreshold exposed from AgentLoop config for stuckCounter calculation
