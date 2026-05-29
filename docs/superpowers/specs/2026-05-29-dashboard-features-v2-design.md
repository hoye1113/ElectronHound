# Dashboard Features V2 — Design Spec

> 5 features to complete the ElectronHound dashboard experience.

**Goal:** Fill remaining dashboard gaps — schedule management, notification config, report template UI, enhanced task comparison, and PDF export.

**Architecture:** All features follow the existing pattern: server route → dashboard API client → React page component → tests. Backend APIs mostly already exist; this spec focuses on frontend implementation + any missing backend pieces.

**Tech Stack:** React, Tailwind CSS, Fastify, better-sqlite3, Zod, lucide-react, recharts

---

## Feature 1: Schedule Management UI

### Problem
7 schedule API endpoints exist (GET/POST/PUT/DELETE /schedules, POST /schedules/:id/run, GET /schedules/:id/history) but zero dashboard UI.

### Design

**New page:** `apps/dashboard/src/pages/ScheduleList.tsx`

**Layout:**
- Header with "New Schedule" button
- Table/card list showing: name, template goal, cron expression, enabled toggle, last run, next run, run count, last status
- Each row has actions: Edit, Run Now, Delete
- Status badges: running/completed/failed (color-coded)

**New component:** `apps/dashboard/src/components/CreateScheduleForm.tsx`
- Dialog form with fields: name, template (dropdown from existing templates), cron expression (text input with helper), enabled toggle
- Cron expression validation on client side
- Submit calls `api.schedules.create()`

**New component:** `apps/dashboard/src/components/ScheduleHistory.tsx`
- Shows execution history for a schedule (GET /schedules/:id/history)
- Table: run ID, task ID (link), started at, status, error message

**API additions in `api.ts`:**
```typescript
schedules: {
  list(): Promise<Schedule[]>,
  get(id: string): Promise<Schedule>,
  create(data: CreateScheduleRequest): Promise<Schedule>,
  update(id: string, data: Partial<Schedule>): Promise<Schedule>,
  delete(id: string): Promise<void>,
  run(id: string): Promise<{ taskId: string }>,
  history(id: string): Promise<ScheduleRun[]>,
}
```

**Route in App.tsx:** `/schedules` → ScheduleList

**Tests:** 15+ tests covering list rendering, create form validation, run now action, history display, error states.

---

## Feature 2: Notification Settings Page

### Problem
NotificationService exists (webhook + SSE) but no API routes and no UI to configure it.

### Design

**New server route:** `apps/server/src/routes/notifications.ts`
- `GET /api/notifications/config` — return current webhook URLs and SSE status
- `PUT /api/notifications/config` — update webhook URLs and SSE toggle
- `POST /api/notifications/test` — send test notification to verify config
- `GET /api/notifications/history` — recent notification log (new table: `notification_log`)

**New DB table:** `notification_log`
```sql
CREATE TABLE notification_log (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  title TEXT,
  message TEXT,
  channel TEXT NOT NULL, -- 'webhook' | 'sse'
  status TEXT NOT NULL,   -- 'sent' | 'failed'
  error TEXT,
  created_at TEXT NOT NULL
);
```

**New page:** `apps/dashboard/src/pages/NotificationSettings.tsx`
- Webhook URL list (add/remove multiple URLs)
- SSE enable/disable toggle
- "Send Test" button
- Recent notification log table (last 50)

**API additions in `api.ts`:**
```typescript
notifications: {
  getConfig(): Promise<NotificationConfig>,
  updateConfig(data: NotificationConfig): Promise<void>,
  test(): Promise<{ success: boolean; error?: string }>,
  getHistory(): Promise<NotificationLogEntry[]>,
}
```

**Route in App.tsx:** `/settings/notifications` or add tab to existing Settings page

**Tests:** 10+ tests for API routes + 8+ for UI component.

---

## Feature 3: Report Template Management UI

### Problem
5 report-template API endpoints exist but dashboard only has a generic Templates page.

### Design

**New page:** `apps/dashboard/src/pages/ReportTemplates.tsx`
- Card grid showing all report templates
- Each card: name, description, is_default badge, preview button, edit, delete
- "New Template" button opens create dialog

**New component:** `apps/dashboard/src/components/ReportTemplateEditor.tsx`
- Dialog with: name, description, HTML template content (textarea with syntax highlighting hint)
- Preview button that renders template with sample data
- Save/Cancel actions

**API additions in `api.ts`:**
```typescript
reportTemplates: {
  list(): Promise<ReportTemplate[]>,
  get(id: string): Promise<ReportTemplate>,
  create(data: CreateReportTemplateRequest): Promise<ReportTemplate>,
  update(id: string, data: Partial<ReportTemplate>): Promise<ReportTemplate>,
  delete(id: string): Promise<void>,
}
```

**Route in App.tsx:** `/report-templates` → ReportTemplates (or add to Settings)

**Tests:** 10+ tests covering list, create, edit, delete, default badge, preview.

---

## Feature 4: Enhanced Task Comparison

### Problem
CompareView only shows structured lists (newFailures, fixedIssues, planChanges). No step-by-step diff visualization.

### Design

**Enhanced page:** `apps/dashboard/src/pages/CompareView.tsx`

**New sections:**
1. **Step Timeline Diff** — side-by-side step timelines for both tasks
   - Left: Task A steps, Right: Task B steps
   - Color-coded: green (matching), red (different), gray (missing in other)
   - Each step shows: phase, action name, observation summary

2. **Status Summary Card** — visual comparison of:
   - Status badges side by side
   - Step count comparison with delta
   - Duration comparison
   - Success rate comparison

3. **Action Frequency Chart** — bar chart comparing action types used in each task (using recharts)

**New server endpoint:** `POST /api/tasks/compare/detailed` — returns full step-by-step comparison data:
```typescript
{
  taskA: { task: Task, steps: Step[] },
  taskB: { task: Task, steps: Step[] },
  stepDiff: Array<{
    index: number,
    taskA?: Step,
    taskB?: Step,
    status: 'same' | 'different' | 'only-a' | 'only-b'
  }>,
  actionFrequency: { taskA: Record<string, number>, taskB: Record<string, number> }
}
```

**Tests:** 12+ tests for detailed comparison API + 10+ for enhanced CompareView.

---

## Feature 5: PDF Export

### Problem
Only JSON/CSV/HTML export. No PDF format and no PDF generation library.

### Design

**Dependency:** `puppeteer` (for HTML→PDF conversion, reuses existing HTML export)

**Server changes in `apps/server/src/routes/exports.ts`:**
- Add `'pdf'` to `ExportFormatEnum`
- Add PDF generation logic in exportService:
  1. Generate HTML using existing HTML export
  2. Convert HTML to PDF via puppeteer
  3. Return PDF buffer with `application/pdf` content type

**New method in `apps/server/src/services/exportService.ts`:**
```typescript
exportToPdf(taskId: string): Promise<{ content: Buffer; contentType: string; fileExtension: string }>
```

**Dashboard changes:**
- Add PDF option to export dropdown in TaskDetail.tsx
- Add PDF to batch export toolbar in TaskList.tsx
- Update `getExportUrl()` to support 'pdf' format

**Tests:** 5+ tests for PDF export endpoint (valid PDF header, correct content-type, task data included).

---

## Implementation Order

```
Wave 1 (backend + simple UI):
  ├── Feature 3: Report Template UI (backend exists, just need frontend)
  └── Feature 1: Schedule Management UI (backend exists, just need frontend)

Wave 2 (new backend + UI):
  ├── Feature 2: Notification Settings (new backend routes + frontend)
  └── Feature 4: Enhanced Comparison (new endpoint + enhanced UI)

Wave 3 (dependency + integration):
  └── Feature 5: PDF Export (new dep + route + format integration)
```

---

## File Map

### New Files
| File | Feature |
|------|---------|
| `apps/dashboard/src/pages/ScheduleList.tsx` | 1 |
| `apps/dashboard/src/components/CreateScheduleForm.tsx` | 1 |
| `apps/dashboard/src/components/ScheduleHistory.tsx` | 1 |
| `apps/dashboard/src/pages/NotificationSettings.tsx` | 2 |
| `apps/server/src/routes/notifications.ts` | 2 |
| `apps/dashboard/src/pages/ReportTemplates.tsx` | 3 |
| `apps/dashboard/src/components/ReportTemplateEditor.tsx` | 3 |
| `apps/server/src/routes/notifications.ts` | 2 |

### Modified Files
| File | Feature |
|------|---------|
| `apps/dashboard/src/lib/api.ts` | 1,2,3,4,5 |
| `apps/dashboard/src/App.tsx` | 1,2,3 |
| `apps/dashboard/src/components/Layout.tsx` | 1,2,3 (nav links) |
| `apps/dashboard/src/pages/CompareView.tsx` | 4 |
| `apps/dashboard/src/pages/TaskDetail.tsx` | 5 |
| `apps/dashboard/src/pages/TaskList.tsx` | 5 |
| `apps/server/src/routes/exports.ts` | 5 |
| `apps/server/src/services/exportService.ts` | 5 |
| `apps/server/src/server.ts` | 2 (register notification routes) |
