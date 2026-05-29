# Wave 21+ Coverage Optimization Design

## Goal

Improve test coverage for 6 remaining low-coverage files, bringing overall project coverage from 86.99% toward 90%+.

## Current State

| File | Lines | Coverage | Existing Tests |
|------|-------|----------|----------------|
| taskStore.ts | 116 | 9.37% | stores.test.ts (partial) |
| sse.ts | 50 | 47.05% | None |
| stream.ts | 29 | 30% | sse.test.ts (SSEHub only) |
| reports.ts | 122 | 67.32% | reports-uuid.test.ts (UUID only) |
| server.ts | 188 | 71.32% | server.test.ts (basic) |
| CreateTaskForm.tsx | 259 | 79.43% | CreateTaskForm.test.tsx (partial) |

## Design

Each file is an independent wave. Waves execute sequentially (A → B → C → D → E → F) because they share no dependencies. Within each wave, the work is a single agent task.

---

### Wave A: taskStore.ts (9.37% → ~80%)

**Target file:** `apps/dashboard/src/stores/taskStore.ts`
**Test file:** `apps/dashboard/src/__tests__/stores.test.ts` (extend existing)

**New tests:**

1. `extractErrorMessage` — 4 branches:
   - `Error` instance → returns `error.message`
   - Plain string → returns string
   - Object with `error` key → returns `error` value
   - Object with `message` key → returns `message` value
   - Fallback → returns `'Unknown error'`

2. `cancelTask` — success + error:
   - Mock `api.tasks.cancel` → verify state update (task status → 'cancelled')
   - Mock rejection → verify error state set

3. `subscribeToTask` SSE callbacks:
   - Mock `connectSSE` capture callbacks → invoke `onStep` with mock data → verify state update
   - Invoke `onComplete` → verify task status updated
   - Invoke `onError` → verify error state set
   - MAX_STEPS cap: set steps array > 1000, invoke `onStep` → verify slicing

4. Error path assertions for `createTask`/`deleteTask`:
   - Verify `state.error` is set on rejection

**Estimated coverage gain:** +3-4% overall

---

### Wave B: sse.ts (47.05% → ~95%)

**Target file:** `apps/dashboard/src/lib/sse.ts`
**Test file:** `apps/dashboard/src/__tests__/sse.test.ts` (new file)

**New tests:**

1. `safeParseEventData`:
   - Valid JSON message event → returns parsed object
   - Invalid JSON → returns null
   - Empty data → returns null

2. `connectSSE`:
   - Creates EventSource with correct URL (`/api/stream/tasks/{taskId}`)
   - Registers `step` listener → invokes `onStep` callback with parsed data
   - Registers `log` listener → invokes `onLog` callback
   - Registers `status` listener → invokes `onStatus` callback
   - Registers `complete` listener → invokes `onComplete` callback
   - Registers `error` listener → invokes `onError` callback
   - Skips callback when `safeParseEventData` returns null
   - Missing callback (optional) → no error
   - `onerror` handler logs warning (already added in W19)

**Mocking strategy:** Mock global `EventSource` class with addEventListener tracking.

**Estimated coverage gain:** +0.3% overall

---

### Wave C: stream.ts (30% → ~90%)

**Target file:** `apps/server/src/routes/stream.ts`
**Test file:** `apps/server/src/__tests__/stream-routes.test.ts` (new file)

**New tests:**

1. Invalid UUID → 400 response (via `server.inject`)
2. `addClient` returns false → 429 "Too many SSE connections"
3. Happy path: mock SSEHub → verify `addClient` called with correct args
4. Initial `status` event broadcast after connection

**Challenge:** SSE connections don't close, so `server.inject()` hangs. Solution: mock the SSEHub so `addClient` immediately calls `reply.raw.end()` or use a timeout approach.

**Estimated coverage gain:** +0.1% overall

---

### Wave D: reports.ts (67.32% → ~90%)

**Target file:** `apps/server/src/routes/reports.ts`
**Test file:** `apps/server/src/__tests__/reports.test.ts` (new file, or extend reports-uuid.test.ts)

**New tests:**

1. **Route 1 — GET /tasks/:id/report:**
   - `validatePath` throws → 400
   - Report file exists → 200 + JSON body
   - Report file ENOENT → 404

2. **Route 2 — GET /tasks/:id/report/html:**
   - Task not in DB → 404
   - Task exists with steps → 200 + HTML content + correct Content-Type/Content-Disposition headers

3. **Route 3 — GET /tasks/:id/steps/:stepIndex/screenshot:**
   - Step index > 1000 → 400
   - Step not found → 404
   - Screenshot file exists → 200 + image/png + Cache-Control header
   - Screenshot file ENOENT → 404

**Mocking strategy:** Use in-memory SQLite (already set up in server tests), insert test task/step records, mock `readFile` for file system operations.

**Estimated coverage gain:** +0.5% overall

---

### Wave E: server.ts (71.32% → ~85%)

**Target file:** `apps/server/src/server.ts`
**Test file:** `apps/server/src/__tests__/server.test.ts` (extend existing)

**New tests:**

1. `normalizeRouteLabel`:
   - URL with UUID → replaces with `:id`
   - URL without UUID → unchanged
   - Multiple UUIDs → all replaced

2. API key auth hook:
   - No `apiKey` config → all requests pass through
   - With `apiKey` → missing header → 401
   - With `apiKey` → correct header → 200
   - Skip paths (`/health`, `/metrics`, `/docs`, `/api/stream`) → pass through even with apiKey

3. Config override:
   - Partial config → defaults merged correctly

**Note:** Auto-start block and graceful shutdown are hard to test in unit tests (process-level concerns). Skip those.

**Estimated coverage gain:** +0.3% overall

---

### Wave F: CreateTaskForm.tsx (79.43% → ~90%)

**Target file:** `apps/dashboard/src/components/CreateTaskForm.tsx`
**Test file:** `apps/dashboard/src/__tests__/CreateTaskForm.test.tsx` (extend existing)

**New tests:**

1. Provider loading:
   - Mock `api.providers.list` returns providers → verify provider selector rendered
   - Mock returns empty → verify no provider selector

2. Provider selection:
   - Select a provider → verify `providerId` included in submission

3. Submit error handling:
   - Mock `createTask` rejects → verify error message displayed in form

4. Provider load failure:
   - Mock `api.providers.list` rejects → verify graceful handling (no crash)

5. Submitting state:
   - During submission → verify button disabled

**Estimated coverage gain:** +0.2% overall

---

## Execution Order

```
Wave A: taskStore.ts (+3-4%)  — highest impact
Wave B: sse.ts (+0.3%)         — quick win, new file
Wave C: stream.ts (+0.1%)      — small file, injection tests
Wave D: reports.ts (+0.5%)     — route coverage
Wave E: server.ts (+0.3%)      — unit tests for helpers/hooks
Wave F: CreateTaskForm.tsx (+0.2%) — UI gaps
```

**Total estimated gain:** +4.4-5.4% → projected ~91-92% overall coverage

## Verification

After each wave:
- `pnpm test` — all tests pass
- `npx vitest run --coverage` — verify coverage increase
- `npx eslint --quiet` — 0 errors

After all waves:
- Update `docs/loop-progress.md` with final metrics
- Commit each wave separately with descriptive message
