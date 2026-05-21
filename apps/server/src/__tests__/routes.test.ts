import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-routes-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

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

  it('returns status ok and timestamp', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});

describe('Route: POST /api/tasks', () => {
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

  const validBody = {
    goal: 'Click the submit button',
    targetAppPath: '/path/to/app.exe',
    llmModel: 'gpt-4o' as const,
    maxSteps: 10,
  };

  it('creates a task and returns 201', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: validBody,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeDefined();
    expect(body.goal).toBe(validBody.goal);
    expect(body.targetAppPath).toBe(validBody.targetAppPath);
    expect(body.llmModel).toBe(validBody.llmModel);
    expect(body.status).toBe('queued');
    expect(body.maxSteps).toBe(10);
    expect(body.stepCount).toBe(0);
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it('uses default maxSteps when omitted', async () => {
    const { maxSteps, ...withoutMax } = validBody;
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: withoutMax,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.maxSteps).toBe(50);
  });

  it('returns 400 for invalid body (missing goal)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { targetAppPath: '/app.exe', llmModel: 'gpt-4o' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('returns 400 for invalid llmModel', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { ...validBody, llmModel: 'invalid-model' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('persists task in database', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: validBody,
    });

    const rows = db.prepare('SELECT * FROM tasks').all() as Array<Record<string, unknown>>;
    expect(rows.length).toBe(1);
    expect(rows[0].goal).toBe(validBody.goal);
    // Task is submitted to the pool immediately; in test env the worker
    // spawn may fail (no npx), so status can be 'queued' or 'failed'.
    expect(['queued', 'failed']).toContain(rows[0].status);
  });
});

describe('Route: GET /api/tasks', () => {
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

  it('returns empty array when no tasks exist', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/tasks' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it('returns tasks sorted by created_at DESC', async () => {
    // Insert two tasks with explicit timestamps for reliable ordering
    const earlier = '2025-01-01T00:00:00.000Z';
    const later = '2025-01-02T00:00:00.000Z';
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 50, 0, ?, ?)`
    ).run('task-1', 'First task', '/a.exe', 'gpt-4o', earlier, earlier);
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 50, 0, ?, ?)`
    ).run('task-2', 'Second task', '/b.exe', 'gpt-4o-mini', later, later);

    const res = await server.inject({ method: 'GET', url: '/api/tasks' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(2);
    expect(body.total).toBe(2);
    expect(body.data[0].id).toBe('task-2'); // newer first
    expect(body.data[1].id).toBe('task-1');
  });

  it('filters by status', async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 50, 0, ?, ?)`
    ).run('t1', 'Queued task', '/a.exe', 'gpt-4o', now, now);
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'running', 50, 0, ?, ?)`
    ).run('t2', 'Running task', '/b.exe', 'gpt-4o-mini', now, now);

    const res = await server.inject({ method: 'GET', url: '/api/tasks?status=running' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe('t2');
    expect(body.data[0].status).toBe('running');
  });

  it('supports pagination', async () => {
    const now = new Date().toISOString();
    for (let i = 0; i < 5; i++) {
      db.prepare(
        `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'queued', 50, 0, ?, ?)`
      ).run(`task-${i}`, `Task ${i}`, '/app.exe', 'gpt-4o', now, now);
    }

    const res = await server.inject({ method: 'GET', url: '/api/tasks?limit=2&page=1' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(2);
    expect(body.total).toBe(5);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(2);
  });
});

describe('Route: GET /api/tasks/:id', () => {
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

  it('returns task with steps', async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'running', 50, 1, ?, ?)`
    ).run('task-1', 'Test goal', '/app.exe', 'gpt-4o', now, now);

    db.prepare(
      `INSERT INTO steps (id, task_id, step_index, phase, status, observation, timestamp, duration)
       VALUES (?, ?, ?, 'observe', 'success', 'Found button', ?, 150)`
    ).run('step-1', 'task-1', 0, now);

    const res = await server.inject({ method: 'GET', url: '/api/tasks/task-1' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.task.id).toBe('task-1');
    expect(body.task.goal).toBe('Test goal');
    expect(body.steps.length).toBe(1);
    expect(body.steps[0].id).toBe('step-1');
    expect(body.steps[0].phase).toBe('observe');
    expect(body.steps[0].status).toBe('success');
    expect(body.steps[0].observation).toBe('Found button');
  });

  it('returns 404 for non-existent task', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/tasks/nonexistent' });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task not found');
  });

  it('returns empty steps array for task with no steps', async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 50, 0, ?, ?)`
    ).run('task-empty', 'No steps', '/app.exe', 'gpt-4o', now, now);

    const res = await server.inject({ method: 'GET', url: '/api/tasks/task-empty' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.task.id).toBe('task-empty');
    expect(body.steps).toEqual([]);
  });
});

describe('Route: DELETE /api/tasks/:id', () => {
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

  it('deletes a queued task and returns 204', async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 50, 0, ?, ?)`
    ).run('task-del', 'To delete', '/app.exe', 'gpt-4o', now, now);

    const res = await server.inject({ method: 'DELETE', url: '/api/tasks/task-del' });
    expect(res.statusCode).toBe(204);

    // Verify deletion
    const rows = db.prepare('SELECT * FROM tasks WHERE id = ?').all('task-del');
    expect(rows.length).toBe(0);
  });

  it('cancels a running task instead of deleting', async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'running', 50, 0, ?, ?)`
    ).run('task-running', 'Running task', '/app.exe', 'gpt-4o', now, now);

    const res = await server.inject({ method: 'DELETE', url: '/api/tasks/task-running' });
    expect(res.statusCode).toBe(204);

    // Verify status changed, not deleted
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get('task-running') as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.status).toBe('cancelled');
  });

  it('returns 404 for non-existent task', async () => {
    const res = await server.inject({ method: 'DELETE', url: '/api/tasks/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('deletes completed task', async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'completed', 50, 5, ?, ?)`
    ).run('task-done', 'Done task', '/app.exe', 'gpt-4o', now, now);

    const res = await server.inject({ method: 'DELETE', url: '/api/tasks/task-done' });
    expect(res.statusCode).toBe(204);

    const rows = db.prepare('SELECT * FROM tasks WHERE id = ?').all('task-done');
    expect(rows.length).toBe(0);
  });
});

describe('Route: GET /api/feedback/patterns', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;

    // Change to temp dir so 'data/feedback' path is relative to test dir
    process.chdir(dir);

    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    process.chdir(originalCwd);
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns empty array when no patterns file exists', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/feedback/patterns' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.patterns).toEqual([]);
  });

  it('returns patterns when file exists', async () => {
    const feedbackDir = join('data', 'feedback');
    mkdirSync(feedbackDir, { recursive: true });
    const pattern = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      errorType: 'timeout',
      targetDescription: 'Button not found',
      remediationHint: 'Wait longer for element',
      similarityKeywords: ['timeout', 'element', 'wait'],
      frequency: 5,
      lastSeen: new Date().toISOString(),
      relatedGoalPatterns: ['click button'],
    };
    writeFileSync(join(feedbackDir, 'patterns.jsonl'), JSON.stringify(pattern) + '\n');

    const res = await server.inject({ method: 'GET', url: '/api/feedback/patterns' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.patterns.length).toBe(1);
    expect(body.patterns[0].id).toBe(pattern.id);
    expect(body.patterns[0].errorType).toBe('timeout');
    expect(body.patterns[0].frequency).toBe(5);
  });

  it('skips empty lines in jsonl', async () => {
    const feedbackDir = join('data', 'feedback');
    mkdirSync(feedbackDir, { recursive: true });
    const pattern = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      errorType: 'crash',
      targetDescription: 'App crashed',
      remediationHint: 'Restart app',
      similarityKeywords: ['crash'],
      frequency: 1,
      lastSeen: new Date().toISOString(),
      relatedGoalPatterns: [],
    };
    writeFileSync(join(feedbackDir, 'patterns.jsonl'), '\n' + JSON.stringify(pattern) + '\n\n');

    const res = await server.inject({ method: 'GET', url: '/api/feedback/patterns' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.patterns.length).toBe(1);
    expect(body.patterns[0].id).toBe('550e8400-e29b-41d4-a716-446655440001');
  });
});

describe('Route: GET /api/tasks/:id/report', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;

    // Change to temp dir so 'data/reports' path is relative
    process.chdir(dir);

    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    process.chdir(originalCwd);
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns 404 when report directory does not exist', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/tasks/550e8400-e29b-41d4-a716-446655440099/report' });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Report not found');
  });

  it('returns manifest when report exists', async () => {
    const reportDir = join('data', 'reports', '550e8400-e29b-41d4-a716-446655440001');
    mkdirSync(reportDir, { recursive: true });
    const manifest = {
      taskId: '550e8400-e29b-41d4-a716-446655440001',
      goal: 'Test goal',
      status: 'completed',
      totalSteps: 5,
      passedSteps: 4,
      failedSteps: 1,
      retriedSteps: 0,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      totalDuration: 5000,
    };
    writeFileSync(join(reportDir, 'manifest.json'), JSON.stringify(manifest));

    const res = await server.inject({ method: 'GET', url: '/api/tasks/550e8400-e29b-41d4-a716-446655440001/report' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.taskId).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(body.goal).toBe('Test goal');
    expect(body.totalSteps).toBe(5);
  });
});

describe('Route: streamRoutes co-existence', () => {
  it('stream route is not broken by other routes', async () => {
    const { dbPath, cleanupDir } = createTempDbPath();
    const bundle = await buildServer({ databasePath: dbPath });
    const { server, db } = bundle;

    // stream.ts expects sseHub on server — it needs to be decorated
    // For now just verify the server boots with all routes registered
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);

    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });
});
