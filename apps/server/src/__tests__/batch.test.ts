/**
 * Batch Testing API Tests
 *
 * Tests for batch creation, status retrieval, cancellation,
 * and progress updates.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-batch-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

/** Reset DB between tests (shared server optimization). */
function resetDb(db: Database.Database) {
  db.prepare('DELETE FROM tasks').run();
  db.prepare('DELETE FROM batches').run();
}

describe('Route: POST /api/tasks/batch', () => {
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

  const validBatchBody = {
    name: 'Test Batch',
    tasks: [
      { goal: 'Click login button' },
      { goal: 'Fill in username field' },
      { goal: 'Submit the form' },
    ],
    priority: 'high' as const,
  };

  it('creates a batch with multiple tasks and returns 201', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: validBatchBody,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.batchId).toBeDefined();
    expect(body.taskIds).toHaveLength(3);
    expect(body.totalTasks).toBe(3);
  });

  it('persists batch in database', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: validBatchBody,
    });

    const body = JSON.parse(res.body);

    // Check batch record
    const batchRow = db.prepare('SELECT * FROM batches WHERE id = ?').get(body.batchId) as Record<string, unknown>;
    expect(batchRow).toBeDefined();
    expect(batchRow.name).toBe('Test Batch');
    expect(batchRow.total_tasks).toBe(3);
    expect(batchRow.priority).toBe('high');
  });

  it('persists tasks with batch_id reference', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: validBatchBody,
    });

    const body = JSON.parse(res.body);

    // Check tasks have batch_id
    const tasks = db.prepare('SELECT * FROM tasks WHERE batch_id = ?').all(body.batchId) as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(3);

    const goals = tasks.map(t => t.goal);
    expect(goals).toContain('Click login button');
    expect(goals).toContain('Fill in username field');
    expect(goals).toContain('Submit the form');
  });

  it('creates batch with default values when optional fields omitted', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Simple task' }],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);

    const batchRow = db.prepare('SELECT * FROM batches WHERE id = ?').get(body.batchId) as Record<string, unknown>;
    expect(batchRow.name).toBeNull();
    expect(batchRow.priority).toBe('medium');
  });

  it('returns 400 for empty tasks array', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Empty Batch',
        tasks: [],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 for task with empty goal', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: '' }],
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid priority', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Test' }],
        priority: 'invalid',
      },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('Route: GET /api/tasks/batch/:batchId', () => {
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

  it('returns batch status with task breakdown', async () => {
    // Create a batch first
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Status Test Batch',
        tasks: [
          { goal: 'Task 1' },
          { goal: 'Task 2' },
        ],
      },
    });

    const { batchId } = JSON.parse(createRes.body);

    // Get batch status
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(batchId);
    expect(body.name).toBe('Status Test Batch');
    expect(body.totalTasks).toBe(2);
    expect(body.tasks).toHaveLength(2);
    expect(body.progress).toBeDefined();
  });

  it('returns 404 for non-existent batch', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/batch/550e8400-e29b-41d4-a716-446655440000',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Batch not found');
  });

  it('returns 400 for invalid batch ID format', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/batch/invalid-id',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid batch ID format');
  });

  it('calculates progress percentage correctly', async () => {
    // Insert batch and tasks directly to avoid worker pool interference
    const batchId = '550e8400-e29b-41d4-a716-446655440001';
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
      VALUES (?, 'Progress Test', 'running', 4, 2, 0, 'medium', ?, ?)
    `).run(batchId, now, now);

    // Insert 4 tasks - 2 completed, 2 queued
    for (let i = 0; i < 4; i++) {
      const taskId = `task-${i}`;
      const status = i < 2 ? 'completed' : 'queued';
      db.prepare(`
        INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, batch_id)
        VALUES (?, ?, '/app.exe', 'gpt-4o', ?, 50, 0, ?, ?, ?)
      `).run(taskId, `Task ${i + 1}`, status, now, now, batchId);
    }

    // Get batch status
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}`,
    });

    const body = JSON.parse(res.body);
    expect(body.completedTasks).toBe(2);
    expect(body.totalTasks).toBe(4);
    expect(body.progress).toBe(50); // 2/4 = 50%
  });
});

describe('Route: POST /api/tasks/batch/:batchId/cancel', () => {
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

  it('cancels a running batch', async () => {
    // Insert batch and tasks directly to avoid worker pool interference
    const batchId = '550e8400-e29b-41d4-a716-446655440002';
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
      VALUES (?, 'Cancel Test', 'running', 2, 0, 0, 'medium', ?, ?)
    `).run(batchId, now, now);

    // Insert 2 queued tasks
    for (let i = 0; i < 2; i++) {
      const taskId = `cancel-task-${i}`;
      db.prepare(`
        INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, batch_id)
        VALUES (?, ?, '/app.exe', 'gpt-4o', 'queued', 50, 0, ?, ?, ?)
      `).run(taskId, `Task ${i + 1}`, now, now, batchId);
    }

    // Cancel the batch
    const res = await server.inject({
      method: 'POST',
      url: `/api/tasks/batch/${batchId}/cancel`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.batchId).toBe(batchId);

    // Verify batch status
    const batchRow = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batchRow.status).toBe('cancelled');
  });

  it('returns 404 for non-existent batch', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch/550e8400-e29b-41d4-a716-446655440000/cancel',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Batch not found');
  });

  it('returns 400 for invalid batch ID format', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch/invalid-id/cancel',
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 409 for already completed batch', async () => {
    // Create a batch
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Task 1' }],
      },
    });

    const { batchId } = JSON.parse(createRes.body);

    // Manually set batch to completed
    db.prepare("UPDATE batches SET status = 'completed' WHERE id = ?").run(batchId);

    // Try to cancel
    const res = await server.inject({
      method: 'POST',
      url: `/api/tasks/batch/${batchId}/cancel`,
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Batch is not in a cancellable state');
  });
});

describe('Batch Progress Updates', () => {
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

  it('returns batch status as completed when all tasks finish', async () => {
    // Insert batch and tasks directly to avoid worker pool interference
    const batchId = '550e8400-e29b-41d4-a716-446655440003';
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
      VALUES (?, 'Completion Test', 'completed', 2, 2, 0, 'medium', ?, ?)
    `).run(batchId, now, now);

    // Insert 2 completed tasks
    for (let i = 0; i < 2; i++) {
      const taskId = `complete-task-${i}`;
      db.prepare(`
        INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, batch_id)
        VALUES (?, ?, '/app.exe', 'gpt-4o', 'completed', 50, 0, ?, ?, ?)
      `).run(taskId, `Task ${i + 1}`, now, now, batchId);
    }

    // Get batch status — should reflect the already-completed state
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}`,
    });

    const body = JSON.parse(res.body);
    expect(body.status).toBe('completed');
    expect(body.progress).toBe(100);
  });

  it('returns batch status as failed when any task fails', async () => {
    // Create a batch with 2 tasks
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [
          { goal: 'Task 1' },
          { goal: 'Task 2' },
        ],
      },
    });

    const { batchId } = JSON.parse(createRes.body);

    // Complete one task and fail another
    const tasks = db.prepare('SELECT id FROM tasks WHERE batch_id = ?').all(batchId) as Array<{ id: string }>;
    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(tasks[0].id);
    db.prepare("UPDATE tasks SET status = 'failed' WHERE id = ?").run(tasks[1].id);

    // Update batch counts and status (simulating what updateBatchProgress would do)
    db.prepare("UPDATE batches SET status = 'failed', completed_tasks = 1, failed_tasks = 1 WHERE id = ?").run(batchId);

    // Get batch status — should reflect the already-failed state
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}`,
    });

    const body = JSON.parse(res.body);
    expect(body.status).toBe('failed');
    expect(body.progress).toBe(100);
  });
});
