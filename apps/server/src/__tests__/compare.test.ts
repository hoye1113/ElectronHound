import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
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
  opts: { stepIndex: number; phase: string; status: string; actionName?: string; duration?: number },
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
    opts.duration ?? 100,
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
    // compareRoutes registered via index.ts
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

describe('Route: POST /api/tasks/compare/detailed', () => {
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

  it('returns summary with correct step counts', async () => {
    const idA = insertTask(db, { status: 'completed' });
    const idB = insertTask(db, { status: 'completed' });

    // Task A: 2 success, 1 failed
    insertStep(db, idA, { stepIndex: 0, phase: 'observe', status: 'success', duration: 100 });
    insertStep(db, idA, { stepIndex: 1, phase: 'plan', status: 'success', duration: 200 });
    insertStep(db, idA, { stepIndex: 2, phase: 'verify', status: 'failed', duration: 150 });

    // Task B: 1 success, 1 failed, 1 retry
    insertStep(db, idB, { stepIndex: 0, phase: 'observe', status: 'success', duration: 110 });
    insertStep(db, idB, { stepIndex: 1, phase: 'plan', status: 'retry', duration: 250 });
    insertStep(db, idB, { stepIndex: 2, phase: 'verify', status: 'failed', duration: 180 });

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/compare/detailed',
      payload: { taskIds: [idA, idB] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.summary).toBeDefined();
    expect(body.summary.taskA.totalSteps).toBe(3);
    expect(body.summary.taskA.passedSteps).toBe(2);
    expect(body.summary.taskA.failedSteps).toBe(1);
    expect(body.summary.taskA.retriedSteps).toBe(0);
    expect(body.summary.taskA.totalDuration).toBe(450);

    expect(body.summary.taskB.totalSteps).toBe(3);
    expect(body.summary.taskB.passedSteps).toBe(1);
    expect(body.summary.taskB.failedSteps).toBe(1);
    expect(body.summary.taskB.retriedSteps).toBe(1);
    expect(body.summary.taskB.totalDuration).toBe(540);
  });

  it('returns actionFrequency with correct counts', async () => {
    const idA = insertTask(db, { status: 'completed' });
    const idB = insertTask(db, { status: 'completed' });

    // Task A: plan steps with actions
    insertStep(db, idA, { stepIndex: 0, phase: 'plan', status: 'success', actionName: 'click' });
    insertStep(db, idA, { stepIndex: 1, phase: 'plan', status: 'success', actionName: 'click' });
    insertStep(db, idA, { stepIndex: 2, phase: 'plan', status: 'success', actionName: 'type' });

    // Task B: plan steps with different actions
    insertStep(db, idB, { stepIndex: 0, phase: 'plan', status: 'success', actionName: 'click' });
    insertStep(db, idB, { stepIndex: 1, phase: 'plan', status: 'success', actionName: 'navigate' });

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/compare/detailed',
      payload: { taskIds: [idA, idB] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.actionFrequency).toBeDefined();
    expect(body.actionFrequency.taskA).toEqual({ click: 2, type: 1 });
    expect(body.actionFrequency.taskB).toEqual({ click: 1, navigate: 1 });
  });

  it('returns timelineDiff with correct structure', async () => {
    const idA = insertTask(db, { status: 'completed' });
    const idB = insertTask(db, { status: 'completed' });

    insertStep(db, idA, { stepIndex: 0, phase: 'observe', status: 'success', duration: 100 });
    insertStep(db, idA, { stepIndex: 1, phase: 'verify', status: 'success', duration: 200 });

    insertStep(db, idB, { stepIndex: 0, phase: 'observe', status: 'success', duration: 110 });
    insertStep(db, idB, { stepIndex: 1, phase: 'verify', status: 'failed', duration: 300 });

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/compare/detailed',
      payload: { taskIds: [idA, idB] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.timelineDiff).toBeDefined();
    expect(body.timelineDiff).toHaveLength(2);

    // First entry (observe step - unchanged)
    expect(body.timelineDiff[0]).toEqual({
      stepIndex: 0,
      phase: 'observe',
      taskAStatus: 'success',
      taskBStatus: 'success',
      taskADuration: 100,
      taskBDuration: 110,
      changed: false,
    });

    // Second entry (verify step - changed)
    expect(body.timelineDiff[1]).toEqual({
      stepIndex: 1,
      phase: 'verify',
      taskAStatus: 'success',
      taskBStatus: 'failed',
      taskADuration: 200,
      taskBDuration: 300,
      changed: true,
    });
  });

  it('changed steps have changed: true', async () => {
    const idA = insertTask(db, { status: 'completed' });
    const idB = insertTask(db, { status: 'completed' });

    // Same status - not changed
    insertStep(db, idA, { stepIndex: 0, phase: 'observe', status: 'success' });
    insertStep(db, idB, { stepIndex: 0, phase: 'observe', status: 'success' });

    // Different status - changed
    insertStep(db, idA, { stepIndex: 1, phase: 'verify', status: 'success' });
    insertStep(db, idB, { stepIndex: 1, phase: 'verify', status: 'failed' });

    // Only in B - changed (null vs status)
    insertStep(db, idB, { stepIndex: 2, phase: 'execute', status: 'success' });

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/compare/detailed',
      payload: { taskIds: [idA, idB] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const changedEntries = body.timelineDiff.filter(
      (e: { changed: boolean }) => e.changed,
    );
    expect(changedEntries.length).toBe(2); // verify and execute steps

    const unchangedEntries = body.timelineDiff.filter(
      (e: { changed: boolean }) => !e.changed,
    );
    expect(unchangedEntries.length).toBe(1); // observe step
  });

  it('returns 404 when a task is missing', async () => {
    const idA = insertTask(db);
    const fakeId = randomUUID();

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/compare/detailed',
      payload: { taskIds: [idA, fakeId] },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Task not found');
  });

  it('returns 400 for invalid payload', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/compare/detailed',
      payload: { taskIds: ['not-a-uuid', 'also-not-uuid'] },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
  });
});
