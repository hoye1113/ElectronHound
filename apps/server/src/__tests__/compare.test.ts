import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
import { compareRoutes } from '../routes/compare.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-compare-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

function resetDb(db: Database.Database) {
  db.prepare('DELETE FROM steps').run();
  db.prepare('DELETE FROM tasks').run();
}

/** Insert a task directly into the DB for testing. */
function insertTask(db: Database.Database, overrides: Partial<{ id: string; status: string }> = {}) {
  const id = overrides.id ?? randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, context_injection, step_count, created_at, updated_at, provider_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, 'Test goal', '/app', 'gpt-4', overrides.status ?? 'completed', 50, null, 0, now, now, null);
  return id;
}

/** Insert a step directly into the DB for testing. */
function insertStep(
  db: Database.Database,
  taskId: string,
  opts: { stepIndex: number; phase: string; status: string; actionName?: string },
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
    null,
    opts.actionName ? JSON.stringify({ name: opts.actionName, args: {} }) : null,
    null,
    null,
    null,
    null,
    now,
    100,
  );
}

describe('Route: POST /api/tasks/compare', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
    // Register compareRoutes (not in main index.ts yet)
    await server.register(compareRoutes, { prefix: '/api' });
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => resetDb(db));

  it('returns diff for two valid tasks', async () => {
    const idA = insertTask(db, { status: 'completed' });
    const idB = insertTask(db, { status: 'completed' });

    // Task A: verify passes
    insertStep(db, idA, { stepIndex: 0, phase: 'observe', status: 'success' });
    insertStep(db, idA, { stepIndex: 1, phase: 'verify', status: 'success' });

    // Task B: verify fails (new failure)
    insertStep(db, idB, { stepIndex: 0, phase: 'observe', status: 'success' });
    insertStep(db, idB, { stepIndex: 1, phase: 'verify', status: 'failed' });

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/compare',
      payload: { taskIds: [idA, idB] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.taskA.id).toBe(idA);
    expect(body.taskB.id).toBe(idB);
    expect(body.diff).toBeDefined();
    expect(body.diff.newFailures.length).toBe(1);
    expect(body.diff.newFailures[0].phase).toBe('verify');
    expect(body.diff.newFailures[0].message).toContain('pass to fail');
  });

  it('returns 404 when a task is missing', async () => {
    const idA = insertTask(db);
    const fakeId = randomUUID();

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/compare',
      payload: { taskIds: [idA, fakeId] },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Task not found');
    expect(body.error).toContain(fakeId);
  });

  it('returns 400 for invalid payload', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/compare',
      payload: { taskIds: ['not-a-uuid', 'also-not-uuid'] },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });
});
