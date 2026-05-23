# Decisions: Report-Graph Integration

## Recommended Approach: Wire Inside reportNode (Option A)

**Decision:** Invoke `createReportGraph` inside the existing `reportNode` in `packages/agent-core/src/nodes/report.ts`.

**Rationale:**
1. **Minimal disruption** — Single file change in the node. No restructuring of the main graph topology.
2. **Natural fit** — The report node is already the terminal node before END, designed for post-test analysis.
3. **Atomic state transition** — The report node already returns state updates. Extending it with additional analysis fields is clean.
4. **Worker process context** — The report-graph runs in the same worker process, so it has access to all LLM/MCP resources.

**Rejected alternatives:**
- Option B (in runner.ts after invoke): Breaks the LangGraph abstraction — post-processing outside the graph.
- Option C (in server): Requires serializing/deserializing full state across process boundary. Report analysis shouldn't block server thread.

## State Extension Strategy

**Decision:** Add report-graph fields directly to `TestState` rather than creating a nested struct.

**Rationale:**
- LangGraph reducers work on flat state fields.
- The summarize node already produces a flat `summaryText` — consistent with existing patterns.
- Avoids breaking existing consumers that read `state.history` etc.
