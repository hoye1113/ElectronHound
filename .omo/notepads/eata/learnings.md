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
