# v0.3 Code Quality Review — Learnings

## Patterns That Work Well

### 1. Deterministic sub-agents with LLM fallback
All four sub-agents (TestPlanner, ExecutionAnalyst, SecurityReviewer, ReportSynthesizer) are deterministic by default and only use heuristics/keyword matching. This makes them testable without LLM mocking. LLM is available via the report-graph nodes, not hardcoded into sub-agents.

### 2. Audit Chain context-passing pattern
`audit-chain.ts` uses a simple but effective pattern: each agent's output is injected into the next agent's `input.context` as a named key (`testPlannerOutput`, `executionAnalystOutput`, etc.). The ReportSynthesizer reads these keys from its CONFIG_KEYS constant. Failure is handled gracefully with `makeFailureOutput()`.

### 3. Report Graph fan-out/fan-in
`graph.ts` uses LangGraph's StateGraph with parallel edges from START to 4 analysis nodes (safety, perf, a11y, pattern), then fan-in to summarize. Each node uses last-wins-writes reducer. DI pattern with `createSafetyNode(options)` allowing LLM override in tests.

### 4. Priority Queue with Bucket Design
`TaskQueue` uses three named buckets (`high`, `medium`, `low`) with FIFO ordering within each. `dequeue()` checks buckets in priority order. Simple, correct, O(1) for enqueue, O(n) for remove (rare).

### 5. Worker Pool Manager separation of concerns
`WorkerPoolManager` cleanly separates: task handles (status tracking), running map (concurrency control), queue (priority ordering), and event emission. The `cancel()` method handles both queued and running states.

### 6. i18n with fallbackLng
The i18n setup correctly falls back to English for missing keys in any language. The tests verify this explicitly by adding English-only keys and checking Chinese fallback resolution.

## Conventions Followed

- All `.ts` files use `.js` extension in imports (ESM-compatible)
- Zod schemas are co-located with type exports in `shared-types`
- Type assertions use specific types (`as SubAgentOutput | undefined`), never `as any`
- `readonly` and `const` assertions used appropriately for config maps
- All React components use `aria-*` attributes for accessibility
- Test files co-located with `__tests__/` directories
