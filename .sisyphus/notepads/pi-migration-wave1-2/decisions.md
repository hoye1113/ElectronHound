# Pi Migration Wave 1-2 Decisions

## Architectural Decisions

### 1. LLM Provider Interface
- Decision: Create custom `LLMProvider` interface that wraps OpenAI-compatible APIs via fetch
- Rationale: Maintains compatibility with existing code while removing Vercel AI SDK dependency
- Alternative considered: Direct LLM calls without abstraction — rejected for testability

### 2. Session Persistence
- Decision: Use SQLite for session persistence (existing better-sqlite3 dependency)
- Rationale: Consistent with existing checkpoint persistence approach
- Location: `packages/agent-core/src/session/persistence.ts`

### 3. Agent Loop Architecture
- Decision: Plain TypeScript class with DI for LLM and tool interfaces
- Rationale: Avoids coupling to specific loop frameworks, easier to test
- Phases: observe → plan → execute → verify → report

### 4. Stuck Detection
- Decision: Simple comparison-based (3 identical observations = stuck)
- Rationale: Avoids complex similarity algorithms, sufficient for MVP
- Reset on new observation different from previous