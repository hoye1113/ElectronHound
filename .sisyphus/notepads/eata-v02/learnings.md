## EATA v0.2 Notepad

### Key Learnings
- createTestGraph() has no params — must refactor for DI (T3)
- plan.ts/verify.ts have DI factory pattern (createPlanNode/createVerifyNode with options) but called with empty {}
- MCPClient is pure mock — callTool returns `mock-${server}-${toolName}: ${JSON.stringify(args)}`
- Worker entry point mismatch: workerManager spawns runner.ts but runner.ts has no auto-run or stdin listener
- llmModel is strict z.enum — must change to z.string().min(1)
- @playwright/mcp not in any package.json
- report-graph exists but reportNode in main graph is trivial status setter, never calls report-graph
- ExecResultSchema already has screenshot?: z.string() field
- Vercel AI SDK createOpenAI() is provider init; generateObject() is node-level call — upstream/downstream

### Decisions
- Graph DI: createTestGraph(options) parameterized (not global singleton)
- Worker comm: Full JSON-RPC bridge (worker-entry.ts)
- Report scope: Simple HTML from manifest+timeline (report-graph deferred to v0.3)
- Screenshot scope: execute step only
- Model schema: z.string().min(1) + llmBaseUrl? + llmApiKey?

### Issues
- (none yet)

### Problems
- (none yet)

### T1: Schema Update Findings
- Changed `llmModel` from `z.enum(['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet'])` to `z.string().min(1)` in both CreateTaskRequestSchema and TaskSchema
- Added `llmBaseUrl: z.string().url().optional()` and `llmApiKey: z.string().optional()` to both schemas
- Two downstream tests needed updates: `apps/server/src/__tests__/routes.test.ts` and `packages/agent-core/src/__tests__/cli.test.ts` — both tested `'invalid-model'` rejection, now test `''` (empty string) rejection instead
- All 458 tests pass (459 total, 1 skipped)

### T3: Graph DI Refactor Findings
- `createTestGraph(options?: GraphOptions)` now accepts DI overrides for `plan` and `verify` nodes
- `GraphOptions` reuses existing `PlanNodeOptions` and `VerifyNodeOptions` types — no duplication
- When no options provided, falls back to module-level `planNode`/`verifyNode` singletons (preserving backward compat)
- When options provided, creates fresh node instances via `createPlanNode`/`createVerifyNode` factories
- `RunTestOptions` extended with optional `graphOptions?: GraphOptions` — runner forwards to `createTestGraph`
- `cli.ts` implicitly wired via `runTest` → no direct changes needed
- All 10 existing call sites (runner.ts, graph.test.ts, crash-recovery.test.ts, full-test-cycle.test.ts) call `createTestGraph()` with no args → zero changes needed
- Added 2 DI tests: plan node mock injection + verify node mock injection
- All 460 tests pass (461 total, 1 skipped)
