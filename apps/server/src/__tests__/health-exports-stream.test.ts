/**
 * Health, Export, and Stream Route Tests
 *
 * Comprehensive tests for:
 * - GET /health — health check with DB and worker pool status
 * - GET /api/tasks/:taskId/export/:format — task export (JSON, CSV, HTML)
 * - GET /api/reports/:reportId/export/:format — report export
 * - GET /api/tasks/batch/:batchId/export/:format — batch export
 * - GET /api/stream/tasks/:id — SSE streaming endpoint
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { SSEHub } from '../streams/sseHub.js';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-hes-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

/** Stable UUIDs for test data. */
const TEST_TASK_ID = 'aa000000-0000-4000-a000-000000000001';
const TEST_STEP_1_ID = 'bb000000-0000-4000-b000-000000000001';
const TEST_STEP_2_ID = 'bb000000-0000-4000-b000-000000000002';
const BATCH_ID = 'cc000000-0000-4000-c000-000000000001';

/** Insert a test task with steps, logs, and optionally a batch. */
function seedTestData(db: Database.Database, opts?: { batchId?: string }) {
  const now = new Date().toISOString();

  // Insert batch if needed (must come before task due to FK)
  if (opts?.batchId) {
    db.prepare(
      `INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(opts.batchId, 'Test Batch', 'completed', 1, 1, 0, 'medium', now, now);
  }

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

  // Add log entries
  db.prepare(
    `INSERT INTO logs (task_id, level, message, metadata, timestamp)
     VALUES (?, ?, ?, ?, ?)`
  ).run(TEST_TASK_ID, 'info', 'Task started', null, now);

  db.prepare(
    `INSERT INTO logs (task_id, level, message, metadata, timestamp)
     VALUES (?, ?, ?, ?, ?)`
  ).run(TEST_TASK_ID, 'warn', 'Slow response detected', JSON.stringify({ latency: 5000 }), now);
}

// ─────────────────────────────────────────────────────────────
// Health Route Tests
// ─────────────────────────────────────────────────────────────

describe('Route: GET /health', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns 200 with ok status', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
  });

  it('includes a valid ISO timestamp', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);
    expect(body.timestamp).toBeDefined();
    // Should be a valid ISO 8601 date string
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('includes uptime as a number', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);
    expect(body.uptime).toBeDefined();
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('includes checks object', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);
    expect(body.checks).toBeDefined();
    expect(typeof body.checks).toBe('object');
  });

  it('reports database status as ok when DB is accessible', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);
    expect(body.checks.database).toBeDefined();
    expect(body.checks.database.status).toBe('ok');
  });

  it('reports worker pool status with running, queued, and maxWorkers fields', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);
    expect(body.checks.workerPool).toBeDefined();
    expect(body.checks.workerPool.status).toBe('ok');
    expect(typeof body.checks.workerPool.running).toBe('number');
    expect(typeof body.checks.workerPool.queued).toBe('number');
    expect(body.checks.workerPool.maxWorkers).toBe(3);
  });

  it('returns overall ok when all checks pass', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);
    // Both database and workerPool should be ok
    expect(body.checks.database.status).toBe('ok');
    expect(body.checks.workerPool.status).toBe('ok');
    expect(body.status).toBe('ok');
  });

  it('returns JSON content type', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('health endpoint does not require authentication', async () => {
    // Even if API key is configured, /health should be accessible without it
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('ok');
  });
});

// ─────────────────────────────────────────────────────────────
// Export: Task JSON Export
// ─────────────────────────────────────────────────────────────

describe('Export: Task JSON', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
    seedTestData(db);
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns task data with steps and logs', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/json`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.task.id).toBe(TEST_TASK_ID);
    expect(body.steps).toHaveLength(2);
    expect(body.logs).toHaveLength(2);
  });

  it('sets correct content type and disposition headers', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/json`,
    });

    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain(`task-${TEST_TASK_ID}.json`);
  });

  it('includes step details in order', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/json`,
    });

    const body = JSON.parse(res.body);
    expect(body.steps[0].stepIndex).toBe(0);
    expect(body.steps[0].phase).toBe('observe');
    expect(body.steps[1].stepIndex).toBe(1);
    expect(body.steps[1].phase).toBe('execute');
  });

  it('includes log entries with metadata', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/json`,
    });

    const body = JSON.parse(res.body);
    const warnLog = body.logs.find((l: { level: string }) => l.level === 'warn');
    expect(warnLog).toBeDefined();
    expect(warnLog.metadata).toEqual({ latency: 5000 });
  });

  it('returns pretty-printed JSON', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/json`,
    });

    expect(res.body).toContain('\n');
    expect(res.body).toContain('  ');
  });
});

// ─────────────────────────────────────────────────────────────
// Export: Task CSV Export
// ─────────────────────────────────────────────────────────────

describe('Export: Task CSV', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
    seedTestData(db);
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns CSV with correct content type', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/csv`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('.csv');
  });

  it('has correct CSV headers', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/csv`,
    });

    const lines = res.body.split('\n');
    expect(lines[0]).toBe('task_id,task_status,step_id,step_name,step_status,step_duration,error_message');
  });

  it('has one row per step plus header', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/csv`,
    });

    const lines = res.body.split('\n').filter((line: string) => line.trim());
    // Header + 2 steps
    expect(lines).toHaveLength(3);
  });

  it('contains correct task_id and status in each row', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/csv`,
    });

    const lines = res.body.split('\n');
    const row1 = lines[1].split(',');
    expect(row1[0]).toBe(TEST_TASK_ID);
    expect(row1[1]).toBe('completed');
    expect(row1[2]).toBe(TEST_STEP_1_ID);
  });
});

// ─────────────────────────────────────────────────────────────
// Export: Task HTML Export
// ─────────────────────────────────────────────────────────────

describe('Export: Task HTML', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
    seedTestData(db);
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns self-contained HTML document', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/html`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-disposition']).toContain('.html');
    expect(res.body).toContain('<!DOCTYPE html>');
    expect(res.body).toContain('<style>');
    expect(res.body).toContain('viewport');
  });

  it('includes the task goal in the title and header', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/html`,
    });

    expect(res.body).toContain('Click the submit button');
  });

  it('includes summary metrics section', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/html`,
    });

    expect(res.body).toContain('Total Steps');
    expect(res.body).toContain('Passed');
    expect(res.body).toContain('Duration');
  });

  it('includes steps table with step data', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/html`,
    });

    expect(res.body).toContain('<table>');
    expect(res.body).toContain('observe');
    expect(res.body).toContain('execute');
    expect(res.body).toContain('Found button element');
  });

  it('includes result summary section', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/html`,
    });

    expect(res.body).toContain('Result Summary');
    expect(res.body).toContain('Task completed successfully');
  });

  it('is mobile-responsive', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/html`,
    });

    expect(res.body).toContain('@media (max-width: 640px)');
  });

  it('includes footer with export timestamp and task ID', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export/html`,
    });

    expect(res.body).toContain('Exported at');
    expect(res.body).toContain(TEST_TASK_ID);
  });
});

// ─────────────────────────────────────────────────────────────
// Export: Report Export
// ─────────────────────────────────────────────────────────────

describe('Export: Report', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
    seedTestData(db);
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('exports report as JSON', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/reports/${TEST_TASK_ID}/export/json`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.task.id).toBe(TEST_TASK_ID);
    expect(body.steps).toHaveLength(2);
  });

  it('exports report as CSV', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/reports/${TEST_TASK_ID}/export/csv`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.body.split('\n').filter((line: string) => line.trim());
    expect(lines).toHaveLength(3); // header + 2 steps
  });

  it('exports report as HTML', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/reports/${TEST_TASK_ID}/export/html`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<!DOCTYPE html>');
    expect(res.body).toContain('Click the submit button');
  });

  it('sets report-specific content disposition filename', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/reports/${TEST_TASK_ID}/export/json`,
    });

    expect(res.headers['content-disposition']).toContain(`report-${TEST_TASK_ID}.json`);
  });

  it('returns 404 for non-existent report', async () => {
    const fakeId = 'ee000000-0000-4000-e000-000000000001';
    const res = await server.inject({
      method: 'GET',
      url: `/api/reports/${fakeId}/export/json`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Report not found');
  });

  it('returns 400 for invalid report format', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/reports/${TEST_TASK_ID}/export/xml`,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid parameters');
  });

  it('returns 400 for invalid report ID format', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/reports/not-a-uuid/export/json`,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid parameters');
  });
});

// ─────────────────────────────────────────────────────────────
// Export: Batch Export
// ─────────────────────────────────────────────────────────────

describe('Export: Batch', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
    seedTestData(db, { batchId: BATCH_ID });
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('exports batch as JSON with batch info and tasks', async () => {
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

  it('exports batch as CSV', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${BATCH_ID}/export/csv`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.body.split('\n').filter((line: string) => line.trim());
    expect(lines).toHaveLength(3); // header + 2 steps
  });

  it('exports batch as HTML with batch summary', async () => {
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

  it('sets batch-specific content disposition filename', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${BATCH_ID}/export/json`,
    });

    expect(res.headers['content-disposition']).toContain(`batch-${BATCH_ID}.json`);
  });

  it('returns 404 for non-existent batch', async () => {
    const fakeId = 'ff000000-0000-4000-f000-000000000001';
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${fakeId}/export/json`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Batch not found');
  });

  it('returns 400 for invalid batch format', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${BATCH_ID}/export/xml`,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid parameters');
  });

  it('returns 400 for invalid batch ID format', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/not-a-uuid/export/json`,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid parameters');
  });
});

// ─────────────────────────────────────────────────────────────
// Export: Edge Cases
// ─────────────────────────────────────────────────────────────

describe('Export: Edge cases', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('exports a task with no steps as JSON', async () => {
    const now = new Date().toISOString();
    const taskId = 'dd000000-0000-4000-d000-000000000001';
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(taskId, 'Minimal task', '/app.exe', 'gpt-4o', 'queued', 50, 0, now, now);

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/export/json`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.task.id).toBe(taskId);
    expect(body.steps).toHaveLength(0);
    expect(body.logs).toHaveLength(0);
  });

  it('exports a task with no steps as CSV (one data row with empty step fields)', async () => {
    const now = new Date().toISOString();
    const taskId = 'dd000000-0000-4000-d000-000000000002';
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(taskId, 'No steps task', '/app.exe', 'gpt-4o', 'queued', 50, 0, now, now);

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/export/csv`,
    });

    expect(res.statusCode).toBe(200);
    const lines = res.body.split('\n').filter((line: string) => line.trim());
    // Header + 1 data row (task with no steps)
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(taskId);
  });

  it('exports a task with no steps as HTML', async () => {
    const now = new Date().toISOString();
    const taskId = 'dd000000-0000-4000-d000-000000000003';
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(taskId, 'Empty steps HTML', '/app.exe', 'gpt-4o', 'queued', 50, 0, now, now);

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/export/html`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('No steps recorded');
    expect(res.body).toContain('0'); // Total Steps = 0
  });

  it('returns 404 for non-existent task in task export', async () => {
    const fakeId = 'ee000000-0000-4000-e000-000000000099';
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${fakeId}/export/json`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task not found');
  });

  it('returns 400 for invalid task ID format in export', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/not-a-uuid/export/json`,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid parameters');
    expect(body.details).toBeDefined();
  });

  it('returns 400 for unsupported export format', async () => {
    const taskId = 'dd000000-0000-4000-d000-000000000001';
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/export/pdf`,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid parameters');
  });

  it('handles CSV fields with special characters (commas, quotes, newlines)', async () => {
    const now = new Date().toISOString();
    const taskId = 'dd000000-0000-4000-d000-000000000004';
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, result_summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      taskId,
      'Special chars',
      '/app.exe',
      'gpt-4o',
      'failed',
      50,
      1,
      JSON.stringify({ success: false, summary: 'Failed', error: 'Timeout, "element" not found' }),
      now,
      now,
    );

    db.prepare(
      `INSERT INTO steps (id, task_id, step_index, phase, status, observation, result, timestamp, duration)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('dd100000-0000-4000-d000-000000000001', taskId, 0, 'observe', 'retry', 'Tried, failed', null, now, 100);

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/export/csv`,
    });

    expect(res.statusCode).toBe(200);
    // The error_message field with comma and quotes should be properly escaped
    expect(res.body).toContain('"Timeout, ""element"" not found"');
  });
});

// ─────────────────────────────────────────────────────────────
// Stream: SSE Endpoint
// ─────────────────────────────────────────────────────────────

describe('Route: GET /api/stream/tasks/:id', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('stream route is registered in the server route table', () => {
    // Verify the route exists by checking Fastify's registered routes
    const routes = server.printRoutes();
    // The tree format splits across lines: "stream/tasks/" then ":id"
    expect(routes).toContain('stream/tasks/');
  });

  it('other routes remain functional when stream route is registered', async () => {
    // Health endpoint should work
    const healthRes = await server.inject({ method: 'GET', url: '/health' });
    expect(healthRes.statusCode).toBe(200);
    expect(JSON.parse(healthRes.body).status).toBe('ok');

    // Tasks list endpoint should work
    const tasksRes = await server.inject({ method: 'GET', url: '/api/tasks' });
    expect(tasksRes.statusCode).toBe(200);

    // Export endpoint should work
    const exportRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/aa000000-0000-4000-a000-000000000001/export/json`,
    });
    // Either 200 (if task exists from other tests) or 404 (no task seeded here) — not 500
    expect([200, 404]).toContain(exportRes.statusCode);
  });
});

// ─────────────────────────────────────────────────────────────
// Stream: SSEHub Unit Tests
// ─────────────────────────────────────────────────────────────

describe('SSEHub: Connection management', () => {
  function createMockReply() {
    const written: string[] = [];
    const headers: Record<string, string> = {};
    const listeners: Record<string, (...args: unknown[]) => void> = {};
    const mockReply: Record<string, unknown> = {
      header: (key: string, value: string) => { headers[key] = value; return mockReply; },
      raw: {
        flushHeaders: vi.fn(),
        write: vi.fn((data: string) => { written.push(data); return true; }),
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => { listeners[event] = cb; }),
        destroy: vi.fn(),
      },
      _written: written,
      _headers: headers,
      _listeners: listeners,
    };
    return mockReply;
  }

  it('adds a client and returns true', () => {
    const hub = new SSEHub();
    const reply = createMockReply();
    const result = hub.addClient('task-1', reply);
    expect(result).toBe(true);
    expect(hub.getClientCount('task-1')).toBe(1);
  });

  it('sets SSE headers on the reply', () => {
    const hub = new SSEHub();
    const reply = createMockReply();
    hub.addClient('task-1', reply);

    expect(reply._headers['Content-Type']).toBe('text/event-stream');
    expect(reply._headers['Cache-Control']).toBe('no-cache');
    expect(reply._headers['Connection']).toBe('keep-alive');
  });

  it('flushes headers immediately', () => {
    const hub = new SSEHub();
    const reply = createMockReply();
    hub.addClient('task-1', reply);
    expect(reply.raw.flushHeaders).toHaveBeenCalledOnce();
  });

  it('registers a close listener for cleanup', () => {
    const hub = new SSEHub();
    const reply = createMockReply();
    hub.addClient('task-1', reply);
    expect(reply.raw.on).toHaveBeenCalledWith('close', expect.any(Function));
  });

  it('broadcasts events to clients of a specific task', () => {
    const hub = new SSEHub();
    const reply1 = createMockReply();
    const reply2 = createMockReply();

    hub.addClient('task-1', reply1);
    hub.addClient('task-1', reply2);

    hub.broadcast('task-1', {
      event: 'status',
      data: { type: 'connected', taskId: 'task-1' },
    });

    const expected = 'event: status\ndata: {"type":"connected","taskId":"task-1"}\n\n';
    expect(reply1.raw.write).toHaveBeenCalledWith(expected);
    expect(reply2.raw.write).toHaveBeenCalledWith(expected);
  });

  it('does not broadcast to clients of other tasks', () => {
    const hub = new SSEHub();
    const reply1 = createMockReply();
    const reply2 = createMockReply();

    hub.addClient('task-1', reply1);
    hub.addClient('task-2', reply2);

    hub.broadcast('task-1', {
      event: 'status',
      data: { type: 'connected', taskId: 'task-1' },
    });

    expect(reply1.raw.write).toHaveBeenCalled();
    expect(reply2.raw.write).not.toHaveBeenCalled();
  });

  it('broadcasts to all clients via broadcastAll', () => {
    const hub = new SSEHub();
    const reply1 = createMockReply();
    const reply2 = createMockReply();

    hub.addClient('task-1', reply1);
    hub.addClient('task-2', reply2);

    hub.broadcastAll({
      event: 'status',
      data: { type: 'shutdown' },
    });

    const expected = 'event: status\ndata: {"type":"shutdown"}\n\n';
    expect(reply1.raw.write).toHaveBeenCalledWith(expected);
    expect(reply2.raw.write).toHaveBeenCalledWith(expected);
  });

  it('removes client on close event', () => {
    const hub = new SSEHub();
    const reply = createMockReply();
    hub.addClient('task-1', reply);
    expect(hub.getClientCount('task-1')).toBe(1);

    // Simulate the close event
    reply._listeners['close']();
    expect(hub.getClientCount('task-1')).toBe(0);
  });

  it('cleans up task entry when last client disconnects', () => {
    const hub = new SSEHub();
    const reply = createMockReply();
    hub.addClient('task-1', reply);

    reply._listeners['close']();

    expect(hub.getClientCount('task-1')).toBe(0);
    expect(hub.getTotalClientCount()).toBe(0);
  });

  it('tracks total client count across tasks', () => {
    const hub = new SSEHub();
    const reply1 = createMockReply();
    const reply2 = createMockReply();
    const reply3 = createMockReply();

    hub.addClient('task-1', reply1);
    hub.addClient('task-1', reply2);
    hub.addClient('task-2', reply3);

    expect(hub.getTotalClientCount()).toBe(3);
    expect(hub.getClientCount('task-1')).toBe(2);
    expect(hub.getClientCount('task-2')).toBe(1);
  });

  it('returns false when max clients per task is reached', () => {
    const hub = new SSEHub({ maxClientsPerTask: 2 });

    const reply1 = createMockReply();
    const reply2 = createMockReply();
    const reply3 = createMockReply();

    expect(hub.addClient('task-1', reply1)).toBe(true);
    expect(hub.addClient('task-1', reply2)).toBe(true);
    expect(hub.addClient('task-1', reply3)).toBe(false);

    expect(hub.getClientCount('task-1')).toBe(2);
  });

  it('returns false when max total clients is reached', () => {
    const hub = new SSEHub({ maxTotalClients: 2 });

    const reply1 = createMockReply();
    const reply2 = createMockReply();
    const reply3 = createMockReply();

    expect(hub.addClient('task-1', reply1)).toBe(true);
    expect(hub.addClient('task-2', reply2)).toBe(true);
    expect(hub.addClient('task-3', reply3)).toBe(false);

    expect(hub.getTotalClientCount()).toBe(2);
  });

  it('formats SSE messages correctly', () => {
    const hub = new SSEHub();
    const reply = createMockReply();
    hub.addClient('task-1', reply);

    hub.broadcast('task-1', {
      event: 'step',
      data: { stepIndex: 0, phase: 'observe', status: 'success' },
    });

    expect(reply.raw.write).toHaveBeenCalledWith(
      'event: step\ndata: {"stepIndex":0,"phase":"observe","status":"success"}\n\n'
    );
  });

  it('handles multiple event types', () => {
    const hub = new SSEHub();
    const reply = createMockReply();
    hub.addClient('task-1', reply);

    const events = [
      { event: 'status' as const, data: { type: 'connected' } },
      { event: 'step' as const, data: { stepIndex: 0 } },
      { event: 'log' as const, data: { message: 'test' } },
      { event: 'complete' as const, data: { success: true } },
      { event: 'error' as const, data: { message: 'failed' } },
    ];

    for (const evt of events) {
      hub.broadcast('task-1', evt);
    }

    expect(reply.raw.write).toHaveBeenCalledTimes(5);
    expect(reply._written[0]).toContain('event: status');
    expect(reply._written[1]).toContain('event: step');
    expect(reply._written[2]).toContain('event: log');
    expect(reply._written[3]).toContain('event: complete');
    expect(reply._written[4]).toContain('event: error');
  });

  it('broadcast to non-existent task is a no-op', () => {
    const hub = new SSEHub();
    // Should not throw
    hub.broadcast('nonexistent', {
      event: 'status',
      data: { type: 'connected' },
    });
    expect(hub.getClientCount('nonexistent')).toBe(0);
  });

  it('broadcastAll with no clients is a no-op', () => {
    const hub = new SSEHub();
    // Should not throw
    hub.broadcastAll({
      event: 'status',
      data: { type: 'shutdown' },
    });
    expect(hub.getTotalClientCount()).toBe(0);
  });
});
