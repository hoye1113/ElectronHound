# T18: Wire runAuditChain into main test graph — Decisions

## Decision: Place audit chain call in verify node (Option B from plan)

**Rationale**: The verify node runs after execution completes, making it the natural place to analyze results with the 4-role audit chain. The audit result can directly inform the verdict decision.

## Decision: Use real audit chain in tests, not mocks

**Rationale**: 
- Sub-agents are deterministic (keyword heuristics, no LLM)
- Fast execution (~10ms total for full chain)
- More meaningful integration tests
- Avoids vitest mock hoisting issues with `.js` extension alias

## Decision: Store auditChainResult in TestState

Added `auditChainResult: AuditChainResult | null` to `TestState` annotation with last-write-wins reducer, matching the pattern used for other state fields.

## Decision: Override pass -> fail when audit chain reports critical issues

When `executionAnalyst.auditReport.severity` is `'fail'` AND the verdict is `'pass'`, override the verdict to `'fail'` with reasoning from the audit report. This ensures critical findings are never silently ignored.
