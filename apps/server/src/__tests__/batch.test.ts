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

  it('returns 500 when batch service throws', async () => {
    const originalDb = server.db;
    const mockDb = {
      ...originalDb,
      prepare: () => { throw new Error('DB connection lost'); },
      transaction: () => { throw new Error('DB connection lost'); },
    } as unknown as Database.Database;
    (server as unknown as Record<string, unknown>).db = mockDb;

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: { tasks: [{ goal: 'Test' }] },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Failed to create batch');

    (server as unknown as Record<string, unknown>).db = originalDb;
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

  it('returns 500 when batch service throws on get', async () => {
    const originalDb = server.db;
    const mockDb = {
      ...originalDb,
      prepare: () => { throw new Error('DB read error'); },
    } as unknown as Database.Database;
    (server as unknown as Record<string, unknown>).db = mockDb;

    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/batch/550e8400-e29b-41d4-a716-446655440000',
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Failed to get batch status');

    (server as unknown as Record<string, unknown>).db = originalDb;
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

  it('returns 500 when batch service throws on cancel', async () => {
    const originalDb = server.db;
    const mockDb = {
      ...originalDb,
      prepare: () => { throw new Error('DB write error'); },
    } as unknown as Database.Database;
    (server as unknown as Record<string, unknown>).db = mockDb;

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch/550e8400-e29b-41d4-a716-446655440000/cancel',
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Failed to cancel batch');

    (server as unknown as Record<string, unknown>).db = originalDb;
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

describe('Route: GET /api/tasks/batches', () => {
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

  it('returns empty list when no batches exist', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/batches',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it('returns batches after creation', async () => {
    // Create two batches
    await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: { name: 'Batch A', tasks: [{ goal: 'Task A1' }] },
    });
    await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: { name: 'Batch B', tasks: [{ goal: 'Task B1' }, { goal: 'Task B2' }] },
    });

    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/batches',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);

    // Batches are ordered by created_at DESC, so Batch B comes first
    expect(body.data[0].name).toBe('Batch B');
    expect(body.data[0].totalTasks).toBe(2);
    expect(body.data[1].name).toBe('Batch A');
    expect(body.data[1].totalTasks).toBe(1);

    // Each batch should have the expected shape
    for (const batch of body.data) {
      expect(batch.id).toBeDefined();
      expect(batch.status).toBeDefined();
      expect(batch.completedTasks).toBe(0);
      expect(batch.failedTasks).toBe(0);
      expect(batch.priority).toBeDefined();
      expect(batch.createdAt).toBeDefined();
      expect(batch.updatedAt).toBeDefined();
      expect(batch.progress).toBeDefined();
    }
  });

  it('filters batches by status', async () => {
    // Create two batches
    const res1 = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: { name: 'Running Batch', tasks: [{ goal: 'Task 1' }] },
    });
    await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: { name: 'Another Batch', tasks: [{ goal: 'Task 2' }] },
    });

    // Manually set the first batch to completed
    const { batchId } = JSON.parse(res1.body);
    db.prepare("UPDATE batches SET status = 'completed' WHERE id = ?").run(batchId);

    // Filter by completed
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/batches?status=completed',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Running Batch');
    expect(body.data[0].status).toBe('completed');
    expect(body.total).toBe(1);
  });

  it('supports pagination with page and limit', async () => {
    // Create 5 batches
    for (let i = 0; i < 5; i++) {
      await server.inject({
        method: 'POST',
        url: '/api/tasks/batch',
        payload: { name: `Batch ${i}`, tasks: [{ goal: `Task ${i}` }] },
      });
    }

    // Request page 1 with limit 2
    const page1 = await server.inject({
      method: 'GET',
      url: '/api/tasks/batches?page=1&limit=2',
    });

    expect(page1.statusCode).toBe(200);
    const body1 = JSON.parse(page1.body);
    expect(body1.data).toHaveLength(2);
    expect(body1.total).toBe(5);
    expect(body1.page).toBe(1);
    expect(body1.limit).toBe(2);

    // Request page 2 with limit 2
    const page2 = await server.inject({
      method: 'GET',
      url: '/api/tasks/batches?page=2&limit=2',
    });

    const body2 = JSON.parse(page2.body);
    expect(body2.data).toHaveLength(2);
    expect(body2.page).toBe(2);

    // Request page 3 with limit 2 (should have 1 remaining)
    const page3 = await server.inject({
      method: 'GET',
      url: '/api/tasks/batches?page=3&limit=2',
    });

    const body3 = JSON.parse(page3.body);
    expect(body3.data).toHaveLength(1);
    expect(body3.page).toBe(3);

    // Ensure no overlap between pages
    const allIds = [...body1.data, ...body2.data, ...body3.data].map((b: { id: string }) => b.id);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(5);
  });

  it('returns 500 when batch service throws', async () => {
    const originalDb = server.db;
    const mockDb = {
      ...originalDb,
      prepare: () => { throw new Error('DB connection lost'); },
    } as unknown as Database.Database;
    (server as unknown as Record<string, unknown>).db = mockDb;

    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/batches',
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();

    (server as unknown as Record<string, unknown>).db = originalDb;
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
