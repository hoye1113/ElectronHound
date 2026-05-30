/**
 * Export Feature Tests
 *
 * Tests for the export service and API endpoints covering
 * JSON, CSV, and HTML export formats for tasks, reports, and batches.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-export-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

/** Stable UUIDs for test data so tests can reference them in URL paths. */
const TEST_TASK_ID = 'a0000000-0000-4000-a000-000000000001';
const TEST_STEP_1_ID = 'b0000000-0000-4000-b000-000000000001';
const TEST_STEP_2_ID = 'b0000000-0000-4000-b000-000000000002';

/** Reset DB between tests (shared server optimization). */
function resetDb(db: Database.Database) {
  db.prepare('DELETE FROM logs').run();
  db.prepare('DELETE FROM steps').run();
  db.prepare('DELETE FROM tasks').run();
  db.prepare('DELETE FROM batches').run();
  db.prepare('DELETE FROM report_templates WHERE id != \'00000000-0000-0000-0000-000000000001\'').run();
}

/** Insert a test task with optional steps and batch. */
function seedTestData(db: Database.Database, opts?: { batchId?: string }) {
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, result_summary, created_at, updated_at, batch_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    TEST_TASK_ID,
    'Click the submit button',
    '/path/to/app.exe',
    'gpt-4o',
    'completed',
    50,
    2,
    JSON.stringify({ success: true, summary: 'Task completed successfully' }),
    now,
    now,
    opts?.batchId ?? null,
  );

  db.prepare(
    `INSERT INTO steps (id, task_id, step_index, phase, status, observation, action, result, reasoning, timestamp, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    TEST_STEP_1_ID,
    TEST_TASK_ID,
    0,
    'observe',
    'success',
    'Found button element',
    JSON.stringify({ name: 'click', args: { selector: '#submit' } }),
    null,
    'Button is visible and enabled',
    now,
    150,
  );

  db.prepare(
    `INSERT INTO steps (id, task_id, step_index, phase, status, observation, action, result, reasoning, timestamp, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    TEST_STEP_2_ID,
    TEST_TASK_ID,
    1,
    'execute',
    'success',
    'Clicked submit button',
    JSON.stringify({ name: 'click', args: { selector: '#submit' } }),
    JSON.stringify({ success: true }),
    'Action completed',
    now,
    300,
  );

  // Add a log entry
  db.prepare(
    `INSERT INTO logs (task_id, level, message, metadata, timestamp)
     VALUES (?, ?, ?, ?, ?)`
  ).run(TEST_TASK_ID, 'info', 'Task started', null, now);
}

// ── Export Service Unit Tests ────────────────────────────────────────

describe('Export Service: JSON export', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => { resetDb(db); seedTestData(db); });

  it('exports task as valid JSON with all fields', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/json`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain(`task-${TEST_TASK_ID}.json`);

    const body = JSON.parse(res.body);
    expect(body.task).toBeDefined();
    expect(body.task.id).toBe(TEST_TASK_ID);
    expect(body.task.goal).toBe('Click the submit button');
    expect(body.task.status).toBe('completed');
    expect(body.steps).toHaveLength(2);
    expect(body.steps[0].phase).toBe('observe');
    expect(body.steps[1].phase).toBe('execute');
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0].level).toBe('info');
  });

  it('returns pretty-printed JSON', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/json`,
    });

    // Pretty-printed JSON should contain indentation
    expect(res.body).toContain('\n');
    expect(res.body).toContain('  ');
  });
});

describe('Export Service: CSV export', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => { resetDb(db); seedTestData(db); });

  it('exports task as CSV with correct headers', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/csv`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('.csv');

    const lines = res.body.split('\n');
    expect(lines[0]).toBe('task_id,task_status,step_id,step_name,step_status,step_duration,error_message');
  });

  it('has one row per step', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/csv`,
    });

    const lines = res.body.split('\n').filter((line: string) => line.trim());
    // Header + 2 steps
    expect(lines).toHaveLength(3);
  });

  it('contains correct step data in CSV rows', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/csv`,
    });

    const lines = res.body.split('\n');
    const row1 = lines[1].split(',');
    expect(row1[0]).toBe(TEST_TASK_ID);
    expect(row1[1]).toBe('completed');
    expect(row1[2]).toBe(TEST_STEP_1_ID);
    expect(row1[3]).toBe('observe');
    expect(row1[4]).toBe('success');
    expect(row1[5]).toBe('150');
  });

  it('handles CSV escaping for fields with commas', async () => {
    // Insert a task with a comma in the error message (which is a CSV column)
    const csvTaskId = 'c0000000-0000-4000-c000-000000000001';
    const csvStepId = 'd0000000-0000-4000-d000-000000000001';
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, result_summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      csvTaskId,
      'Test goal',
      '/app.exe',
      'gpt-4o',
      'failed',
      50,
      1,
      JSON.stringify({ success: false, summary: 'Failed', error: 'Timeout, element not found' }),
      now,
      now,
    );

    db.prepare(
      `INSERT INTO steps (id, task_id, step_index, phase, status, observation, result, timestamp, duration)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(csvStepId, csvTaskId, 0, 'observe', 'retry', 'Tried finding element', null, now, 100);

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${csvTaskId}/export/csv`,
    });

    expect(res.statusCode).toBe(200);
    // The error_message field with a comma should be quoted
    expect(res.body).toContain('"Timeout, element not found"');
  });
});

describe('Export Service: HTML export', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => { resetDb(db); seedTestData(db); });

  it('exports task as self-contained HTML', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/html`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-disposition']).toContain('.html');

    // Self-contained: has DOCTYPE, embedded style, viewport meta
    expect(res.body).toContain('<!DOCTYPE html>');
    expect(res.body).toContain('<style>');
    expect(res.body).toContain('viewport');
  });

  it('contains summary metrics', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/html`,
    });

    // Summary section should show step counts
    expect(res.body).toContain('Total Steps');
    expect(res.body).toContain('Passed');
    expect(res.body).toContain('Duration');
  });

  it('contains steps table', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/html`,
    });

    expect(res.body).toContain('<table>');
    expect(res.body).toContain('observe');
    expect(res.body).toContain('execute');
    expect(res.body).toContain('Found button element');
  });

  it('is mobile-responsive', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/html`,
    });

    // Contains media query for mobile
    expect(res.body).toContain('@media (max-width: 640px)');
  });
});

// ── PDF export tests ────────────────────────────────────────────────

describe('Export Service: PDF export', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => { resetDb(db); seedTestData(db); });

  it('exports task as PDF', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/pdf`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('.pdf');

    // PDF content is base64-encoded, decode and check for PDF header
    const buffer = Buffer.from(res.body, 'base64');
    // PDF files start with %PDF
    expect(buffer.slice(0, 5).toString()).toContain('%PDF');
  });

  it('returns 404 for non-existent task', async () => {
    const fakeId = 'f0000000-0000-4000-a000-000000000001';
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${fakeId}/export/pdf`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for invalid task ID format', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/not-a-uuid/export/pdf',
    });

    expect(res.statusCode).toBe(400);
  });
});

// ── Error handling tests ─────────────────────────────────────────────

describe('Export API: Error handling', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => resetDb(db));

  it('returns 404 for non-existent task', async () => {
    const fakeUuid = 'e0000000-0000-4000-e000-000000000001';
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${fakeUuid}/export/json`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task not found');
  });

  it('returns 400 for invalid format', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/xml`,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid parameters');
  });

  it('returns 404 for non-existent batch', async () => {
    const fakeBatchUuid = 'f0000000-0000-4000-f000-000000000001';
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${fakeBatchUuid}/export/json`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Batch not found');
  });
});

// ── Batch export tests ──────────────────────────────────────────────

describe('Export API: Batch export', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;
  const BATCH_ID = 'a1000000-0000-4000-a100-000000000001';

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => {
    resetDb(db);
    // Insert batch record first (tasks reference batch via FK)
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(BATCH_ID, 'Test Batch', 'completed', 1, 1, 0, 'medium', now, now);
    seedTestData(db, { batchId: BATCH_ID });
  });

  it('exports batch as JSON with all tasks', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${BATCH_ID}/export/json`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.batch).toBeDefined();
    expect(body.batch.id).toBe(BATCH_ID);
    expect(body.batch.name).toBe('Test Batch');
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].task.id).toBe(TEST_TASK_ID);
    expect(body.tasks[0].steps).toHaveLength(2);
  });

  it('exports batch as CSV with all task steps', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${BATCH_ID}/export/csv`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');

    const lines = res.body.split('\n').filter((line: string) => line.trim());
    // Header + 2 steps
    expect(lines).toHaveLength(3);
  });

  it('exports batch as HTML with summary', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${BATCH_ID}/export/html`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Test Batch');
    expect(res.body).toContain('Total Tasks');
    expect(res.body).toContain('Completed');
    expect(res.body).toContain('<table>');
  });

  it('exports batch as PDF', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${BATCH_ID}/export/pdf`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('.pdf');

    // PDF content is base64-encoded, decode and check for PDF header
    const buffer = Buffer.from(res.body, 'base64');
    expect(buffer.slice(0, 5).toString()).toContain('%PDF');
  });
});

// ── POST /tasks/batch-export tests ──────────────────────────────────

describe('Export API: POST /tasks/batch-export', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;
  const TASK_2_ID = 'a0000000-0000-4000-a000-000000000002';

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => {
    resetDb(db);
    // Seed two tasks
    seedTestData(db);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(TASK_2_ID, 'Second task', '/app.exe', 'gpt-4o', 'completed', 50, 1, now, now);
    db.prepare(
      `INSERT INTO steps (id, task_id, step_index, phase, status, observation, action, timestamp, duration)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('b0000000-0000-4000-b000-000000000003', TASK_2_ID, 0, 'observe', 'success', 'Step one', null, now, 100);
  });

  it('exports multiple tasks as combined JSON array', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch-export',
      payload: { taskIds: [TEST_TASK_ID, TASK_2_ID], format: 'json' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('batch-export.json');

    const body = JSON.parse(res.body);
    expect(body).toHaveLength(2);
    expect(body[0].task.id).toBe(TEST_TASK_ID);
    expect(body[1].task.id).toBe(TASK_2_ID);
  });

  it('exports multiple tasks as combined CSV', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch-export',
      payload: { taskIds: [TEST_TASK_ID, TASK_2_ID], format: 'csv' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');

    const lines = res.body.split('\n').filter((line: string) => line.trim());
    // Header + 2 steps from task 1 + 1 step from task 2
    expect(lines).toHaveLength(4);
  });

  it('exports multiple tasks as combined HTML', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch-export',
      payload: { taskIds: [TEST_TASK_ID, TASK_2_ID], format: 'html' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<!DOCTYPE html>');
    expect(res.body).toContain('<hr/>');
  });

  it('returns 404 when no valid tasks found', async () => {
    const fakeId = 'e0000000-0000-4000-e000-000000000099';
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch-export',
      payload: { taskIds: [fakeId], format: 'json' },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('No valid tasks');
  });

  it('returns 400 for empty taskIds array', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch-export',
      payload: { taskIds: [], format: 'json' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid format', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch-export',
      payload: { taskIds: [TEST_TASK_ID], format: 'xml' },
    });

    expect(res.statusCode).toBe(400);
  });
});
