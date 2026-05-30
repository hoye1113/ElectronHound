/**
 * API Routes Tests — Uncovered paths in task routes
 *
 * Tests for routes not covered by existing route tests:
 * - POST /api/tasks/:id/cancel — cancel running/queued tasks
 * - GET  /api/tasks/:id/generate — Playwright script generation
 * - GET  /api/tasks/:id/export   — JSONL task export
 * - POST /api/tasks/import       — JSONL task import
 * - GET  /api/tasks (with page/limit query edge cases)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-api-routes-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

function resetDb(db: Database.Database) {
  db.prepare('DELETE FROM steps').run();
  db.prepare('DELETE FROM tasks').run();
}

/** Insert a task directly into the DB for testing. */
function insertTask(
  db: Database.Database,
  overrides: Partial<{ id: string; status: string; goal: string }> = {},
) {
  const id = overrides.id ?? randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    overrides.goal ?? 'Test goal',
    '/path/to/app.exe',
    'gpt-4o',
    overrides.status ?? 'queued',
    50,
    0,
    now,
    now,
  );
  return id;
}

/** Insert a step directly into the DB for testing. */
function insertStep(
  db: Database.Database,
  taskId: string,
  opts: { stepIndex: number; phase: string; status: string; observation?: string; actionName?: string; duration?: number },
) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO steps (id, task_id, step_index, phase, status, observation, action, result, reasoning, screenshot_path, accessibility_snapshot_path, timestamp, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    taskId,
    opts.stepIndex,
    opts.phase,
    opts.status,
    opts.observation ?? null,
    opts.actionName ? JSON.stringify({ name: opts.actionName, args: {} }) : null,
    null,
    null,
    null,
    null,
    now,
    opts.duration ?? 100,
  );
}

// ─────────────────────────────────────────────────────────────
// POST /api/tasks/:id/cancel
// ─────────────────────────────────────────────────────────────

describe('Route: POST /api/tasks/:id/cancel', () => {
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

  it('cancels a running task', async () => {
    const taskId = insertTask(db, { status: 'running' });

    const res = await server.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/cancel`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(taskId);
    expect(body.status).toBe('cancelled');
  });

  it('cancels a queued task', async () => {
    const taskId = insertTask(db, { status: 'queued' });

    const res = await server.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/cancel`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('cancelled');
  });

  it('returns 409 for a completed task', async () => {
    const taskId = insertTask(db, { status: 'completed' });

    const res = await server.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/cancel`,
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task is not in a cancellable state');
  });

  it('returns 409 for a failed task', async () => {
    const taskId = insertTask(db, { status: 'failed' });

    const res = await server.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/cancel`,
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 409 for a cancelled task', async () => {
    const taskId = insertTask(db, { status: 'cancelled' });

    const res = await server.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/cancel`,
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 404 for non-existent task', async () => {
    const fakeId = randomUUID();
    const res = await server.inject({
      method: 'POST',
      url: `/api/tasks/${fakeId}/cancel`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task not found');
  });

  it('returns 404 for non-UUID task ID (no matching task)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/not-a-uuid/cancel',
    });

    // IdParam only validates non-empty string; 404 comes from task lookup
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task not found');
  });

  it('persists cancelled status in database', async () => {
    const taskId = insertTask(db, { status: 'running' });

    await server.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/cancel`,
    });

    const row = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId) as { status: string };
    expect(row.status).toBe('cancelled');
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/tasks/:id/generate
// ─────────────────────────────────────────────────────────────

describe('Route: GET /api/tasks/:id/generate', () => {
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

  it('returns a Playwright test script', async () => {
    const taskId = insertTask(db, { status: 'completed', goal: 'Click the submit button' });
    insertStep(db, taskId, {
      stepIndex: 0,
      phase: 'observe',
      status: 'success',
      observation: 'Found button',
      actionName: 'click',
    });

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/generate`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/typescript');
    expect(res.headers['content-disposition']).toContain('.spec.ts');
    expect(res.body).toContain('import');
    expect(res.body).toContain('test');
  });

  it('returns 404 for non-existent task', async () => {
    const fakeId = randomUUID();
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${fakeId}/generate`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task not found');
  });

  it('returns 404 for non-UUID task ID (no matching task)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/not-a-uuid/generate',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task not found');
  });

  it('generates script for task with multiple steps', async () => {
    const taskId = insertTask(db, { status: 'completed', goal: 'Navigate and click' });
    insertStep(db, taskId, {
      stepIndex: 0,
      phase: 'observe',
      status: 'success',
      observation: 'Page loaded',
      actionName: 'navigate',
    });
    insertStep(db, taskId, {
      stepIndex: 1,
      phase: 'plan',
      status: 'success',
      observation: 'Found button',
      actionName: 'click',
    });

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/generate`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toBeTruthy();
  });

  it('sets correct content-disposition filename with task ID', async () => {
    const taskId = insertTask(db, { status: 'completed' });

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/generate`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain(`task-${taskId}.spec.ts`);
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/tasks/:id/export (JSONL)
// ─────────────────────────────────────────────────────────────

describe('Route: GET /api/tasks/:id/export (JSONL)', () => {
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

  it('exports task as JSONL', async () => {
    const taskId = insertTask(db, { status: 'completed', goal: 'Test export' });
    insertStep(db, taskId, {
      stepIndex: 0,
      phase: 'observe',
      status: 'success',
      observation: 'Found element',
    });

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/export`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/jsonl');
    expect(res.headers['content-disposition']).toContain('.jsonl');
    expect(res.headers['content-disposition']).toContain(taskId);

    // Validate JSONL structure
    const lines = res.body.split('\n').filter((l: string) => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(2); // task line + step line

    const taskLine = JSON.parse(lines[0]);
    expect(taskLine.type).toBe('task');
    expect(taskLine.data.id).toBe(taskId);
    expect(taskLine.data.goal).toBe('Test export');

    const stepLine = JSON.parse(lines[1]);
    expect(stepLine.type).toBe('step');
    expect(stepLine.data.step_number).toBe(0);
  });

  it('exports task with no steps as JSONL', async () => {
    const taskId = insertTask(db, { status: 'queued', goal: 'No steps' });

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/export`,
    });

    expect(res.statusCode).toBe(200);

    const lines = res.body.split('\n').filter((l: string) => l.trim());
    expect(lines.length).toBe(1); // only the task line

    const taskLine = JSON.parse(lines[0]);
    expect(taskLine.type).toBe('task');
    expect(taskLine.data.id).toBe(taskId);
  });

  it('returns 404 for non-existent task', async () => {
    const fakeId = randomUUID();
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${fakeId}/export`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task not found');
  });

  it('returns 404 for non-UUID task ID (no matching task)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/not-a-uuid/export',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task not found');
  });

  it('includes all steps in export', async () => {
    const taskId = insertTask(db, { status: 'completed' });
    insertStep(db, taskId, { stepIndex: 0, phase: 'observe', status: 'success', actionName: 'click' });
    insertStep(db, taskId, { stepIndex: 1, phase: 'plan', status: 'success', actionName: 'type' });
    insertStep(db, taskId, { stepIndex: 2, phase: 'verify', status: 'failed' });

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/export`,
    });

    expect(res.statusCode).toBe(200);
    const lines = res.body.split('\n').filter((l: string) => l.trim());
    expect(lines.length).toBe(4); // 1 task + 3 steps

    const steps = lines.slice(1).map((l: string) => JSON.parse(l));
    expect(steps[0].data.step_number).toBe(0);
    expect(steps[1].data.step_number).toBe(1);
    expect(steps[2].data.step_number).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────
// POST /api/tasks/import (JSONL)
// ─────────────────────────────────────────────────────────────

describe('Route: POST /api/tasks/import', () => {
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

  it('imports a task from JSONL', async () => {
    const taskId = randomUUID();
    const now = new Date().toISOString();
    const jsonl = [
      JSON.stringify({
        type: 'task',
        data: {
          id: taskId,
          goal: 'Imported task',
          target_app_path: '/app.exe',
          llm_model: 'gpt-4o',
          status: 'completed',
          max_steps: 10,
          step_count: 1,
          created_at: now,
          updated_at: now,
        },
      }),
      JSON.stringify({
        type: 'step',
        data: {
          step_number: 0,
          phase: 'observe',
          status: 'success',
          observation: 'Found element',
          timestamp: now,
          duration: 150,
        },
      }),
    ].join('\n');

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: { jsonl },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.taskId).toBe(taskId);
    expect(body.stepCount).toBe(1);

    // Verify task persisted in DB
    const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown>;
    expect(taskRow).toBeDefined();
    expect(taskRow.goal).toBe('Imported task');

    // Verify step persisted
    const stepRows = db.prepare('SELECT * FROM steps WHERE task_id = ?').all(taskId);
    expect(stepRows.length).toBe(1);
  });

  it('imports a task with no steps', async () => {
    const taskId = randomUUID();
    const now = new Date().toISOString();
    const jsonl = JSON.stringify({
      type: 'task',
      data: {
        id: taskId,
        goal: 'No steps task',
        target_app_path: '/app.exe',
        llm_model: 'gpt-4o',
        status: 'queued',
        max_steps: 50,
        step_count: 0,
        created_at: now,
        updated_at: now,
      },
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: { jsonl },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.taskId).toBe(taskId);
    expect(body.stepCount).toBe(0);
  });

  it('generates new UUID when task ID already exists', async () => {
    const existingId = randomUUID();
    insertTask(db, { id: existingId, status: 'completed' });

    const now = new Date().toISOString();
    const jsonl = JSON.stringify({
      type: 'task',
      data: {
        id: existingId,
        goal: 'Duplicate ID task',
        target_app_path: '/app.exe',
        llm_model: 'gpt-4o',
        status: 'completed',
        max_steps: 10,
        step_count: 0,
        created_at: now,
        updated_at: now,
      },
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: { jsonl },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.taskId).not.toBe(existingId); // new UUID generated
    expect(body.taskId).toBeDefined();
  });

  it('returns 400 for empty JSONL', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: { jsonl: '' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 for missing jsonl field', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 for invalid JSONL content', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: { jsonl: 'not valid jsonl' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Invalid JSONL');
  });

  it('returns 400 for JSONL with no task line', async () => {
    const now = new Date().toISOString();
    const jsonl = JSON.stringify({
      type: 'step',
      data: {
        step_number: 0,
        phase: 'observe',
        status: 'success',
        timestamp: now,
        duration: 100,
      },
    });

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: { jsonl },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Invalid JSONL');
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/tasks with edge-case pagination
// ─────────────────────────────────────────────────────────────

describe('Route: GET /api/tasks (pagination edge cases)', () => {
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

  it('handles page beyond available data', async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 50, 0, ?, ?)`,
    ).run('task-1', 'Only task', '/a.exe', 'gpt-4o', now, now);

    const res = await server.inject({ method: 'GET', url: '/api/tasks?page=99&limit=10' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(1);
    expect(body.page).toBe(99);
  });

  it('defaults page and limit to sensible values', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/tasks' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it('clamps limit to max 100', async () => {
    const now = new Date().toISOString();
    for (let i = 0; i < 3; i++) {
      db.prepare(
        `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'queued', 50, 0, ?, ?)`,
      ).run(`task-${i}`, `Task ${i}`, '/app.exe', 'gpt-4o', now, now);
    }

    const res = await server.inject({ method: 'GET', url: '/api/tasks?limit=999' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.limit).toBe(100);
  });

  it('handles non-numeric page gracefully', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/tasks?page=abc' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.page).toBe(1); // defaults to 1
  });

  it('filters by completed status', async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'completed', 50, 5, ?, ?)`,
    ).run('done-1', 'Done', '/a.exe', 'gpt-4o', now, now);
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'failed', 50, 3, ?, ?)`,
    ).run('fail-1', 'Failed', '/a.exe', 'gpt-4o', now, now);

    const res = await server.inject({ method: 'GET', url: '/api/tasks?status=completed' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe('done-1');
  });
});
