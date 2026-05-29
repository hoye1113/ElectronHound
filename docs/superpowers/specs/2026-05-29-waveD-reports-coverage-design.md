# Wave D: reports.ts Coverage Improvement

## Goal

Improve `apps/server/src/routes/reports.ts` coverage from 67.32% to ~90%.

## Current State

| Metric | Value |
|--------|-------|
| File lines | 122 |
| Current coverage | 67.32% stmts |
| Test file | `reports-uuid.test.ts` (UUID validation only) |
| 3 routes | GET report manifest, GET HTML report, GET screenshot |

## Untested Code Paths

### Route 1: GET /tasks/:id/report
| Path | Status |
|------|--------|
| `validatePath` error → 400 | untested |
| File read success → 200 + JSON | untested |
| ENOENT → 404 | untested |

### Route 2: GET /tasks/:id/report/html
| Path | Status |
|------|--------|
| Task not found → 404 | untested |
| Success → 200 + HTML + headers | untested |

### Route 3: GET /tasks/:id/steps/:stepIndex/screenshot
| Path | Status |
|------|--------|
| Step index > 1000 → 400 | untested |
| Step not found → 404 | untested |
| Success → 200 + PNG + Cache-Control | untested |
| ENOENT → 404 | untested |

## Approach: Extend reports-uuid.test.ts with Real DB + Mock fs

**Why this approach:**
- Follows project pattern: real SQLite via temp DB
- `reports-uuid.test.ts` already has the server setup
- Mock `fs.readFile` to control file system responses
- Seed test data via `db.prepare().run()`

**Alternatives considered:**
- New independent `reports.test.ts` — rejected: duplicates server setup
- Use `vi.mock('fs')` globally — accepted: needed for file read control

## Detailed Test Plan

### Seed Data

```ts
function seedReportData(db: Database.Database) {
  const taskId = '550e8400-e29b-41d4-a716-446655440000';
  db.prepare(`INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(taskId, 'Test', '/app', 'gpt-4o', 'completed', 50, 2, '2026-01-01', '2026-01-01');
  db.prepare(`INSERT INTO steps (id, task_id, step_index, phase, status, timestamp, duration)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run('step-0', taskId, 0, 'observe', 'success', '2026-01-01', 100);
  db.prepare(`INSERT INTO steps (id, task_id, step_index, phase, status, timestamp, duration, screenshot_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('step-1', taskId, 1, 'execute', 'success', '2026-01-01', 200, '/screenshots/step1.png');
}
```

### Mock fs.readFile

```ts
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readFile: vi.fn(),
  };
});
```

### Route 1 Tests: GET /tasks/:id/report

```ts
it('returns 200 with JSON manifest when file exists', async () => {
  const manifest = { task: { id: taskId }, steps: [] };
  vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(manifest));
  const res = await server.inject({ method: 'GET', url: `/api/tasks/${taskId}/report` });
  expect(res.statusCode).toBe(200);
  expect(JSON.parse(res.body)).toEqual(manifest);
});

it('returns 404 when report file not found (ENOENT)', async () => {
  const err = new Error('ENOENT') as NodeJS.ErrnoException;
  err.code = 'ENOENT';
  vi.mocked(fs.readFile).mockRejectedValueOnce(err);
  const res = await server.inject({ method: 'GET', url: `/api/tasks/${taskId}/report` });
  expect(res.statusCode).toBe(404);
});
```

### Route 2 Tests: GET /tasks/:id/report/html

```ts
it('returns 404 when task not in database', async () => {
  const res = await server.inject({ method: 'GET', url: '/api/tasks/00000000-0000-0000-0000-000000000999/report/html' });
  expect(res.statusCode).toBe(404);
});

it('returns 200 with HTML report and correct headers', async () => {
  const res = await server.inject({ method: 'GET', url: `/api/tasks/${taskId}/report/html` });
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toContain('text/html');
  expect(res.headers['content-disposition']).toContain('attachment');
  expect(res.payload).toContain('<!DOCTYPE html>');
});
```

### Route 3 Tests: GET /tasks/:id/steps/:stepIndex/screenshot

```ts
it('returns 400 for step index > 1000', async () => {
  const res = await server.inject({ method: 'GET', url: `/api/tasks/${taskId}/steps/1001/screenshot` });
  expect(res.statusCode).toBe(400);
});

it('returns 404 when step not found', async () => {
  const res = await server.inject({ method: 'GET', url: `/api/tasks/${taskId}/steps/999/screenshot` });
  expect(res.statusCode).toBe(404);
});

it('returns 200 with PNG and Cache-Control header', async () => {
  vi.mocked(fs.readFile).mockResolvedValueOnce(Buffer.from('PNG_DATA'));
  const res = await server.inject({ method: 'GET', url: `/api/tasks/${taskId}/steps/1/screenshot` });
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toContain('image/png');
  expect(res.headers['cache-control']).toBeDefined();
});

it('returns 404 when screenshot file ENOENT', async () => {
  const err = new Error('ENOENT') as NodeJS.ErrnoException;
  err.code = 'ENOENT';
  vi.mocked(fs.readFile).mockRejectedValueOnce(err);
  const res = await server.inject({ method: 'GET', url: `/api/tasks/${taskId}/steps/1/screenshot` });
  expect(res.statusCode).toBe(404);
});
```

## Expected Coverage

| After | Stmts | Branches |
|-------|-------|----------|
| reports.ts | ~90% | ~85% |
| Overall project | +0.5% | |

## Verification

- `npx vitest run apps/server/src/__tests__/reports-uuid.test.ts` — all tests pass
- `npx vitest run --coverage` — reports.ts ≥ 85%
