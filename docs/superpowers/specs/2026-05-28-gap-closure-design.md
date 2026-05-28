# Gap Closure Spec: Spec Direction Audit Remediation

**Date:** 2026-05-28
**Status:** Draft

---

## Overview

Addresses 5 gaps identified in the spec direction audit. Ordered by priority (effort × impact).

---

## G1: Wire Settings.tsx to Provider API

**Direction:** F1 (Dashboard UI)
**Effort:** Low | **Impact:** High

### Problem
`Settings.tsx` reads/writes providers via `localStorage` (`loadConfig()`/`saveConfig()`). The API client in `api.ts` (lines 119-150) already has full Provider CRUD (`list`, `create`, `update`, `delete`, `test`, `activate`), but Settings.tsx never calls it.

### Design

Replace `loadConfig()`/`saveConfig()` with API calls:

1. **Load**: `useEffect` calls `api.providers.list()` on mount
2. **Create**: `ProviderFormDialog` submit calls `api.providers.create()`
3. **Update**: `ProviderFormDialog` edit calls `api.providers.update(id)`
4. **Delete**: delete button calls `api.providers.delete(id)`
5. **Test**: test button calls `api.providers.test(id)`
6. **Activate**: star button calls `api.providers.activate(id)`

**Type alignment**: `Settings.tsx` defines its own `LLMProviderConfig` (line 23). `api.ts` exports the same interface (line 38). Remove the local definition, import from `api.ts`.

**Migration**: Keep `loadConfig()` as fallback for first load when API is unreachable. On successful API load, clear localStorage.

**Error handling**: Show toast/alert on API failures. Keep optimistic UI for delete.

### Files to modify
- `apps/dashboard/src/pages/Settings.tsx` — replace localStorage with api calls
- No server changes needed (Provider CRUD already exists)

### Acceptance Criteria
- [ ] Settings page loads providers from API
- [ ] Add/edit/delete/test/activate all use API endpoints
- [ ] localStorage used only as migration fallback
- [ ] Error states shown to user

---

## G2: Async I/O in exportService

**Direction:** A3 + C1 (Feature + Performance)
**Effort:** Low | **Impact:** Medium

### Problem
`exportService.ts` line 7 imports `readFileSync` from `node:fs`. Line 252 uses `readFileSync()` to read HTML report templates. This blocks the event loop during file reads.

### Design

Replace:
```typescript
import { readFileSync, existsSync } from 'node:fs';
```
With:
```typescript
import { readFile, access } from 'node:fs/promises';
```

All call sites of `readFileSync` become `await readFile()`. All call sites of `existsSync` become `await access().then(() => true).catch(() => false)`.

Since the calling functions are already `async`, no signature changes needed.

### Files to modify
- `apps/server/src/services/exportService.ts` — replace sync I/O with async

### Acceptance Criteria
- [ ] No `readFileSync` or `existsSync` imports in exportService.ts
- [ ] All file reads use `fs/promises`
- [ ] Export functionality works identically

---

## G3: Metrics Endpoint Test

**Direction:** B (Quality Assurance)
**Effort:** Low | **Impact:** Medium

### Problem
The `/metrics` endpoint (added in engineering improvement Phase 3) has no test coverage. It's the only untested server route.

### Design

Create `apps/server/src/__tests__/metrics.test.ts`:

Test cases:
1. GET /metrics returns 200 with Prometheus text format
2. Response contains `eata_tasks_total` counter
3. Response contains `eata_workers_active` gauge
4. Response contains `eata_http_requests_total` counter
5. Content-Type is `text/plain; version=0.0.4; charset=utf-8`

Pattern: follow existing test style from `health.test.ts` or route tests.

### Files to create
- `apps/server/src/__tests__/metrics.test.ts`

### Acceptance Criteria
- [ ] Test file exists with 5+ test cases
- [ ] All tests pass
- [ ] Coverage for /metrics route

---

## G4: Report Templates Table + CRUD

**Direction:** A4 (Feature Enhancement)
**Effort:** Medium | **Impact:** Medium

### Problem
Spec Direction A4 planned a `report_templates` table and CRUD API. Neither the migration nor the route exists.

### Design

**Database migration** — add to `apps/server/src/db/migrations.ts`:
```sql
CREATE TABLE IF NOT EXISTS report_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  config TEXT NOT NULL,  -- JSON: sections, styling, branding
  is_default INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**API routes** — add `apps/server/src/routes/report-templates.ts`:
- `GET /api/report-templates` — list all
- `GET /api/report-templates/:id` — get one
- `POST /api/report-templates` — create
- `PUT /api/report-templates/:id` — update
- `DELETE /api/report-templates/:id` — delete

**Register route** in `apps/server/src/routes/index.ts`.

**Shared type** — add `ReportTemplate` to `packages/shared-types/src/task.ts` or new file.

### Files to create/modify
- `apps/server/src/db/migrations.ts` — add report_templates table
- `apps/server/src/routes/report-templates.ts` — CRUD routes
- `apps/server/src/routes/index.ts` — register route
- `packages/shared-types/src/` — add ReportTemplate type

### Acceptance Criteria
- [ ] report_templates table created on server start
- [ ] CRUD API endpoints functional
- [ ] Route registered and accessible

---

## G5: BatchList UI

**Direction:** A1 + F2 (Feature + Dashboard UI)
**Effort:** Medium | **Impact:** Medium

### Problem
`apps/server/src/routes/batches.ts` exists with batch CRUD API, but no `BatchList.tsx` frontend page. Users can create batches via API but have no UI.

### Design

Create `apps/dashboard/src/pages/BatchList.tsx`:

**Layout:**
- Table/list of batches with columns: Name, Status, Task Count, Created
- Status badges: pending (gray), running (blue), completed (green), failed (red)
- Click row → navigate to batch detail (or expand inline)
- "New Batch" button → dialog with name, goal, target app, task count

**API integration:**
- `api.batches.list()` — load batches
- `api.batches.create()` — create new batch
- `api.batches.get(id)` — load batch detail with tasks

**Route:** Add `/batches` route in `App.tsx`.

**i18n:** Add batch-related keys to `zh.json` and `en.json`.

### Files to create/modify
- `apps/dashboard/src/pages/BatchList.tsx` — new page
- `apps/dashboard/src/App.tsx` — add route
- `apps/dashboard/src/lib/api.ts` — add batch API methods (if missing)
- `apps/dashboard/src/i18n/zh.json` — batch keys
- `apps/dashboard/src/i18n/en.json` — batch keys

### Acceptance Criteria
- [ ] BatchList page renders batch list from API
- [ ] New Batch dialog creates batch via API
- [ ] Route /batches accessible from navigation
- [ ] i18n keys added for zh and en

---

## Implementation Order

1. **G1** (Settings API) — unlocks F1, highest ROI
2. **G2** (async I/O) — quick fix, unblocks C1
3. **G3** (metrics test) — quick fix, completes B
4. **G4** (report_templates) — medium effort, unblocks F4
5. **G5** (BatchList UI) — medium effort, completes A1/F2
