import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
import { trendsRoutes } from '../routes/trends.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-trends-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

function resetDb(db: Database.Database) {
  db.prepare('DELETE FROM steps').run();
  db.prepare('DELETE FROM tasks').run();
}

/** Insert a task with a specific created_at date. */
function insertTask(
  db: Database.Database,
  opts: { status: string; createdAt: string },
) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, context_injection, step_count, created_at, updated_at, provider_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, 'Test goal', '/app', 'gpt-4', opts.status, 50, null, 0, opts.createdAt, opts.createdAt, null);
  return id;
}

/** Insert a step with a specific duration. */
function insertStep(db: Database.Database, taskId: string, duration: number) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO steps (id, task_id, step_index, phase, status, observation, action, result, reasoning, screenshot_path, accessibility_snapshot_path, timestamp, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, taskId, 0, 'execute', 'success', null, null, null, null, null, null, now, duration);
}

describe('Route: GET /api/tasks/trends', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
    // Register trendsRoutes (not in main index.ts yet)
    await server.register(trendsRoutes, { prefix: '/api' });
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => resetDb(db));

  it('returns empty arrays when no tasks exist', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/trends?days=30',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.dates).toEqual([]);
    expect(body.passRates).toEqual([]);
    expect(body.taskCounts).toEqual([]);
    expect(body.avgDuration).toEqual([]);
  });

  it('returns grouped data with correct pass rates and counts', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Insert tasks for today
    insertTask(db, { status: 'completed', createdAt: `${today}T10:00:00.000Z` });
    insertTask(db, { status: 'completed', createdAt: `${today}T11:00:00.000Z` });
    insertTask(db, { status: 'failed', createdAt: `${today}T12:00:00.000Z` });

    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/trends?days=7',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.dates.length).toBeGreaterThanOrEqual(1);
    expect(body.dates).toContain(today);
    expect(body.taskCounts).toContain(3);
    expect(body.passRates).toContain(67); // 2/3 = 67%
  });

  it('clamps days parameter to 1-365 range', async () => {
    // days=0 should clamp to 1
    const resLow = await server.inject({
      method: 'GET',
      url: '/api/tasks/trends?days=0',
    });
    expect(resLow.statusCode).toBe(200);

    // days=999 should clamp to 365
    const resHigh = await server.inject({
      method: 'GET',
      url: '/api/tasks/trends?days=999',
    });
    expect(resHigh.statusCode).toBe(200);

    // Invalid input returns 400
    const resBad = await server.inject({
      method: 'GET',
      url: '/api/tasks/trends?days=abc',
    });
    expect(resBad.statusCode).toBe(400);
  });
});
