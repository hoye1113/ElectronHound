# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- P3: Release management with Changesets
- P3: Release CI workflow for automated releases
- P3: Node.js >= 20 and pnpm >= 9 engine constraints
- A1: Batch testing with coordinated execution and progress tracking
- A2: Test templates with 6 built-in presets and custom template support
- A3: Result export in JSON, CSV, and HTML formats
- A4: Report format customization with template system and styling options

## [0.4.0] - 2026-05-28

### Added

- P0: LICENSE, SECURITY.md, CODE_OF_CONDUCT.md for project governance
- P0: Comprehensive input validation with Zod schemas across all API endpoints
- P0: Structured error handling with error codes and solutions
- P1: Complete documentation suite (API, Architecture, Troubleshooting, Examples)
- P1: Developer Experience (DX) module with structured errors, logging, progress tracking
- P1: Configuration wizard for LLM providers (OpenAI, DeepSeek, Qwen, Groq)
- P1: CLI help system with shell completion scripts (bash, zsh, fish)
- P1: 94 new DX tests

### Changed

- P0: Removed all `as any` type assertions
- P0: Enhanced API error responses with detailed validation errors
- P0: Improved SSE hub to use Fastify CORS instead of hardcoded headers
- P2: Enhanced health check with 'degraded' status support

### Fixed

- P0: Server startup condition for tsx runtime
- P0: WorkerPool TypeScript errors
- P2: SSE test from P0 CORS header removal

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

[Unreleased]: https://github.com/hoye1113/ElectronHound/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/hoye1113/ElectronHound/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/hoye1113/ElectronHound/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/hoye1113/ElectronHound/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/hoye1113/ElectronHound/releases/tag/v0.1.0
