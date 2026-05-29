# Dashboard Features V2 — Implementation Plan

> **Status: COMPLETED** — All 5 tasks implemented and tested (W30-W31)

**Goal:** Implement 5 dashboard features: Schedule UI, Notification Settings, Report Templates, Enhanced Comparison, PDF Export.

**Architecture:** Backend-first where needed, then frontend. Follow existing patterns (Fastify routes → API client → React pages → tests).

---

## Task 1: Report Template Management UI

**Files:**
- Create: `apps/dashboard/src/pages/ReportTemplates.tsx`
- Create: `apps/dashboard/src/components/ReportTemplateEditor.tsx`
- Modify: `apps/dashboard/src/lib/api.ts`
- Modify: `apps/dashboard/src/App.tsx`
- Modify: `apps/dashboard/src/components/Layout.tsx`
- Test: `apps/dashboard/src/__tests__/ReportTemplates.test.tsx`

Backend already has full CRUD at `/api/report-templates`. Only frontend needed.

- [x] Add `reportTemplates` API methods to `api.ts`
- [x] Create `ReportTemplates.tsx` page with card grid
- [x] Create `ReportTemplateEditor.tsx` dialog (name, description, content textarea)
- [x] Add route `/report-templates` in App.tsx
- [x] Add nav link in Layout.tsx sidebar
- [x] Write tests: list rendering, create dialog, edit, delete, default badge

---

## Task 2: Schedule Management UI

**Files:**
- Create: `apps/dashboard/src/pages/ScheduleList.tsx`
- Create: `apps/dashboard/src/components/CreateScheduleForm.tsx`
- Create: `apps/dashboard/src/components/ScheduleHistory.tsx`
- Modify: `apps/dashboard/src/lib/api.ts`
- Modify: `apps/dashboard/src/App.tsx`
- Modify: `apps/dashboard/src/components/Layout.tsx`
- Test: `apps/dashboard/src/__tests__/ScheduleList.test.tsx`

Backend already has full CRUD + run + history. Only frontend needed.

- [x] Add `schedules` API methods to `api.ts`
- [x] Create `ScheduleList.tsx` page with table/card list
- [x] Create `CreateScheduleForm.tsx` dialog (name, template dropdown, cron input, enabled toggle)
- [x] Create `ScheduleHistory.tsx` component (execution history table)
- [x] Add route `/schedules` in App.tsx
- [x] Add nav link in Layout.tsx sidebar
- [x] Write tests: list rendering, create form validation, run now, history display

---

## Task 3: Notification Settings Page

**Files:**
- Create: `apps/server/src/routes/notifications.ts`
- Create: `apps/dashboard/src/pages/NotificationSettings.tsx`
- Modify: `apps/server/src/server.ts` (register routes)
- Modify: `apps/server/src/db/migrations.ts` (add notification_log table)
- Modify: `apps/dashboard/src/lib/api.ts`
- Modify: `apps/dashboard/src/App.tsx` or `Settings.tsx`
- Test: `apps/server/src/__tests__/notifications.test.ts`
- Test: `apps/dashboard/src/__tests__/NotificationSettings.test.tsx`

- [x] Create notification_log DB table migration
- [x] Create `notifications.ts` route (GET/PUT config, POST test, GET history)
- [x] Register routes in server.ts
- [x] Add `notifications` API methods to `api.ts`
- [x] Create `NotificationSettings.tsx` page (webhook URLs, SSE toggle, test button, log table)
- [x] Add route in App.tsx (or tab in Settings)
- [x] Write server tests: config CRUD, test notification, history
- [x] Write UI tests: form rendering, add/remove webhook, test button

---

## Task 4: Enhanced Task Comparison

**Files:**
- Modify: `apps/server/src/routes/compare.ts`
- Modify: `apps/dashboard/src/pages/CompareView.tsx`
- Modify: `apps/dashboard/src/lib/api.ts`
- Test: `apps/server/src/__tests__/compare.test.ts` (add detailed tests)
- Test: `apps/dashboard/src/__tests__/CompareView.test.tsx` (update)

- [x] Add `POST /api/tasks/compare/detailed` endpoint returning step-by-step diff
- [x] Add `compare.detailed()` to api.ts
- [x] Enhance CompareView with Status Summary Card
- [x] Add Step Timeline Diff (side-by-side)
- [x] Add Action Frequency Chart (recharts bar chart)
- [x] Write server tests: detailed comparison data structure
- [x] Write UI tests: status card, timeline diff, chart rendering

---

## Task 5: PDF Export

**Files:**
- Modify: `apps/server/package.json` (add puppeteer dependency)
- Modify: `apps/server/src/services/exportService.ts`
- Modify: `apps/server/src/routes/exports.ts`
- Modify: `apps/dashboard/src/lib/api.ts`
- Modify: `apps/dashboard/src/pages/TaskDetail.tsx`
- Modify: `apps/dashboard/src/pages/TaskList.tsx`
- Test: `apps/server/src/__tests__/export.test.ts` (add PDF tests)

- [x] Add pdfkit dependency (pure JS, no browser needed)
- [x] Add `toPdf()` + `batchToPdf()` methods in exportService
- [x] Add 'pdf' to ExportFormatEnum
- [x] Update api.ts to support 'pdf' format
- [x] Add PDF button to TaskDetail export dropdown
- [x] Add PDF button to TaskList batch export toolbar
- [x] Write tests: PDF header validation, content-type, task data included

---

## Execution Order

```
Wave 1 (parallel — backend exists, frontend only):
  ├── Task 1: Report Template UI
  └── Task 2: Schedule Management UI

Wave 2 (parallel — new backend + frontend):
  ├── Task 3: Notification Settings
  └── Task 4: Enhanced Comparison

Wave 3 (sequential — new dependency):
  └── Task 5: PDF Export
```
