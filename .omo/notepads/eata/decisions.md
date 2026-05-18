# EATA Architectural Decisions

## Decision Log

### D1: LangGraph over plain Vercel AI SDK loop
- **When**: Pre-planning
- **Why**: Explicit state machine prevents LLM from skipping steps; checkpoint enables crash recovery; conditional edges are code logic not prompt instructions
- **Trade-off**: +@langchain/langgraph dependency; ~50% more tokens per step; but deterministic flow + crash recovery

### D2: Vercel AI SDK inside LangGraph nodes (not competing)
- **When**: Pre-planning
- **Why**: LangGraph orchestrates flow; Vercel AI SDK handles LLM calls; MCP handles tools. Three layers, zero conflict.

### D3: Independent checkpoint SQLite (not shared with Fastify)
- **When**: User decision
- **Why**: Isolation between app data (Fastify SQLite) and agent state (checkpoint SQLite)

### D4: Report Sub Graph in v0.1 scope
- **When**: User decision
- **Why**: Architecture complete from day one; 4-way parallel (safety, perf, a11y, pattern extraction)

### D5: Vite scaffolding for Dashboard
- **When**: User decision
- **Why**: Use `pnpm create vite` instead of manual file creation
