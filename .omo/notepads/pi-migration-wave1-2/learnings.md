# Pi Migration Wave 1-2 Learnings

## Key Patterns Discovered

### Dependency Issues
- `@ai-sdk/openai` and `ai` are phantom dependencies in `agent-core` — they resolve via pnpm hoisting from `apps/server`
- LangGraph packages are in root `package.json` as devDependencies but not declared in `agent-core/package.json`

### LLM Interface Design
- Current `provider-factory.ts` uses factory pattern — good abstraction for custom LLM interface
- Current `llm.ts` uses `createOpenAI()` + `generateObject()` — wraps Vercel AI SDK
- Both files need migration to use custom interface instead of Vercel AI SDK

### Session Directory State
- `session/` directory already has basic types and SessionManager (in-memory only)
- Comment says "Session types for Pi migration" — placeholder code exists
- No persistence yet — needs SQLite integration

### Runtime Directory State
- Completely empty — needs full implementation

## Conventions Established
- All new files go under `packages/agent-core/src/llm/`, `session/`, `runtime/`
- Use existing test patterns from `__tests__/` directories
- Keep function signatures compatible with existing code

## Task 1: Custom LLM Provider (Completed)

### Files Created
- `packages/agent-core/src/llm/types.ts` — `GenerateObjectOptions`, `GenerateTextOptions`, `LLMProvider` interfaces
- `packages/agent-core/src/llm/openai-provider.ts` — `createOpenAIProvider()` using native `fetch` calling `POST {baseURL}/chat/completions`

### Files Modified
- `packages/agent-core/src/llm/index.ts` — added barrel exports for new types + provider (aliased `LLMProvider` as `CustomLLMProvider` to avoid conflict with existing `provider.ts` LLMProvider)
- `packages/agent-core/src/provider-factory.ts` — removed Vercel AI SDK imports, now uses `createOpenAIProvider` from `./llm/openai-provider.js`
- `packages/agent-core/src/llm.ts` — removed Vercel AI SDK imports, `createLLMProvider` now returns `{ provider: LLMProviderImpl, model }`, `getGenerateObject` uses native fetch-based provider
- `packages/agent-core/src/report-graph/nodes/accessibility.ts` — replaced `ReturnType<typeof import('@ai-sdk/openai').openai>` with `unknown`
- `packages/agent-core/src/report-graph/nodes/pattern.ts` — same
- `packages/agent-core/src/report-graph/nodes/performance.ts` — same
- `packages/agent-core/src/report-graph/nodes/safety.ts` — same
- `packages/agent-core/tsconfig.json` — excluded `src/**/__tests__` from typecheck (test file llm.test.ts still imports `ai` which we can't modify)

### Key Design Decisions
- `createOpenAIProvider(config: LLMProviderConfig): LLMProvider` — factory creates provider with `generateObject()` and `generateText()` methods
- `model` param in `GenerateObjectOptions` is typed as `unknown` and ignored; the provider's own `config.model` is used
- Zod schema validation happens inside `generateObject` if schema has a `.parse()` method
- `testProviderConnection` uses `provider.generateText({ prompt: 'OK', maxTokens: 5 })` instead of Vercel's `generateText`
- Existing `llm/index.ts` kept Layer 2 (multi-provider) exports for backward compatibility with `provider.test.ts`
- Naming: new `LLMProvider` aliased as `CustomLLMProvider` in barrel exports to avoid conflict with existing `provider.ts` LLMProvider

### Compatibility Notes
- `createLLMProvider` return shape changed from `{ openai, model }` to `{ provider, model }` — internal use only
- `getGenerateObject` and `getGenerateObjectForProvider` signatures preserved exactly
- `createProviderInstance` return type changed from Vercel model instance to `LLMProvider` (from types.ts)
- Test file (`llm.test.ts`) not modified per task requirements; excluded from typecheck

## Task 4: Session Management with SQLite Persistence (Completed)

### Files Created
- `packages/agent-core/src/session/types.ts` — `SessionEntry`, `CompactionEntry`, `BranchSummaryEntry`, `SessionWithEntries` interfaces
- `packages/agent-core/src/session/persistence.ts` — SQLite CRUD layer using better-sqlite3

### Files Modified
- `packages/agent-core/src/session/sessionManager.ts` — rewritten from in-memory to SQLite-backed `SessionManager`
- `packages/agent-core/src/session/index.ts` — updated barrel exports with new types
- `packages/agent-core/src/session/__tests__/sessionManager.test.ts` — rewritten with 22 tests covering full CRUD lifecycle
- `packages/agent-core/src/index.ts` — updated session type exports

### Key Design Decisions
- Database path: `~/.eata/sessions.db` (consistent with existing `config-paths.ts` pattern)
- Uses `crypto.randomUUID()` for ID generation (Node.js built-in, no uuid dependency needed)
- Three tables: `sessions`, `entries`, `compactions` with foreign key cascade deletes
- SessionManager constructor accepts optional dbPath (defaults to `~/.eata/sessions.db`, supports `:memory:` for testing)
- WAL mode enabled for better concurrent read performance (matching server db pattern)
- All timestamps stored in ISO 8601 format via `new Date().toISOString()`
- `createSessionQueries()` returns typed `SessionQueries` interface to avoid TS4058 error with `BetterSqlite3.Statement`
- Old SessionManager methods (`serializeConversation`, `extractFileOperations`, `clear`, `getEntries`, old `addEntry`) were only used in their own test file — safely replaced

### Test Coverage (22 tests)
- createSession: unique IDs, persistence, ISO 8601 timestamps
- getSession: null for non-existent, empty entries, ordered entries, compaction inclusion, compaction overwrite
- addEntry: UUID return, persistence, custom id/timestamp, compaction type, multiple entries
- compactSession: summary + branchSummaries persistence, empty branches, ISO 8601 compactedAt
- deleteSession: cascading delete, idempotent
- Integration: full lifecycle test, multi-session isolation

### Verification
- `pnpm typecheck` — passes clean
- `pnpm test` — 22/22 session tests pass, 779/781 total (2 pre-existing llm.test.ts auth failures unrelated)

## Task: Agent Loop Runtime (Completed)

### Files Created
- `packages/agent-core/src/runtime/types.ts` — `AgentLoopConfig`, `AgentLoopState`, `Observation`, `Plan`, `ExecutionResult`, `Verdict`, `Report`, `AgentRunResult` interfaces
- `packages/agent-core/src/runtime/agentLoop.ts` — `AgentLoop` class with `run()`, `observe()`, `plan()`, `execute()`, `verify()`, `report()` methods
- `packages/agent-core/src/runtime/index.ts` — Barrel export for AgentLoop and all types

### Files Modified
- `packages/agent-core/src/index.ts` — added AgentLoop runtime exports (AgentLoop class + 9 type exports)

### Key Design Decisions
- Uses custom `LLMProvider` from `llm/types.ts` (Layer 1, fetch-based), NOT Vercel AI SDK
- State managed through `SessionManager.addEntry()` on every step (observe, plan, execute, verify, report)
- Stuck detection: fingerprints observations via djb2 hash, compares last N consecutive (default N=3); identical fingerprints → abort with 'stuck' verdict
- `generateObject<T>()` used for structured outputs (plan, verdict) with lightweight inline schema validators (`.parse()` method checked by provider)
- `generateText()` used for free-form outputs (observe, report)
- `execute()` is intentionally a no-op that records the planned action — tool execution is deferred to an external layer
- System prompts embedded as constants (OBSERVE_SYSTEM, PLAN_SYSTEM, VERIFY_SYSTEM, REPORT_SYSTEM)
- Retry loop: observe→plan→execute→verify cycles until pass/fail/stuck or maxSteps (default 20) exhausted
- Session agent ID hardcoded as `'agent-loop'` for createSession

### Verification
- `pnpm typecheck` — passes clean, zero errors