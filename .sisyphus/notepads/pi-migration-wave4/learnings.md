# Learnings

## Wave 4 — LangGraph Test File Deletion

- Deleted `packages/agent-core/src/__tests__/graph.test.ts` — imported from deleted graph files and used LangGraph runtime API (.compile().invoke())
- Deleted `packages/agent-core/src/report-graph/__tests__/report-graph.test.ts` — same dependency on deleted files and LangGraph API
- Both files were not salvageable under Option A (no rebuild) because they depend on LangGraph's runtime, which is being removed
- Confirmed survivors: `agentLoop.test.ts`, `runner.test.ts` — these should remain intact
- Verification passed: both deleted files return `False`, both survivor files return `True`

## 2026-05-24: report-state-types.ts creation

- Created `packages/agent-core/src/report-graph/report-state-types.ts` with `ReportState` interface
- All required types (`SafetyReport`, `PerformanceReport`, `AccessibilityReport`, `FeedbackPattern`, `StepRecord`) verified as exported from `@eata/shared-types`:
  - `SafetyReport`, `PerformanceReport`, `AccessibilityReport` from `agent-state.ts`
  - `StepRecord` from `step.ts`
  - `FeedbackPattern` from `feedback.ts`
  - All re-exported via `index.ts`
- Project uses `module: "NodeNext"` with `moduleResolution: "NodeNext"` — `.js` extensions needed for relative imports but not for path-mapped imports
- Pre-existing typecheck errors exist from missing files (`state.js`, `graph.js`, `checkpoint.js`) across multiple packages — none related to the new file
- The existing `report-graph/index.ts` still exports `ReportState` from `./state.js` (needs future update to point to `./report-state-types.js`)
- Existing node files (safety.ts, performance.ts, etc.) import `ReportState` from `../state.js` — these will also need updating in subsequent steps

## 2026-05-24: test-state-types.ts creation

- Created `packages/agent-core/src/test-state-types.ts` with `TestState` interface
- All required types verified as exported:
  - `StepRecord`, `ObservationResult`, `PlanResult`, `ExecResult`, `VerdictResult` from `@eata/shared-types` (re-exported via `index.ts`)
  - `AuditChainResult` from `./sub-agents/types.js` (relative import with `.js` extension)
- Used `import type` for all type-only imports (consistent with project conventions)
- Typecheck passes with zero errors on the new file — all 37 pre-existing errors are from other files (missing `state.js`, `graph.js`, `checkpoint.js`)

### F3 Scope Fidelity Check (2026-05-24)

**Verified against plan**: .sisyphus/plans/pi-migration-wave4.md
**Implementation commit**: 7ecb048

**Results per task**:
- Task 1: PASS - test-state-types.ts created with all 14 fields matching spec
- Task 2: PASS - report-state-types.ts created with all 7 fields matching spec
- Task 3: PASS - index.ts: removed createTestGraph/createCheckpointer/TestState stale exports, re-exported TestState from test-state-types.js
- Task 4: PASS - report-graph/index.ts: removed createReportGraph/ReportState stale exports, defined ReportGraphOptions locally, re-exported ReportState
- Task 5: PASS - graph.test.ts and report-graph.test.ts both deleted; agentLoop.test.ts and runner.test.ts untouched
- Task 6: PASS - all 6 nodes/*.ts use import type { TestState } from '../test-state-types.js'
- Task 7: PASS - all 5 report-graph/nodes/*.ts use import type { ReportState } from '../report-state-types.js'
- Task 8: PASS - report.ts uses Promise.all() fan-out, no createReportGraph().compile().invoke()

**Cross-task contamination**: 1 minor issue
- verify.ts line 71: context: state -> context: { ...state } (spread added - beyond import/type-signature scope, but acknowledged in commit message as deliberate type fix, harmless defensive copy)

**Must NOT directories untouched**: CLEAN
- loop/, runtime/, session/, compaction/, sub-agents/, tools/, llm/, mcp/ - zero files modified
- runner.ts - not modified

**Stale references**: CLEAN
- 0 matches for state.js, graph.js, checkpoint.js imports
- 0 matches for @langchain/langgraph
- 0 matches for createReportGraph, createCheckpointer, createTestGraph

**Verdict**: APPROVE with 1 note (minor spread in verify.ts)
