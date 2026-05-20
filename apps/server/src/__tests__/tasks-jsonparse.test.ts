import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../server.js';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-tasks-json-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

describe('Tasks Routes - JSON.parse Error Handling', () => {
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
    try {
      rmSync(cleanupDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('GET /api/tasks/:id handles corrupted result_summary JSON gracefully', async () => {
    // Insert task with corrupted result_summary
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, result_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('task-bad', 'Test goal', '/test/app', 'gpt-4o', 'completed', 50, 0, now, now, 'this is not valid json');

    const res = await server.inject({ method: 'GET', url: '/api/tasks/task-bad' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // resultSummary should be undefined due to parse failure
    expect(body.task.resultSummary).toBeUndefined();
  });

  it('GET /api/tasks returns tasks with corrupted result_summary gracefully', async () => {
    const now = new Date().toISOString();
    // Insert 2 tasks, one with corrupted JSON, one with null
    db.prepare(`
      INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, result_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('task-bad', 'Bad goal', '/bad/app', 'gpt-4o', 'completed', 50, 0, now, now, 'not json');

    db.prepare(`
      INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, result_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('task-good', 'Good goal', '/good/app', 'gpt-4o', 'completed', 50, 0, now, now, null);

    const res = await server.inject({ method: 'GET', url: '/api/tasks' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);

    // task-bad should have undefined resultSummary
    const badTask = body.data.find((t: any) => t.id === 'task-bad');
    const goodTask = body.data.find((t: any) => t.id === 'task-good');
    expect(badTask).toBeDefined();
    expect(goodTask).toBeDefined();
    expect(badTask.resultSummary).toBeUndefined();
    expect(goodTask.resultSummary).toBeUndefined(); // null becomes undefined
  });

  it('GET /api/tasks/:id handles valid JSON result_summary correctly', async () => {
    const now = new Date().toISOString();
    const validSummary = JSON.stringify({ passed: 3, failed: 1, total: 4 });
    db.prepare(`
      INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, result_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('task-good', 'Test goal', '/test/app', 'gpt-4o', 'completed', 50, 0, now, now, validSummary);

    const res = await server.inject({ method: 'GET', url: '/api/tasks/task-good' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.task.resultSummary).toEqual({ passed: 3, failed: 1, total: 4 });
  });

  it('GET /api/tasks/:id handles empty string result_summary gracefully', async () => {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, result_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('task-empty', 'Test goal', '/test/app', 'gpt-4o', 'completed', 50, 0, now, now, '');

    const res = await server.inject({ method: 'GET', url: '/api/tasks/task-empty' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Empty string is falsy, so safeJsonParse returns undefined
    expect(body.task.resultSummary).toBeUndefined();
  });
});
