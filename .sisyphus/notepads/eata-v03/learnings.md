# Learnings: EATA v0.3 Sub-Agent Audit Chain

## Patterns
- `SubAgentInput` uses `Record<string, unknown>` for context — cast specific values via `as` with narrow types (e.g. `as SubAgentOutput | undefined`) rather than `as any`.
- Each sub-agent class should have a single `run(input: SubAgentInput): Promise<SubAgentOutput>` method — no overloads, no extra public methods.
- Deterministic audit (no LLM): keyword scanning over goal text + context entries is sufficient for static analysis.
- The `ReportSynthesizer` must gracefully handle missing upstream outputs (chain-integrity warnings) — never assume context keys exist.

## Conventions
- Use `new Date().toISOString()` for timestamps in `AuditReport`.
- Severity ordering: `pass < info < warn < fail` — the worst value wins when aggregating across multiple agents.
- Findings are prefixed with `[role]` in `ReportSynthesizer` to maintain traceability.
- Recommendations are deduplicated across the chain.
- Export classes from `sub-agents/index.ts` and re-export from `src/index.ts`.
- Test names follow `describe('Component') / describe('method') / it('does X')` structure.

## Successful Approach
- Replaced the legacy `ExecutionAnalyst.analyze(state)` (using TestState) with `run(input: SubAgentInput)` while preserving the verdict-reading logic by sourcing verdict from `input.context['currentVerdict']`.
- Used `Array.from(Object.entries(input.context))` flatten + `JSON.stringify` to build a searchable haystack for security keyword scanning.
- Used `Set<string>` in `TestPlanner` to deduplicate test scenarios from overlapping keyword matches.

---

## WorkerPool Architecture Analysis (2026-05-20)

### Key insight: Three-layer architecture intended but only layers 1+3 implemented

**Layer 1 — Abstraction** (workerPool/): Fully coded. Generic pool/queue abstraction.
**Layer 2 — Bridge** (missing): Adapter to connect WorkerPoolManager.TaskExecutor to WorkerManager.spawnWorker
**Layer 3 — Execution** (workerManager.ts): Fully coded. Real child_process management.

### The TaskExecutor interface is the bridge point:
`	ypescript
// workerPool/types.ts
interface TaskExecutor {
  execute(task: PoolTask, onComplete: (taskId, result, error?) => void): void;
  cancel(taskId: string): void;
}
`

WorkerManager already has spawnWorker(options) and cancelWorker(taskId) — the adapter
just needs to map PoolTask → WorkerOptions and handle the onComplete callback via
WorkerManager.onEvent().

### File inventory:
- `apps/server/src/services/workerPool/manager.ts` (118 lines) — DONE but unused
- `apps/server/src/services/workerPool/queue.ts` (47 lines) — DONE but unused  
- `apps/server/src/services/workerPool/types.ts` (38 lines) — DONE but unused
- `apps/server/src/services/workerPool/index.ts` (11 lines) — barrel exports
- `apps/server/src/services/workerManager.ts` (362 lines) — REAL executor, has tests
- `apps/server/src/services/taskQueue.ts` (115 lines) — OLD single-concurrency queue, has tests
- `apps/server/src/__tests__/workerManager.test.ts` — exists
- `apps/server/src/__tests__/taskQueue.test.ts` (329 lines) — exists
- **MISSING**: `apps/server/src/__tests__/workerPool.test.ts`
- **MISSING**: server.ts bootstrap of WorkerPoolManager
- **MISSING**: POST /tasks → WorkerPoolManager.submit() wiring
- **MISSING**: POST /tasks/:id/cancel → WorkerPoolManager.cancel() wiring

### Two TaskQueue classes exist (name collision!):
- `workerPool/queue.ts` exports `TaskQueue` (priority-based)
- `services/taskQueue.ts` exports `TaskQueue` (FIFO only)
The old one should be deprecated/removed once WorkerPool is wired.

---

## CDP Integration (Task 11) — 2026-05-21

### Architecture Decisions
- **CDPTool base class uses `CDPContext` interface** (dependency injection), not the concrete `CDPClient` class — allows any CDP-compatible implementation.
- **CDPClient implements CDPContext** — concrete WebSocket-based client. Could be swapped for a Playwright-backed implementation later.
- **Tool naming**: Browser CDP tools use `browser_` prefix (browser_snapshot, browser_click...) to avoid collisions with existing context-based tool names (snapshot, click...). Electron CDP tools use `cdp_` prefix (cdp_launch, cdp_close...) for the same reason.
- **12 CDP tools** (spec said 11 but listed 12: 7 browser + 5 electron).
- **CDPSession** wraps a session ID + target type, delegates to the client's raw command sender.

### Patterns
- Each CDP tool sends actual DevTools Protocol commands: `Page.navigate`, `Input.dispatchMouseEvent`, `Runtime.evaluate`, `Page.handleJavaScriptDialog`, etc.
- The `CDPTool.sendCDP()` helper wraps `client.sendCommand()` into `ToolResult` format.
- `createCDPTools(client)` factory produces all 12 tools. `ToolRegistry.registerCDPTools(client)` and `ToolRegistry.withCDP(client)` convenience methods.
- Test mocks just use the real `CDPClient` (which internally returns simulated results without a real WebSocket).

### Testing Pattern
- 38 tests covering: CDPClient lifecycle (connect, disconnect, sessions, sendCommand), CDPSession, all 12 tools.
- No mock context needed since CDPClient is the real implementation with internal simulation.

## T23: i18n Dashboard Tests
- Created pps/dashboard/src/__tests__/i18n.test.tsx with 29 tests across 5 describe blocks
- i18next normalizes allbackLng: 'en' to ['en'] internally — use 	oEqual(['en']) not 	oBe('en')`n- Use ct(async () => { await i18n.changeLanguage('zh'); }) when changing language inside rendered component tests to avoid React act() warnings
- setup.ts already imports i18n/config, so i18n singleton is shared across all test files
- i18n.addResource() + i18n.removeResourceBundle() + i18n.addResourceBundle() pattern works for testing fallback behavior with dynamic keys
- Test structure: describe('i18n') > describe('init' | 'switching' | 'key coverage' | 'hooks' | 'fallback behavior') > it(...)
- All 119 tests pass (9 test files), 0 regressions

## T24: GitHub Actions CD + Docker Build

### Docker Tagging Strategy
- `docker/metadata-action@v5` with `type=raw,value=<prefix>-${{ github.ref_name }}-${{ github.sha }}` produces clean tags like `server-release-v0.3-abc1234`
- `type=semver` + `enable=${{ startsWith(github.ref, 'refs/tags/') }}` for version tags only
- `latest` tag gated behind `startsWith(github.ref, 'refs/tags/v')` — only on actual version releases
- Three images: `eata-server`, `eata-dashboard`, `eata` (combined full-stack)

### Multi-stage Docker Naming
- Dockerfile stages must be named (`AS runner`) for `--target` builds to work in CD workflows
- The runtime stage was previously unnamed — renamed to `runner` for `docker build --target runner`

### CI/CD Gate Pattern
- Since ci.yml only triggers on `main`, CD workflow includes its own `test` job as a gate
- `needs: test` + `if: success()` in the `build` job ensures Docker images only build after tests pass
- This avoids modifying ci.yml (which is forbidden)

### GHA Docker Caching
- `cache-from: type=gha,scope=<name>` and `cache-to: type=gha,mode=max,scope=<name>` per image
- Separate scopes for server, dashboard, combined prevent cache collisions

### .dockerignore Additions
- Added `.env` / `.env.*` exclusion (environment secrets never belong in images)
- Added `coverage/` exclusion (test output, rebuilt in CI)


## T25: Dashboard Priority Control (2026-05-21)

### Schema Design Insight
- Zod v4 .default() makes output type REQUIRED in \z.infer\ (TypeScript). This breaks existing mocks that don't include the defaulted field.
- Solution: Use \TaskPriorityEnum.optional()\ (without .default) so the TypeScript type stays optional. Server already applies \?? 'medium'\ in \dbRowToTask\.
- Pattern: When adding optional fields to existing schemas, prefer \.optional()\ over \.default()\ to keep backward compat with existing test mocks.

### Pattern: priorityConfig follows statusConfig exactly
- Both are \Record<Enum, { labelKey: string; classes: string }>\
- priorityConfig uses i18n keys from \priority.*\ namespace (not \	askCard.priority_*\) to allow reuse in CreateTaskForm

### i18n Namespace Design
- Priority keys live under \priority.high/medium/low\ (shared namespace)
- \createTask.priorityLabel\ — form label
- \	askCard.priority\ — reserved (added for completeness)
- Sharing \priority.*\ keys avoids duplication between TaskCard badge and CreateTaskForm dropdown

### TaskCard Layout with Additional Badge
- Wrapped status + priority badges in a \<div className="flex items-center gap-2">\ to keep them left-aligned in the \justify-between\ header layout.
- Without the wrapper, justify-between would stretch 3 children (status, priority, actions) across the full width.

### Flag Icon Choice
- Used \lucide-react\ Flag icon for priority dropdown items — visually distinct from other form fields and conveys urgency/importance.

### Type Safety with undefined priority
- \Task.priority\ is \TaskPriority | undefined\ after schema change
- TaskCard: \	ask.priority ?? 'medium'\ fallback before config lookup — ensures badge always renders

## T27: Few-Shot Examples Management UI

### Design Decisions
- Used localStorage for CRUD (same pattern as Settings.tsx) since no server API routes for few-shot exist yet
- When server API routes are added, migration is simple: swap api.fewShot.list() to fetch from server
- FewShotExample and FewShotStep types defined in api.ts (matching agent-core types without requiring import)
- Route: /few-shot with nav.fewShot key (BookOpen icon from lucide-react)

### Patterns
- Radix UI Dialog for add/edit/delete confirmations (same as Settings.tsx)
- Tag input: type and press Enter/comma to add chip, X button to remove
- Difficulty chips use color-coded badges (emerald/amber/red)
- Domain chips use color-coded badges (indigo/purple/zinc)
- Empty state shows centered icon with "Add Your First Example" CTA button
- Search filters by goal, expectedResult, tags, and domain (case-insensitive)
- i18n: all text via useTranslation(), 41 fewShot keys in both en.json and zh.json
- Steps rendered as numbered cards with action and observation inputs

### Key Pattern: localStorage CRUD in api.ts
api.fewShot.list() / add() / update() / remove() -- all synchronous since they use localStorage.
Future server migration: change return types to Promise and body to fetch calls.

## T29: Language Switcher UI

### Architecture
- `LanguageSwitcher.tsx` is a standalone segmented control (Globe icon + two toggle buttons)
- Placed inside sidebar footer (above the "Electron AI Testing Agent" footer text) via Layout.tsx import
- `i18n.changeLanguage(lang)` updates the UI reactively; `localStorage.setItem('language', lang)` persists across reloads (same key i18n config reads from)

### Pattern
- `useTranslation()` returns `{ t, i18n }` — use `i18n.changeLanguage()` not `i18n.changeLanguage()` via separate import
- `i18n.language` reflects current language (used for active state styling)
- Segmented control pattern: `role="group"` with `aria-label`, each button has `aria-pressed={isActive}`
- Active state: `bg-indigo-500/15 text-indigo-300` (same as sidebar nav active state)
- Inactive: `text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300`

### i18n Keys
- `langSwitcher.title` — "Language" / "语言"
- `langSwitcher.en` — "English" / "English" (same in both)
- `langSwitcher.zh` — "中文" / "中文" (same in both)

### Design Decisions
- Used `Globe` from lucide-react (compact, conveys language/internationalization)
- Segmented control is more compact than a `<select>` dropdown — fits sidebar width (w-56)
- Label rendered as uppercase tracking-wider text with icon (not using `<label>` element since buttons have aria-pressed)
- `mt-auto` on footer container ensures language switcher hugs bottom regardless of nav item count

## T30: E2E Full Pipeline v0.3 Tests

### Server Bug Fix Discovered
- pps/server/src/routes/tasks.ts had a bug: priority field from CreateTaskRequestSchema.parse() is TaskPriority | undefined (.optional()) but was inserted into SQLite NOT NULL column without a fallback.
- Fix: priority ?? 'medium' in both the SQL INSERT and the pool.submit() call.

### Few-Shot Store Module-Level Constant
- FEW_SHOT_DIR = join(process.cwd(), 'data', 'few-shot-examples') is evaluated at import time.
- Cannot override with process.cwd = () => dataDir because the constant is already frozen.
- To test few-shot matching, write fixture JSON files to the actual data/few-shot-examples/ dir under project root and clean up in finally block.

### WorkerPoolManager Test Patterns
- Use TaskExecutor interface mock with execute(task, onComplete) pattern.
- maxConcurrency=1 forces serial execution, useful for testing priority ordering.
- maxConcurrency=3 with >3 tasks tests the "never exceeds max concurrent" invariant.
- Use vi.waitFor() for async assertions on pool state transitions.

### Audit Chain in Main Graph
- The verify node runs runAuditChain() after each execution step.
- auditChainResult is stored in TestState and can be asserted when graph reaches verify.
- The chain always returns 4 entries in chainOrder even if an agent throws (partial results).
