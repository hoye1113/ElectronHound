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

### Monorepo Scaffolding (2026-05-18)
- pnpm 10.28.1 installed 264 packages across 9 workspace projects in 3.9s
- Vitest 3.2.4 (not 4.x — latest available is 3.2.4, 4.x not yet released) — used `projects` option with `passWithNoTests: true`
- TypeScript 5.9.3 installed (6.0.3 available but ^5.8.0 resolved to 5.9.3)
- ESLint 9.39.4 with flat config (typescript-eslint 8.59.3)
- `.npmrc` with `shamefully-hoist=true` required for native deps like better-sqlite3
- better-sqlite3@11.10.0 and esbuild@0.27.7 build scripts were ignored by pnpm — need `pnpm approve-builds` if native compilation needed
- All 8 workspace packages created as minimal placeholders: shared-types, launcher, electron-helper, electron-bridge-mcp, agent-core, server, dashboard, test-electron-app
- Initial commit: `9e3c68e` — "chore(scaffold): initialize monorepo with pnpm workspaces"

### Test Electron App Fixture (2026-05-18)
- Electron 35.7.5 resolved (latest available: 42.1.0, spec required ^35.0.0)
- `workspace:*` protocol in package.json devDependencies is ONLY for workspace packages, NOT external deps like vitest/typescript — all 4 packages (shared-types, launcher, electron-helper, server, dashboard) had this misconfiguration and were fixed to use versioned deps (`^5.8.0` for typescript, `^3.2.0` for vitest)
- Vitest `projects` config in root vitest.config.ts correctly discovers `./fixtures/*` — run tests via `npx vitest run fixtures/test-electron-app` from root, NOT `pnpm test --filter`
- Test fixture uses CommonJS (`require()`) for main.js and preload.js (Electron main process convention), ESM for test files
- `contextIsolation: true` + `nodeIntegration: false` confirmed as security baseline
- Electron launch tests must be skipped in CI (no display server) — use `describe.skip` with reason
- `--remote-debugging-port=0` CLI arg support is handled by Electron natively, no app-side code needed

### Server Skeleton — Fastify 5 + better-sqlite3 (2026-05-18)
- better-sqlite3@11.10.0 (not 12.x — 11.x is latest stable) requires native compilation via node-gyp on Windows (VS2022 + Python 3.13)
- pnpm v10 requires `pnpm.onlyBuiltDependencies` in root package.json to allow native module builds — interactive `pnpm approve-builds` doesn't work in non-TTY
- `workspace:*` protocol in server package.json for typescript/vitest was incorrect — these are root devDependencies, not workspace packages
- Fastify 5 `server.inject()` works perfectly for HTTP testing without real listener
- better-sqlite3 WAL mode: `db.pragma('journal_mode = WAL')` returns `[{ journal_mode: 'wal' }]` — verify via pragma query in tests
- Schema migrations via `db.exec(sql)` with `IF NOT EXISTS` is idempotent — safe to re-run on every startup
- `import.meta.url === \`file://${process.argv[1]}\`` pattern for ESM auto-start detection works correctly
- Temp database paths in tests: use `mkdtempSync(join(tmpdir(), prefix))` + `rmSync(recursive: true)` in afterEach

### electron-helper Package (2026-05-18)
- `node:net` module does NOT export `isAbsolute` — that's from `node:path`
- `Socket` class from `node:net` does NOT have a `.connected` property — must track connection state manually with a private boolean flag
- `eval('require')('electron')` pattern works for dynamic require in ESM context to detect Electron availability
- `app.commandLine.appendSwitch('remote-debugging-port', String(port))` must be called before `app.ready` — `--require` timing guarantees this
- Auto-initialization via top-level `if (isElectronMain()) { initialize() }` works for `--require` injection
- Module must be safe to import in Node.js test environment — all Electron-specific code guarded by `isElectronMain()` check
- IPC protocol: newline-delimited JSON (NDJSON) — each message is `JSON.stringify(msg) + '\n'`
- Ping/pong health check: auto-respond to `{ type: "ping" }` with `{ type: "pong" }` in IpcChannel
- Reconnection: exponential backoff from 1s to 5s max delay

### shared-types Package — Zod 4 Schemas (2026-05-18)
- `zod@3.25.76` installed via `^3.25.0` — Zod 4 API is available via `import { z } from 'zod/v4'`, NOT `import { z } from 'zod'`
- Zod 4 top-level APIs: `z.uuid()`, `z.iso.datetime()`, `z.email()` replace Zod 3's `z.string().uuid()`, `z.string().datetime()`, `z.string().email()`
- `z.enum()` still works the same way for string union enums
- TypeScript `NodeNext` moduleResolution requires `.js` extensions in imports (even for `.ts` files)
- Vitest cannot resolve `.js` → `.ts` natively — need `resolve.alias: [{ find: /(.*)\.js$/, replacement: '$1' }]` in vitest.config.ts
- `workspace:*` protocol in package.json devDependencies is ONLY for workspace packages — typescript/vitest need versioned deps
- All 41 schema tests pass: CreateTaskRequest, Task, StepRecord, Manifest, TimelineEntry, FeedbackPattern, JsonRpcNotification, JsonRpcControl, ObservationResult, PlanResult, ExecResult, VerdictResult, SafetyReport, PerformanceReport, AccessibilityReport
- Barrel export pattern: export BOTH `z.infer<typeof Schema>` types AND raw schemas from index.ts

### launcher Package — Electron spawn + CDP discovery (2026-05-18)
- `child_process.spawn` first argument must be a resolved string path, NOT a Promise — `resolveElectronPath()` must be `async` and `await`ed before passing to `spawn()`
- ESM `require.resolve` requires `createRequire(import.meta.url)` from `node:module` — returns a function with `.resolve` method
- CDP port discovery from Electron stderr: parse `DevTools listening on ws://127.0.0.1:<port>/` regex pattern
- `fetch()` in Node.js can hang indefinitely if server accepts connection but never responds — must use `AbortController` with per-request timeout (250ms) inside polling loop
- Vitest `projects` config loads ALL project configs before filtering — a single broken project (e.g., missing `@vitejs/plugin-react`) blocks ALL tests
- `server.closeAllConnections()` (Node 18.18+) needed before `server.close()` in test afterEach to prevent hook timeout from pending fetch connections
- `discoverCDPPort` retries on ALL errors (network, HTTP, malformed JSON) until timeout — this is correct behavior for CDP startup polling
- Test mocking: `vi.mock('node:module')` must return a function with `.resolve` property: `Object.assign(vi.fn(), { resolve: vi.fn(...) })`
- All 14 tests pass: 7 launcher (spawn args, --require flag, env merge, kill, error handling, exit-before-CDP, timeout) + 7 CDP discovery (success, timeout, malformed, HTTP error, multi-poll, getWebSocketUrl, error throw)

### Dashboard App — Vite + Tailwind CSS v4 (2026-05-18)
- `pnpm create vite apps/dashboard --template react-ts` generates React 19 + Vite 8 + TypeScript 6.0 project
- Tailwind CSS v4 uses CSS-first config: `@import "tailwindcss"` in CSS, `@tailwindcss/vite` plugin in vite.config.ts — NO `tailwind.config.js` needed
- `workspace:*` protocol is ONLY for workspace packages (apps/*, packages/*, fixtures/*) — typescript/vitest are root devDependencies, need versioned ranges (`^5.8.0`, `^3.2.0`)
- Vite 8 dev server starts in ~200ms on port 5173, serves HTML with correct title "EATA - Electron AI Testing Agent"
- Template cleanup: remove `src/assets/`, `public/vite.svg`, `src/App.css` — keep only `src/App.tsx`, `src/index.css`, `src/main.tsx`
 - Dependencies installed: zustand ^5.0.0, @radix-ui/react-dialog/select/tabs, lucide-react, tailwindcss ^4.1.10, @tailwindcss/vite ^4.1.10

### SSE Hub — Fastify 5 SSE connection management (2026-05-18)
- Fastify `reply.raw` is the underlying Node.js `ServerResponse` — use `reply.raw.write()` for SSE data and `reply.raw.flushHeaders()` to send headers immediately
- SSE headers must be set BEFORE any data: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `Access-Control-Allow-Origin: *`
- SSE message format: `event: {type}\ndata: {JSON}\n\n` — two trailing newlines are required to terminate each message
- `server.inject()` hangs on SSE routes because the connection never closes — use `server.printRoutes()` to verify route registration instead
- Fastify `server.decorate('sseHub', instance)` makes the hub accessible as `server.sseHub` — requires TypeScript module augmentation via `.d.ts` file
- TypeScript `declare module 'fastify' { interface FastifyInstance { sseHub: SSEHub } }` must be in a `.d.ts` file under `src/types/`
- `reply.raw.on('close', callback)` fires when client disconnects — use for automatic client cleanup
- `reply.raw.write()` returns `false` when the internal buffer is full — treat as dead connection and remove from hub
- `pnpm test --filter @eata/server` doesn't work with vitest — run via `npx vitest run apps/server` from root instead

### Dashboard — Zustand Stores + API Client + SSE (2026-05-18)
- Created \pps/dashboard/src/lib/api.ts\ — HTTP client for Fastify REST endpoints (tasks, reports, feedback)
- Created \pps/dashboard/src/lib/sse.ts\ — EventSource wrapper with auto-reconnect for SSE streams
- Created \pps/dashboard/src/stores/taskStore.ts\ — Zustand 5 store for task CRUD + SSE subscription
- Created \pps/dashboard/src/stores/uiStore.ts\ — UI state store (page navigation, sidebar)
- Created \pps/dashboard/vitest.config.ts\ — vitest config with jsdom environment
- Installed jsdom + @testing-library/react as devDependencies for dashboard
- 16 tests pass: API mocking (6), taskStore (6), uiStore (4)
- Build succeeds: \	sc -b && vite build\ exits 0
- \createTask\ parameter type changed from inline \{ goal, targetAppPath, llmModel: string }\ to \CreateTaskRequest\ from shared-types — \llmModel\ must be the enum union, not \string\
- EventSource mocking in vitest: must use \i.stubGlobal('EventSource', Mock)\ — setting \globalThis.EventSource\ after imports doesn't work because modules capture the global at import time
- \i.stubGlobal\ is hoisted by vitest to run before module imports
- Test file needs \	ype Mock\ imported from vitest for \i.Mock\ namespace (TS2503 error otherwise)

### Server REST API Routes — Fastify 5 CRUD + Zod Validation (2026-05-18)
- Fastify 5 plugin pattern: export `async function routes(server: FastifyInstance)` -> register via `server.register(routes, { prefix: '/api' })`
- DB access via `server.decorate('db', db)` + TypeScript module augmentation: `declare module 'fastify' { interface FastifyInstance { db: Database.Database } }`
- SQLite snake_case DB columns need explicit mapping to camelCase TypeScript types from shared-types
- `better-sqlite3` named parameters work directly: `db.prepare(sql).all({ status, limit, offset })` - simpler than positional `?` params
- `CreateTaskRequestSchema.safeParse(request.body)` returns `{ success, data } | { success, error }` - check `!parseResult.success` to return 400 with `parseResult.error.issues`
- `crypto.randomUUID()` for UUID generation (no external dependency needed)
- `server.inject()` works for all HTTP testing - no real server needed
- Temp database isolation per test: `mkdtempSync(join(tmpdir(), prefix))` + `chdir` to temp dir for relative-path routes (feedback, reports)
- SIGINT listener in `buildServer()` accumulates across test instances (MaxListeners warning) - pre-existing issue, needs `process.removeListener` in cleanup
- `datetime('now')` in SQLite uses UTC - explicit ISO strings from JS are more predictable for test sorting assertions
- Vitest `projects: ['./apps/*']` auto-discovers project-level `vitest.config.ts` - needed `resolve.alias: [{ find: /(.*)\.js$/, replacement: '$1' }]` for NodeNext module resolution
- `@eata/shared-types` schemas use Zod v4 API (`zod/v4`) - compatible at runtime via `.safeParse()` / `.parse()` from Zod v3 consumer code
- Route path convention: individual route files define paths WITHOUT `/api` prefix (e.g., `server.get('/tasks', ...)`), prefix added during registration in `routes/index.ts`
- 23 route tests pass: health (1), task CRUD (9), task listing + filter + pagination (4), task detail (3), DELETE (4), feedback (3), reports (2), stream co-existence (1)
- 5 existing server tests continue to pass with no modifications needed

### Report Service + File Security (2026-05-18)
- `path.resolve()` normalizes both forward and backward slashes to platform-specific separators on Windows — cross-platform path traversal validation must use component-based comparison rather than `startsWith`
- Splitting resolved paths by `sep` and comparing components catches all traversal variants: `../`, absolute path injection, and drive letter mismatch
- `..%2F..%2Fetc` (double-encoded) is NOT decoded by `path.resolve()` — treated as a literal filename, which is safe behavior
- Rejecting paths containing `..` segments BEFORE resolution adds a defense-in-depth layer
- Empty/whitespace target paths must be explicitly rejected — `resolve(baseDir, '')` returns `baseDir` itself
- `workspace:*` protocol in pnpm workspace for inter-package dependencies (e.g., `@eata/shared-types: workspace:*` in server package.json)
- `pnpm test --filter @eata/server` doesn't work with vitest — run `pnpm test` from the server directory, or `npx vitest run apps/server` from root
- TS6059 errors (`rootDir` constraint) are pre-existing in the monorepo — caused by `rootDir: "src"` in server tsconfig conflicting with `@eata/shared-types` outside `src/`. Vitest ignores this, tests run fine
- JSONL format: one JSON object per line, newline-terminated. `appendFileSync` for atomic appends
- Temp dir pattern: `mkdtempSync(join(tmpdir(), prefix))` + `rmSync(recursive: true, force: true)` in afterEach

### electron-bridge-mcp — MCP Server with 5 Electron Tools (2026-05-18)
- `@modelcontextprotocol/sdk@1.29.0` resolved (not 1.12.0 — ^1.12.0 resolved to latest)
- `McpServer` is exported from `@modelcontextprotocol/sdk/server/mcp`, NOT from `@modelcontextprotocol/sdk/server` (the server/index only exports low-level `Server`)
- `StdioServerTransport` is exported from `@modelcontextprotocol/sdk/server/stdio`
- The SDK uses `zod/v4` internally — compatible with `zod@^3.25.0` which provides the v4 API paths
- `server.registerTool(name, config, handler)` is the current API — the old `server.tool()` is deprecated
- Tool config requires `inputSchema` (Zod schema), optional `description`, `title`, `outputSchema`, `annotations`
- Tool handler receives validated args + `extra` (RequestHandlerExtra) — returns `CallToolResult` with `content` array
- The `"./"` bare specifier for SDK subpaths works with `NodeNext` resolution (package.json exports field handles mapping)
- Cross-workspace imports cause TS6059 rootDir errors — pre-existing monorepo issue, tests pass correctly via vitest
- `McpServer` stores registered tools in `_registeredTools` (plain object keyed by tool name) — accessible for test verification via `as unknown as { _registeredTools?: Record<string, unknown> }`
- All 30 tests pass: 5 electron_launch, 3 electron_close, 5 execute_main, 4 trigger_ipc, 5 mock_dialog, 5 createServer, 3 BridgeClient
- BridgeClient uses NDJSON protocol (JSON.stringify + '\n') over TCP sockets — follows same pattern as electron-helper IpcChannel
- Tool handlers use context injection pattern (bridgeClient, processRegistry) for testability — functions receive dependencies as separate argument

### Worker Manager + Task Queue (2026-05-18)

#### workerManager.ts
- spawnWorker spawns 
px tsx packages/agent-core/src/runner.ts with --thread-id {taskId} for LangGraph checkpoint recovery
- JSON-RPC 2.0 over stdio: each stdout line is one JSON-RPC message (newline-delimited JSON)
- Stdio configured as ['pipe', 'pipe', 'pipe'] for full duplex control
- Control messages (pause/resume/cancel/inject_context) sent via stdin as JSON-RPC with id: Date.now()
- Heartbeat monitoring: setInterval every 2s checking for workers whose lastHeartbeat > 10s stale → mark as failed + SIGTERM
- Crash detection: child.on('exit') with non-zero code while status is 'running'/'starting' → emit failed event
- cancelWorker: send JSON-RPC cancel, then SIGTERM after 5s timeout
- Event system: onEvent(listener) supports multiple listeners with error isolation (listener exceptions don't crash others)
- Worker cleanup on exit: removed from workers map; heartbeat interval auto-stopped when no workers remain
- uildEnv spreads process.env + sets LLM_MODEL from options (OPENAI_API_KEY/OPENAI_BASE_URL inherited)

#### taskQueue.ts
- Sequential execution: only one task runs at a time via 	his.current guard
- Uses ntries: Map<string, QueueEntry> for full lifecycle tracking — cancelled/failed entries remain findable via getStatus()
- Auto-dequeue on completion/failure/cancellation via WorkerManager event listener
- Spawn failure recovery: if spawnWorker throws, marks entry failed, clears current, tries next queued task
- FIFO order: 	his.queue.shift() dequeues oldest queued task first

#### Testing Patterns
- **vitest i.mock hoisting**: mock factory references must be inside i.hoisted() callback — i.hoisted() runs BEFORE i.mock factories, so variables defined there are available in the factory
- **Fake process pattern**: create mock objects with EventEmitter-like listeners + mitData/mitEvent helpers to simulate stdout data, exit events, and error events
- **stdin verification**: mock stdin.write as i.fn() to assert JSON-RPC control messages were written
- **Fake timers**: i.useFakeTimers() + i.advanceTimersByTime() for heartbeat timeout and cancel timeout tests
- **TaskQueue testing**: mock WorkerManager completely (spawnWorker, cancelWorker, onEvent) — don't need real process mocking
- **spawn args verification**: capture args/env in mock spawn function via closure variables in i.hoisted()
- All 63 new tests pass: 37 workerManager + 26 taskQueue

### agent-core Package — LangGraph StateGraph AI Loop (2026-05-18)

#### LangGraph 0.3.12 API Discovered (NOT as documented in plan)
- `Annotation.Root({})` creates state definition (NOT `Annotation.Root` or `StateSchema`)
- `START` = `"__start__"`, `END` = `"__end__"` — exported constants from `@langchain/langgraph`
- `addConditionalEdges("nodeName", routerFn, { returnValue: "targetNode" })` — map-based routing
- Router functions take `(state: StateType) => string` — return a key that maps to target node name
- `ConditionalEdgeRouter` type does NOT exist in 0.3.12 (removed or never existed) — use plain function
- `GraphNode` type does NOT exist in 0.3.12 — node functions are plain async functions
- `SqliteSaver.fromConnString(dbPath)` for checkpoint persistence — NOT constructor-based
- `graph.compile({ checkpointer })` — NOT `checkpointer` as standalone arg
- Reducers are objects: `Annotation<Type>({ reducer: (a, b) => ..., default: () => ... })` 
- Simple (non-reducer) fields: `Annotation<string>({ reducer: (a, b) => b, default: () => '' })`

#### Vercel AI SDK / @ai-sdk/openai Versions
- `ai` v6.0.184 installed, `@ai-sdk/openai` v3.0.64 installed
- Plan had assumed `ai@^4.0.0` and `@ai-sdk/openai@^1.0.0` — actual latest is much higher
- generateObject() used via dependency injection pattern (not imported directly to keep tests mockable)

#### TypeScript Config Issues
- Workspace monorepo: package tsconfig cannot have `rootDir: "."` if importing other workspace packages
- Root `tsconfig.base.json` has `rootDir: "."` (workspace root) — packages inherit if not overridden
- Solution: remove `rootDir` from package tsconfig, let base handle it
- `NodeNext` moduleResolution requires `.js` extensions in imports
- Vitest resolve.alias for `.js` → `.ts` extension mapping needed

#### Architecture Decisions
- MCP client is a singleton (getMCPClient/setMCPClient) for test mocking
- Plan/Verify nodes use factory pattern (createPlanNode/creaVerifyNode) accepting optional generateObject
- When generateObject not provided, nodes fall back to deterministic defaults
- Stuck detection: hash aria tree string, compare with lastObservationHash
- stuckCounter resets to 0 when observation changes, increments when same
- Route guards are code logic (not LLM) — stepCount≥maxSteps, stuckCounter≥3, verdict routing

### Report Graph — LangGraph Sub Graph (2026-05-18)

#### Fan-out/Fan-in Pattern
- LangGraph 0.3.12 supports parallel node execution via multiple START→node edges
- Pattern: `addEdge(START, 'nodeA')`, `addEdge(START, 'nodeB')`, ..., then all converge to a single node via `addEdge('nodeA', 'collector')` etc.
- All parallel nodes must write to DIFFERENT state fields to avoid race conditions (reducers merge, but concurrent writes to the same field are non-deterministic)
- Sub Graph compiles separately and can be invoked via `graph.compile().invoke(state)` - returns the final state

#### Node Factory Pattern
- Each analysis node follows the same DI pattern as plan/verify: `createXxxNode(opts?: { generateObject? })`
- When generateObject is not provided, nodes return deterministic defaults (empty findings, computed stats)
- This enables testing without LLM dependency

#### PatternStore
- JSONL format: `JSON.stringify(pattern) + '\n'` appended via `appendFileSync`
- Dedup by `errorType + targetDescription` similarity (case-insensitive, punctuation-insensitive substring match)
- Frequency accumulation on match: `existing.frequency + new.frequency`
- Cap keywords at 10 per pattern (Set union + slice)
- `loadPatternsForPrompt(goal, maxCount=50)` filters patterns by keyword overlap with goal, sorts by frequency descending
- Tests use `mkdtempSync(tmpdir())` for temp file isolation - cleaned via `rmSync(recursive: true, force: true)` in afterEach

#### Test Strategy
- 29 tests covering: individual nodes (with/without generateObject), PatternStore CRUD + dedup, full Sub Graph integration (fan-out/fan-in), partial options
- Node tests verify prompt content includes expected context (goal, history, failed steps)
- Integration test verifies all 4 parallel nodes execute AND produce correct results in summarize
- Pre-existing cli.test.ts failure (undefined mockState) unrelated to report-graph - 84/84 tests pass otherwise

### Dashboard TaskList Page + Router Setup (2026-05-19)

#### React Router Setup
- `react-router-dom` installed as dependency for @eata/dashboard
- BrowserRouter wraps entire app in main.tsx (not needed separately since App.tsx has it)
- Layout component uses `<Outlet />` for nested routes — sidebar stays persistent across pages
- Routes: `/` → TaskList, `/task/:id` → TaskDetail (placeholder), `/monitor/:id` → LiveMonitor (placeholder)

#### Component Patterns
- TaskCard: clickable card with `role="button"` + `tabIndex={0}` for keyboard accessibility
- Action buttons (cancel/delete) hidden by default, shown on hover via `group-hover:opacity-100`
- CreateTaskForm: Radix UI Dialog + Select, Zod v4 validation with `CreateTaskRequestSchema.safeParse()`
- Zod v4 `.default(50)` on `maxSteps` means parsed output ALWAYS includes `maxSteps: 50` even when not provided
- Zod v4 `.min(1)` error message is "Too small: expected string to have >=1 characters" (NOT "Too short")

#### Testing Patterns
- TaskCard tests: use `container.querySelector('[role="button"]')` instead of `getByRole('button')` when card div has role="button" AND contains actual <button> elements
- Radix Select doesn't open in jsdom — test with default value instead of trying to interact with dropdown
- `@testing-library/jest-dom` needed for `toBeInTheDocument()` matcher — add setup file to vitest config
- Dialog reset: use `useEffect(() => { if (!open) reset() }, [open])` to handle controlled open prop changes (rerender doesn't trigger onOpenChange)
- Radix Dialog accessibility: add `aria-describedby={undefined}` to Dialog.Content to suppress "Missing Description" warning in tests

#### Store/API Additions
- Added `cancelTask` to taskStore interface and implementation (was missing from T13)
- Added `api.tasks.cancel(id)` endpoint (POST /api/tasks/:id/cancel)
- cancelTask updates task in-place via `state.tasks.map()` rather than removing

#### Build Verification
- `tsc --noEmit` passes with zero errors
- `vite build` succeeds: 1793 modules, 379KB JS bundle
- All 35 tests pass: 16 stores + 11 TaskCard + 8 CreateTaskForm
