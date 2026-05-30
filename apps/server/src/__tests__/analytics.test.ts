import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-analytics-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

function resetDb(db: Database.Database) {
  db.prepare('DELETE FROM token_usage').run();
  db.prepare('DELETE FROM steps').run();
  db.prepare('DELETE FROM tasks').run();
}

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

function insertTokenUsage(
  db: Database.Database,
  opts: { taskId: string; promptTokens: number; completionTokens: number; createdAt: string },
) {
  db.prepare(
    `INSERT INTO token_usage (task_id, provider, model, prompt_tokens, completion_tokens, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(opts.taskId, 'openai', 'gpt-4', opts.promptTokens, opts.completionTokens, opts.createdAt);
}

describe('Route: GET /api/tasks/analytics', () => {
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

  it('returns empty data when no tasks exist', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/analytics?days=30',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.completionRate).toEqual([]);
    expect(body.avgDuration).toEqual([]);
    expect(body.statusDistribution).toEqual({
      completed: 0,
      failed: 0,
      cancelled: 0,
      queued: 0,
    });
    expect(body.tokenUsage).toEqual([]);
  });

  it('returns correct completion rate data', async () => {
    const today = new Date().toISOString().split('T')[0];

    insertTask(db, { status: 'completed', createdAt: `${today}T10:00:00.000Z` });
    insertTask(db, { status: 'completed', createdAt: `${today}T11:00:00.000Z` });
    insertTask(db, { status: 'failed', createdAt: `${today}T12:00:00.000Z` });

    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/analytics?days=7',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.completionRate.length).toBeGreaterThanOrEqual(1);
    const todayEntry = body.completionRate.find((e: { date: string }) => e.date === today);
    expect(todayEntry).toBeDefined();
    expect(todayEntry.completed).toBe(2);
    expect(todayEntry.failed).toBe(1);
  });

  it('returns correct status distribution', async () => {
    const today = new Date().toISOString().split('T')[0];

    insertTask(db, { status: 'completed', createdAt: `${today}T10:00:00.000Z` });
    insertTask(db, { status: 'completed', createdAt: `${today}T11:00:00.000Z` });
    insertTask(db, { status: 'failed', createdAt: `${today}T12:00:00.000Z` });
    insertTask(db, { status: 'cancelled', createdAt: `${today}T13:00:00.000Z` });
    insertTask(db, { status: 'queued', createdAt: `${today}T14:00:00.000Z` });

    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/analytics?days=7',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.statusDistribution.completed).toBe(2);
    expect(body.statusDistribution.failed).toBe(1);
    expect(body.statusDistribution.cancelled).toBe(1);
    expect(body.statusDistribution.queued).toBe(1);
  });

  it('returns token usage data', async () => {
    const today = new Date().toISOString().split('T')[0];
    const taskId = insertTask(db, { status: 'completed', createdAt: `${today}T10:00:00.000Z` });

    insertTokenUsage(db, {
      taskId,
      promptTokens: 1000,
      completionTokens: 500,
      createdAt: `${today}T10:05:00.000Z`,
    });
    insertTokenUsage(db, {
      taskId,
      promptTokens: 2000,
      completionTokens: 1000,
      createdAt: `${today}T10:10:00.000Z`,
    });

    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/analytics?days=7',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.tokenUsage.length).toBeGreaterThanOrEqual(1);
    const todayEntry = body.tokenUsage.find((e: { date: string }) => e.date === today);
    expect(todayEntry).toBeDefined();
    expect(todayEntry.tokens).toBe(4500); // 1000+500+2000+1000
  });

  it('clamps days parameter to 1-365 range', async () => {
    const resLow = await server.inject({
      method: 'GET',
      url: '/api/tasks/analytics?days=0',
    });
    expect(resLow.statusCode).toBe(200);

    const resHigh = await server.inject({
      method: 'GET',
      url: '/api/tasks/analytics?days=999',
    });
    expect(resHigh.statusCode).toBe(200);

    const resBad = await server.inject({
      method: 'GET',
      url: '/api/tasks/analytics?days=abc',
    });
    expect(resBad.statusCode).toBe(400);
  });

  it('defaults to 30 days when no days parameter provided', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/analytics',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('completionRate');
    expect(body).toHaveProperty('avgDuration');
    expect(body).toHaveProperty('statusDistribution');
    expect(body).toHaveProperty('tokenUsage');
  });
});
