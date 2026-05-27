# Direction A: 功能完善 (Feature Enhancement) Specification

**Version:** 1.0
**Date:** 2026-05-28
**Status:** In Progress

---

## Overview

Direction A focuses on completing core functionality gaps in ElectronHound. These features enhance the product's usability and make it a more complete testing tool.

**Priority Order:**
1. 批量测试 (Batch Testing)
2. 测试模板 (Test Templates)
3. 结果导出 (Result Export)
4. 报告格式定制 (Report Format Customization)

---

## Feature 1: 批量测试 (Batch Testing)

### Description
Allow users to submit multiple test tasks as a batch, with coordinated execution, progress tracking, and consolidated results.

### Requirements

#### API Endpoints

**POST /api/tasks/batch**
- Accept array of task definitions
- Return batch ID and individual task IDs
- Support priority setting for entire batch

**GET /api/tasks/batch/:batchId**
- Return batch status and progress
- Include individual task statuses
- Provide ETA based on completed tasks

**POST /api/tasks/batch/:batchId/cancel**
- Cancel all pending tasks in batch
- Running tasks continue to completion

#### Database Schema

```sql
CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  total_tasks INTEGER NOT NULL,
  completed_tasks INTEGER DEFAULT 0,
  failed_tasks INTEGER DEFAULT 0,
  priority TEXT DEFAULT 'medium',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE tasks ADD COLUMN batch_id TEXT REFERENCES batches(id);
```

#### Dashboard UI

- Batch submission form with file upload for task list
- Batch progress card on dashboard
- Batch detail view with individual task statuses
- Batch cancellation button

#### WorkerPool Integration

- Batch tasks queued with same priority
- Batch tasks respect existing concurrency limits (max 3)
- Progress updates via SSE with batch context

### Acceptance Criteria

- [ ] Can submit 5+ tasks as a single batch
- [ ] Batch progress updates in real-time via SSE
- [ ] Can cancel pending tasks in a batch
- [ ] Batch status correctly aggregates task statuses
- [ ] Dashboard shows batch progress with task breakdown

---

## Feature 2: 测试模板 (Test Templates)

### Description
Pre-configured test scenarios for common Electron app patterns. Users can select templates instead of writing test goals from scratch.

### Requirements

#### Template Categories

1. **Login Flow** - Authentication form testing
2. **CRUD Operations** - Create, read, update, delete patterns
3. **Form Validation** - Input validation and error handling
4. **Navigation** - Menu and routing testing
5. **File Operations** - Open, save, export dialogs
6. **Settings** - Configuration page testing
7. **Custom** - User-defined templates

#### API Endpoints

**GET /api/templates**
- List all available templates
- Support filtering by category

**GET /api/templates/:id**
- Get template details including goal and config

**POST /api/templates**
- Create custom template (user-defined)

**PUT /api/templates/:id**
- Update custom template

**DELETE /api/templates/:id**
- Delete custom template (not built-in)

#### Template Schema

```typescript
interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  category: 'login' | 'crud' | 'form' | 'navigation' | 'file' | 'settings' | 'custom';
  goal: string;
  config: {
    maxSteps?: number;
    timeout?: number;
    screenshotOnStep?: boolean;
    assertions?: string[];
  };
  variables: TemplateVariable[];
  builtIn: boolean;
}

interface TemplateVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'url';
  required: boolean;
  default?: string;
}
```

#### Database Schema

```sql
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  goal TEXT NOT NULL,
  config TEXT, -- JSON
  variables TEXT, -- JSON array
  built_in INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Dashboard UI

- Template gallery with category filters
- Template preview with variable inputs
- "Use Template" button that pre-fills task creation form
- Custom template management page

### Built-in Templates

| Template | Goal | Variables |
|----------|------|-----------|
| Login Flow | Test login form with valid and invalid credentials | `formSelector`, `submitButton`, `validUser`, `validPass` |
| CRUD Test | Test create, read, update, delete operations | `listSelector`, `createButton`, `editButton`, `deleteButton` |
| Form Validation | Verify form validation messages appear | `formSelector`, `invalidInput`, `errorMessage` |
| Navigation Test | Test all menu items and routes | `menuSelector`, `expectedRoutes` |
| File Dialog | Test file open/save dialogs | `action`, `expectedDialog` |
| Settings Page | Test settings form persistence | `settingsSelector`, `testValues` |

### Acceptance Criteria

- [ ] 6 built-in templates available
- [ ] Can create custom templates
- [ ] Template variables are validated
- [ ] Template selection pre-fills task form
- [ ] Templates stored in database

---

## Feature 3: 结果导出 (Result Export)

### Description
Export test results and reports in multiple formats (JSON, CSV, HTML) for external analysis and record-keeping.

### Requirements

#### Export Formats

**JSON Export**
- Full task data including steps, logs, screenshots
- Structured format for programmatic consumption
- Compatible with existing report schema

**CSV Export**
- Tabular format for spreadsheet analysis
- One row per step with flattened data
- Include task metadata as header columns

**HTML Export**
- Self-contained HTML report
- Embedded CSS for offline viewing
- Include inline screenshots (base64)

#### API Endpoints

**GET /api/tasks/:taskId/export/:format**
- format: `json`, `csv`, `html`
- Return file with appropriate Content-Type and Content-Disposition

**GET /api/reports/:reportId/export/:format**
- Export existing report in requested format

**POST /api/tasks/batch/:batchId/export/:format**
- Export all tasks in batch as single file
- JSON: array of tasks
- CSV: combined with batch metadata
- HTML: consolidated report

#### Export Service

```typescript
interface ExportService {
  exportTask(taskId: string, format: ExportFormat): Promise<Buffer>;
  exportReport(reportId: string, format: ExportFormat): Promise<Buffer>;
  exportBatch(batchId: string, format: ExportFormat): Promise<Buffer>;
}

type ExportFormat = 'json' | 'csv' | 'html';
```

#### Dashboard UI

- Export button on task detail page
- Export dropdown on report page
- Batch export on batch detail page
- Download progress indicator

### Acceptance Criteria

- [ ] JSON export includes all task data
- [ ] CSV export opens correctly in Excel/Sheets
- [ ] HTML export is self-contained and readable offline
- [ ] Export button visible on task and report pages
- [ ] Batch export combines all tasks

---

## Feature 4: 报告格式定制 (Report Format Customization)

### Description
Allow users to customize report structure, sections, and styling to match their needs.

### Requirements

#### Report Sections

Users can toggle and reorder these sections:
- **Summary** - Overview with key metrics
- **Steps** - Detailed step-by-step execution
- **Screenshots** - Visual evidence gallery
- **Errors** - Error details and stack traces
- **Performance** - Timing and resource metrics
- **Suggestions** - AI-generated recommendations
- **Raw Data** - JSON view of underlying data

#### API Endpoints

**GET /api/report-templates**
- List saved report templates

**POST /api/report-templates**
- Create new report template

**PUT /api/report-templates/:id**
- Update report template

**DELETE /api/report-templates/:id**
- Delete report template

**POST /api/reports/:reportId/generate**
- Generate report with specified template
- Accept template ID or inline config

#### Report Template Schema

```typescript
interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  sections: ReportSection[];
  styling: ReportStyling;
  isDefault: boolean;
}

interface ReportSection {
  id: string;
  type: 'summary' | 'steps' | 'screenshots' | 'errors' | 'performance' | 'suggestions' | 'raw';
  title: string;
  enabled: boolean;
  order: number;
  config?: Record<string, unknown>;
}

interface ReportStyling {
  theme: 'light' | 'dark' | 'auto';
  primaryColor: string;
  logoUrl?: string;
  companyName?: string;
  footerText?: string;
}
```

#### Database Schema

```sql
CREATE TABLE report_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sections TEXT NOT NULL, -- JSON
  styling TEXT NOT NULL, -- JSON
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Dashboard UI

- Report template editor with drag-and-drop section ordering
- Live preview of report layout
- Theme and color customization
- Default template management

### Acceptance Criteria

- [ ] Can toggle report sections on/off
- [ ] Can reorder sections via drag-and-drop
- [ ] Can customize colors and theme
- [ ] Custom templates saved to database
- [ ] Report generation uses selected template

---

## Implementation Plan

### Phase 1: Batch Testing (Days 1-3)
1. Add batches table migration
2. Implement batch API endpoints
3. Update WorkerPool for batch awareness
4. Add batch SSE events
5. Build batch UI components

### Phase 2: Test Templates (Days 4-6)
1. Add templates table migration
2. Seed built-in templates
3. Implement template API endpoints
4. Build template gallery UI
5. Integrate with task creation form

### Phase 3: Result Export (Days 7-9)
1. Create export service
2. Implement JSON export
3. Implement CSV export
4. Implement HTML export with styling
5. Add export buttons to dashboard

### Phase 4: Report Customization (Days 10-12)
1. Add report_templates table migration
2. Implement template CRUD API
3. Build template editor UI
4. Update report generation with templates
5. Add live preview

---

## Technical Notes

### Backward Compatibility
- All new endpoints follow existing `/api` prefix pattern
- Database migrations use additive changes only
- Existing task workflow unchanged

### Performance
- Batch operations use transactions
- Export service streams large datasets
- Template caching for built-in templates

### Testing
- Unit tests for all new services
- API integration tests for all endpoints
- E2E tests for critical user flows
