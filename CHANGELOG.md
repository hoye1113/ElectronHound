# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-05-26

### Added
- Multi-provider LLM configuration (OpenAI, DeepSeek, Qwen, Groq)
- WorkerPool with priority queue architecture
- Sub-agent audit chain (TestPlanner, ExecutionAnalyst, SecurityReviewer, ReportSynthesizer)
- Few-shot example storage and loader
- i18n foundation (English + Chinese)
- Docker containerization and CI workflow
- Command injection prevention tests

### Fixed
- Security: apiKey validation, UUID validation, screenshot path traversal protection
- Type unification: replace provider-specific types with generic interface
- Logging: add logging to conditional edges, warn on config parse errors
- Set recursionLimit=100 in all graph invoke() calls

## [0.2.0] - 2026-05-20

### Added
- REST API with Fastify (tasks, reports, feedback, providers)
- SSE real-time task streaming
- Worker process management with heartbeat monitoring
- AI agent loop (Observe-Plan-Execute-Verify)
- Dashboard UI (React + Vite + Tailwind)
- CLI entry point for direct task execution
- Report sub-graph with parallel analysis nodes
- E2E integration tests (15 tests across 3 files)

## [0.1.0] - 2026-05-15

### Added
- Initial monorepo scaffold with pnpm workspaces
- Shared types with Zod schemas (task, step, agent state, feedback, provider)
- Electron launcher with CDP discovery
- Electron helper (IPC channel, operation handler)
- Electron Bridge MCP server (launch, close, execute-main, trigger-ipc, mock-dialog)
- Test fixture Electron application
- Server skeleton with SQLite database and migrations
- Dashboard skeleton with Vite + React + Tailwind
