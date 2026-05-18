# EATA Learnings

## 2026-05-18 Session Start

### Environment
- Node.js: v24.13.0
- Platform: win32
- Project: greenfield (only .sisyphus/ exists)
- No git repo initialized yet

### Architecture Decisions
- LangGraph StateGraph for main AI loop (not prompt-driven)
- Vercel AI SDK generateObject() inside LangGraph nodes
- SqliteSaver checkpoint to independent data/agent-checkpoints.sqlite3
- Report layer: LangGraph Sub Graph fan-out/fan-in (4-way parallel)
- Feedback: AI-generated remediationHint + similarityKeywords (方案 B)
- Dashboard: pnpm create vite --template react-ts scaffolding
- LLM: user-configurable via OPENAI_API_KEY / OPENAI_BASE_URL / LLM_MODEL env vars
