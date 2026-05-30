/**
 * Task Export/Import Tests (PR-8)
 *
 * Tests for JSONL-based export/import of tasks and steps.
 * Covers: export format validation, import with valid/invalid JSONL,
 * round-trip (export -> import -> verify), and API endpoint tests.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import {
  exportTaskToJSONL,
  importTaskFromJSONL,
  validateJSONL,
} from '../services/taskExport.js';
import { runMigrations } from '../db/migrations.js';
import Database from 'better-sqlite3';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-task-export-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

/** Stable UUIDs for test data. */
const TEST_TASK_ID = 'e0000000-0000-4000-a000-000000000001';
const TEST_STEP_1_ID = 'f0000000-0000-4000-b000-000000000001';
const TEST_STEP_2_ID = 'f0000000-0000-4000-b000-000000000002';

/** Reset DB between tests. */
function resetDb(db: Database.Database) {
  db.prepare('DELETE FROM logs').run();
  db.prepare('DELETE FROM steps').run();
  db.prepare('DELETE FROM tasks').run();
  db.prepare('DELETE FROM batches').run();
}

/** Insert a test task with steps. */
function seedTestData(db: Database.Database) {
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, result_summary, created_at, updated_at, provider_id)
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
    'openai',
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
}

// ── Service Unit Tests: exportTaskToJSONL ─────────────────────────────

describe('taskExport service: exportTaskToJSONL', () => {
  let db: InstanceType<typeof Database>;
  let cleanupDir: string;

  beforeAll(() => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    db = new Database(dbPath);
    runMigrations(db);
  });

  afterAll(() => {
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => { resetDb(db); seedTestData(db); });

  it('exports task as valid JSONL with task line first', () => {
    const jsonl = exportTaskToJSONL(db, TEST_TASK_ID);
    const lines = jsonl.trim().split('\n');

    expect(lines).toHaveLength(3); // 1 task + 2 steps

    const taskLine = JSON.parse(lines[0]);
    expect(taskLine.type).toBe('task');
    expect(taskLine.data.id).toBe(TEST_TASK_ID);
    expect(taskLine.data.goal).toBe('Click the submit button');
    expect(taskLine.data.status).toBe('completed');
    expect(taskLine.data.llm_model).toBe('gpt-4o');
  });

  it('exports steps with correct step_number and data', () => {
    const jsonl = exportTaskToJSONL(db, TEST_TASK_ID);
    const lines = jsonl.trim().split('\n');

    const step1 = JSON.parse(lines[1]);
    expect(step1.type).toBe('step');
    expect(step1.data.step_number).toBe(0);
    expect(step1.data.phase).toBe('observe');
    expect(step1.data.action.name).toBe('click');

    const step2 = JSON.parse(lines[2]);
    expect(step2.type).toBe('step');
    expect(step2.data.step_number).toBe(1);
    expect(step2.data.phase).toBe('execute');
  });

  it('each line is independently parseable JSON', () => {
    const jsonl = exportTaskToJSONL(db, TEST_TASK_ID);
    const lines = jsonl.trim().split('\n');

    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
      const obj = JSON.parse(line);
      expect(obj).toHaveProperty('type');
      expect(obj).toHaveProperty('data');
    }
  });

  it('throws error for non-existent task', () => {
    expect(() => exportTaskToJSONL(db, 'non-existent-id')).toThrow('Task not found');
  });

  it('exports task with no steps as single JSONL line', () => {
    const noStepTaskId = 'e0000000-0000-4000-a000-000000000099';
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(noStepTaskId, 'No steps task', '/app.exe', 'gpt-4o', 'queued', 50, 0, now, now);

    const jsonl = exportTaskToJSONL(db, noStepTaskId);
    const lines = jsonl.trim().split('\n');

    expect(lines).toHaveLength(1);
    const taskLine = JSON.parse(lines[0]);
    expect(taskLine.type).toBe('task');
    expect(taskLine.data.id).toBe(noStepTaskId);
  });
});

// ── Service Unit Tests: validateJSONL ─────────────────────────────────

describe('taskExport service: validateJSONL', () => {
  it('returns valid for well-formed JSONL', () => {
    const jsonl = [
      JSON.stringify({ type: 'task', data: { id: '1', goal: 'test', status: 'completed' } }),
      JSON.stringify({ type: 'step', data: { step_number: 0, phase: 'observe' } }),
    ].join('\n');

    const result = validateJSONL(jsonl);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns errors for invalid JSON lines', () => {
    const jsonl = 'not valid json\n{"type":"task","data":{"id":"1"}}';

    const result = validateJSONL(jsonl);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('line 1');
  });

  it('returns errors for missing type field', () => {
    const jsonl = JSON.stringify({ data: { id: '1' } });

    const result = validateJSONL(jsonl);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('type');
  });

  it('returns errors for invalid type value', () => {
    const jsonl = JSON.stringify({ type: 'invalid', data: { id: '1' } });

    const result = validateJSONL(jsonl);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('type');
  });

  it('returns errors for missing data field', () => {
    const jsonl = JSON.stringify({ type: 'task' });

    const result = validateJSONL(jsonl);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('data');
  });

  it('requires task line to appear before step lines', () => {
    const jsonl = [
      JSON.stringify({ type: 'step', data: { step_number: 0 } }),
      JSON.stringify({ type: 'task', data: { id: '1' } }),
    ].join('\n');

    const result = validateJSONL(jsonl);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('task');
  });

  it('returns valid for empty content', () => {
    const result = validateJSONL('');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ── Service Unit Tests: importTaskFromJSONL ───────────────────────────

describe('taskExport service: importTaskFromJSONL', () => {
  let db: InstanceType<typeof Database>;
  let cleanupDir: string;

  beforeAll(() => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    db = new Database(dbPath);
    runMigrations(db);
  });

  afterAll(() => {
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => resetDb(db));

  it('imports a valid JSONL task with steps', () => {
    const now = new Date().toISOString();
    const jsonl = [
      JSON.stringify({
        type: 'task',
        data: {
          id: 'import-001',
          goal: 'Imported task',
          target_app_path: '/app.exe',
          llm_model: 'gpt-4o',
          status: 'completed',
          max_steps: 50,
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
          observation: 'Page loaded',
          action: { name: 'click', args: {} },
          timestamp: now,
          duration: 100,
        },
      }),
    ].join('\n');

    const result = importTaskFromJSONL(db, jsonl);
    expect(result.taskId).toBe('import-001');
    expect(result.stepCount).toBe(1);

    // Verify the data was inserted
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('import-001') as Record<string, unknown>;
    expect(task).toBeDefined();
    expect(task.goal).toBe('Imported task');
    expect(task.status).toBe('completed');

    const steps = db.prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_index').all('import-001') as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(1);
    expect(steps[0].phase).toBe('observe');
  });

  it('generates new IDs when task already exists', () => {
    const now = new Date().toISOString();
    // First import
    const jsonl = [
      JSON.stringify({
        type: 'task',
        data: {
          id: 'dup-task',
          goal: 'Duplicate test',
          target_app_path: '/app.exe',
          llm_model: 'gpt-4o',
          status: 'completed',
          max_steps: 50,
          step_count: 0,
          created_at: now,
          updated_at: now,
        },
      }),
    ].join('\n');

    const result1 = importTaskFromJSONL(db, jsonl);
    expect(result1.taskId).toBe('dup-task');

    // Second import of same ID should get a new ID
    const result2 = importTaskFromJSONL(db, jsonl);
    expect(result2.taskId).not.toBe('dup-task');
    expect(result2.taskId).toBeTruthy();
  });

  it('throws on invalid JSONL content', () => {
    expect(() => importTaskFromJSONL(db, 'not valid json')).toThrow();
  });

  it('throws when JSONL has no task line', () => {
    const jsonl = JSON.stringify({ type: 'step', data: { step_number: 0 } });
    expect(() => importTaskFromJSONL(db, jsonl)).toThrow();
  });

  it('imports task with null optional fields', () => {
    const now = new Date().toISOString();
    const jsonl = JSON.stringify({
      type: 'task',
      data: {
        id: 'minimal-task',
        goal: 'Minimal',
        target_app_path: '/app.exe',
        llm_model: 'gpt-4o',
        status: 'queued',
        max_steps: 50,
        step_count: 0,
        created_at: now,
        updated_at: now,
      },
    });

    const result = importTaskFromJSONL(db, jsonl);
    expect(result.taskId).toBe('minimal-task');
    expect(result.stepCount).toBe(0);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('minimal-task') as Record<string, unknown>;
    expect(task.provider_id).toBeNull();
    expect(task.result_summary).toBeNull();
    expect(task.context_injection).toBeNull();
  });
});

// ── Round-trip Tests ──────────────────────────────────────────────────

describe('taskExport round-trip: export -> import -> verify', () => {
  let db: InstanceType<typeof Database>;
  let cleanupDir: string;

  beforeAll(() => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    db = new Database(dbPath);
    runMigrations(db);
  });

  afterAll(() => {
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('preserves task fields through export-import cycle', () => {
    resetDb(db);
    seedTestData(db);

    // Export
    const jsonl = exportTaskToJSONL(db, TEST_TASK_ID);

    // Delete original
    db.prepare('DELETE FROM steps WHERE task_id = ?').run(TEST_TASK_ID);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(TEST_TASK_ID);

    // Import
    const result = importTaskFromJSONL(db, jsonl);
    expect(result.taskId).toBe(TEST_TASK_ID);

    // Verify task fields
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(TEST_TASK_ID) as Record<string, unknown>;
    expect(task.goal).toBe('Click the submit button');
    expect(task.target_app_path).toBe('/path/to/app.exe');
    expect(task.llm_model).toBe('gpt-4o');
    expect(task.status).toBe('completed');
    expect(task.max_steps).toBe(50);
    expect(task.step_count).toBe(2);
    expect(task.provider_id).toBe('openai');
  });

  it('preserves steps through export-import cycle', () => {
    resetDb(db);
    seedTestData(db);

    // Export
    const jsonl = exportTaskToJSONL(db, TEST_TASK_ID);

    // Delete original
    db.prepare('DELETE FROM steps WHERE task_id = ?').run(TEST_TASK_ID);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(TEST_TASK_ID);

    // Import
    const result = importTaskFromJSONL(db, jsonl);
    expect(result.stepCount).toBe(2);

    // Verify steps
    const steps = db.prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_index').all(TEST_TASK_ID) as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(2);

    expect(steps[0].phase).toBe('observe');
    expect(steps[0].status).toBe('success');
    expect(steps[0].observation).toBe('Found button element');
    expect(JSON.parse(steps[0].action).name).toBe('click');
    expect(steps[0].reasoning).toBe('Button is visible and enabled');
    expect(steps[0].duration).toBe(150);

    expect(steps[1].phase).toBe('execute');
    expect(steps[1].status).toBe('success');
    expect(steps[1].observation).toBe('Clicked submit button');
    expect(JSON.parse(steps[1].result).success).toBe(true);
  });

  it('JSONL output is git-diff friendly (one object per line)', () => {
    resetDb(db);
    seedTestData(db);

    const jsonl = exportTaskToJSONL(db, TEST_TASK_ID);
    const lines = jsonl.trim().split('\n');

    // Each line should be a single JSON object (no pretty-printing)
    for (const line of lines) {
      expect(line).not.toContain('\n');
      expect(line).not.toMatch(/^\s+/); // No leading whitespace
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

// ── API Endpoint Tests ────────────────────────────────────────────────

describe('Task Export API: GET /api/tasks/:id/export', () => {
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

  beforeEach(() => { resetDb(db); seedTestData(db); });

  it('returns JSONL file with correct content type', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/jsonl');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('.jsonl');
    expect(res.headers['content-disposition']).toContain(TEST_TASK_ID);
  });

  it('returns valid JSONL content', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${TEST_TASK_ID}/export`,
    });

    const lines = res.body.trim().split('\n');
    expect(lines).toHaveLength(3); // 1 task + 2 steps

    const taskLine = JSON.parse(lines[0]);
    expect(taskLine.type).toBe('task');
    expect(taskLine.data.id).toBe(TEST_TASK_ID);

    const step1 = JSON.parse(lines[1]);
    expect(step1.type).toBe('step');
    expect(step1.data.step_number).toBe(0);
  });

  it('returns 404 for non-existent task', async () => {
    const fakeId = 'f0000000-0000-4000-f000-000000000001';
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${fakeId}/export`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task not found');
  });
});

describe('Task Import API: POST /api/tasks/import', () => {
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

  it('imports a valid JSONL payload and returns task ID', async () => {
    const now = new Date().toISOString();
    const jsonl = [
      JSON.stringify({
        type: 'task',
        data: {
          id: 'api-import-001',
          goal: 'API imported task',
          target_app_path: '/app.exe',
          llm_model: 'gpt-4o',
          status: 'completed',
          max_steps: 50,
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
          observation: 'Loaded',
          timestamp: now,
          duration: 100,
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
    expect(body.taskId).toBe('api-import-001');
    expect(body.stepCount).toBe(1);

    // Verify in DB
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('api-import-001') as Record<string, unknown>;
    expect(task).toBeDefined();
    expect(task.goal).toBe('API imported task');
  });

  it('returns 400 for invalid JSONL content', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: { jsonl: 'not valid json' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });

  it('returns 400 for missing jsonl field', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for JSONL with no task line', async () => {
    const jsonl = JSON.stringify({ type: 'step', data: { step_number: 0 } });

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: { jsonl },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('task');
  });

  it('handles duplicate task IDs by generating new ID', async () => {
    const now = new Date().toISOString();
    const jsonl = JSON.stringify({
      type: 'task',
      data: {
        id: 'dup-api',
        goal: 'Dup test',
        target_app_path: '/app.exe',
        llm_model: 'gpt-4o',
        status: 'completed',
        max_steps: 50,
        step_count: 0,
        created_at: now,
        updated_at: now,
      },
    });

    // First import
    const res1 = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: { jsonl },
    });
    expect(res1.statusCode).toBe(201);

    // Second import with same ID
    const res2 = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: { jsonl },
    });
    expect(res2.statusCode).toBe(201);

    const body2 = JSON.parse(res2.body);
    expect(body2.taskId).not.toBe('dup-api');
  });
});
