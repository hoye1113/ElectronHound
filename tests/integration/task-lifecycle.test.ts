import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildServer } from '../../apps/server/src/server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance, FastifyReply } from 'fastify';

let server: FastifyInstance;
let db: Database.Database;
let cleanupDir: string;

beforeEach(async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-integration-lifecycle-'));
  cleanupDir = tmpDir;
  const result = await buildServer({
    databasePath: join(tmpDir, 'test.sqlite3'),
    dataDir: tmpDir,
  });
  server = result.server;
  db = result.db;
});

afterEach(async () => {
  await server.close();
  db.close();
  try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── Helper: create a mock SSE client for testing ──────────────────

interface MockSSEClient {
  reply: FastifyReply;
  raw: {
    write: ReturnType<typeof vi.fn>;
    flushHeaders: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    _closeCallback: (() => void) | null;
    _writtenData: string[];
  };
}

function createMockSSEClient(): MockSSEClient {
  const writtenData: string[] = [];

  const raw = {
    write: vi.fn((data: string) => {
      writtenData.push(data);
      return true;
    }),
    flushHeaders: vi.fn(),
    on: vi.fn((_event: string, cb: () => void) => {
      raw._closeCallback = cb;
    }),
    _closeCallback: null as (() => void) | null,
    _writtenData: writtenData,
  };

  const reply = {
    header: vi.fn(),
    raw: raw as unknown as NodeJS.WritableStream,
  } as unknown as FastifyReply;

  return { reply, raw: raw as unknown as typeof raw };
}

// ══════════════════════════════════════════════════════════════════
// 1. Task Creation and Retrieval
// ══════════════════════════════════════════════════════════════════

describe('Task Lifecycle: Creation and Retrieval', () => {
  it('creates a task via POST and retrieves it via GET', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        goal: 'Verify login form validation',
        targetAppPath: '/test/app',
        llmModel: 'gpt-4o',
        maxSteps: 25,
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    expect(created.id).toBeDefined();
    expect(typeof created.id).toBe('string');
    expect(created.id.length).toBeGreaterThan(0);
    expect(created.goal).toBe('Verify login form validation');
    expect(created.targetAppPath).toBe('/test/app');
    expect(created.llmModel).toBe('gpt-4o');
    expect(created.maxSteps).toBe(25);
    // Status may be 'queued' or 'running' since worker pool picks up tasks immediately
    expect(['queued', 'running']).toContain(created.status);
    expect(created.createdAt).toBeDefined();
    expect(created.updatedAt).toBeDefined();

    // Retrieve the task
    const getRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/${created.id}`,
    });

    expect(getRes.statusCode).toBe(200);
    const body = JSON.parse(getRes.body);
    expect(body.task).toBeDefined();
    expect(body.steps).toBeDefined();
    expect(Array.isArray(body.steps)).toBe(true);

    // Verify all fields are persisted correctly
    expect(body.task.id).toBe(created.id);
    expect(body.task.goal).toBe('Verify login form validation');
    expect(body.task.targetAppPath).toBe('/test/app');
    expect(body.task.llmModel).toBe('gpt-4o');
    expect(body.task.maxSteps).toBe(25);
    expect(['queued', 'running']).toContain(body.task.status);
    expect(body.task.stepCount).toBe(0);
    expect(body.task.createdAt).toBe(created.createdAt);
  });

  it('creates a task with optional fields and retrieves them', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        goal: 'Test context injection',
        targetAppPath: '/test/app',
        llmModel: 'claude-3.5-sonnet',
        maxSteps: 10,
        contextInjection: 'Focus on the settings page',
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);

    const getRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/${created.id}`,
    });

    const body = JSON.parse(getRes.body);
    expect(body.task.contextInjection).toBe('Focus on the settings page');
    expect(body.task.llmModel).toBe('claude-3.5-sonnet');
    expect(body.task.maxSteps).toBe(10);
  });

  it('returns 404 for non-existent task', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/nonexistent-id',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task not found');
  });

  it('lists tasks after creation', async () => {
    // Create two tasks
    await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { goal: 'First task', targetAppPath: '/app', llmModel: 'gpt-4o' },
    });
    await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { goal: 'Second task', targetAppPath: '/app', llmModel: 'gpt-4o' },
    });

    const listRes = await server.inject({ method: 'GET', url: '/api/tasks' });
    expect(listRes.statusCode).toBe(200);
    const body = JSON.parse(listRes.body);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.total).toBeDefined();
    expect(body.total).toBeGreaterThanOrEqual(2);
  });
});

// ══════════════════════════════════════════════════════════════════
// 2. Task Cancellation
// ══════════════════════════════════════════════════════════════════

describe('Task Lifecycle: Cancellation', () => {
  it('creates a task and cancels it successfully', async () => {
    // Insert task directly to avoid worker pool status changes
    const taskId = 'cancel-test-task-1';
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 50, 0, ?, ?)`
    ).run(taskId, 'Cancel test goal', '/app', 'gpt-4o', now, now);

    const cancelRes = await server.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/cancel`,
    });

    expect(cancelRes.statusCode).toBe(200);
    const cancelled = JSON.parse(cancelRes.body);
    expect(cancelled.id).toBe(taskId);
    expect(cancelled.status).toBe('cancelled');

    // Verify via GET
    const getRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}`,
    });
    const body = JSON.parse(getRes.body);
    expect(body.task.status).toBe('cancelled');
  });

  it('returns 409 when cancelling an already-cancelled task', async () => {
    const taskId = 'cancel-test-task-2';
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'cancelled', 50, 0, ?, ?)`
    ).run(taskId, 'Already cancelled', '/app', 'gpt-4o', now, now);

    const res = await server.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/cancel`,
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task is not in a cancellable state');
  });

  it('returns 409 when cancelling a completed task', async () => {
    const taskId = 'cancel-test-task-3';
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'completed', 50, 5, ?, ?)`
    ).run(taskId, 'Completed task', '/app', 'gpt-4o', now, now);

    const res = await server.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/cancel`,
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task is not in a cancellable state');
  });

  it('returns 404 for cancelling non-existent task', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/nonexistent-id/cancel',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task not found');
  });

  it('cancels a running task', async () => {
    const taskId = 'cancel-test-task-4';
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'running', 50, 3, ?, ?)`
    ).run(taskId, 'Running task', '/app', 'gpt-4o', now, now);

    const cancelRes = await server.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/cancel`,
    });

    expect(cancelRes.statusCode).toBe(200);
    const cancelled = JSON.parse(cancelRes.body);
    expect(cancelled.status).toBe('cancelled');
  });
});

// ══════════════════════════════════════════════════════════════════
// 3. Batch Operations
// ══════════════════════════════════════════════════════════════════

describe('Task Lifecycle: Batch Operations', () => {
  it('creates a batch with correct task count', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Lifecycle Batch',
        tasks: [
          { goal: 'Test login' },
          { goal: 'Test signup' },
          { goal: 'Test logout' },
        ],
        priority: 'high',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.batchId).toBeDefined();
    expect(body.taskIds).toHaveLength(3);
    expect(body.totalTasks).toBe(3);

    // Verify tasks in database
    const tasks = db.prepare('SELECT * FROM tasks WHERE batch_id = ?').all(body.batchId) as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(3);
  });

  it('cancels a batch and all its tasks', async () => {
    // Insert batch and tasks directly to avoid worker pool interference
    const batchId = '550e8400-e29b-41d4-a716-446655440050';
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
      VALUES (?, 'Cancel Batch Test', 'running', 3, 0, 0, 'medium', ?, ?)
    `).run(batchId, now, now);

    const taskIds = ['batch-cancel-task-1', 'batch-cancel-task-2', 'batch-cancel-task-3'];
    for (let i = 0; i < taskIds.length; i++) {
      db.prepare(`
        INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, batch_id)
        VALUES (?, ?, '/app', 'gpt-4o', 'queued', 50, 0, ?, ?, ?)
      `).run(taskIds[i], `Batch task ${i + 1}`, now, now, batchId);
    }

    // Cancel the batch
    const cancelRes = await server.inject({
      method: 'POST',
      url: `/api/tasks/batch/${batchId}/cancel`,
    });

    expect(cancelRes.statusCode).toBe(200);
    const cancelBody = JSON.parse(cancelRes.body);
    expect(cancelBody.success).toBe(true);
    expect(cancelBody.batchId).toBe(batchId);

    // Verify batch is cancelled
    const batchRow = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batchRow.status).toBe('cancelled');

    // Verify tasks were found in the batch (cancelBatch calls pool.cancel on each)
    const tasks = db.prepare('SELECT * FROM tasks WHERE batch_id = ?').all(batchId) as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(3);
  });

  it('returns 409 for cancelling an already-cancelled batch', async () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440051';
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
      VALUES (?, 'Already Cancelled', 'cancelled', 1, 0, 0, 'medium', ?, ?)
    `).run(batchId, now, now);

    db.prepare(`
      INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, batch_id)
      VALUES (?, 'Task', '/app', 'gpt-4o', 'cancelled', 50, 0, ?, ?, ?)
    `).run('batch-cancelled-task-1', now, now, batchId);

    const res = await server.inject({
      method: 'POST',
      url: `/api/tasks/batch/${batchId}/cancel`,
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Batch is not in a cancellable state');
  });

  it('returns 404 for cancelling non-existent batch', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch/550e8400-e29b-41d4-a716-446655440099/cancel',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Batch not found');
  });

  it('creates a batch with task-specific config overrides', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Override Batch',
        tasks: [
          { goal: 'High-step task', config: { maxSteps: 100, llmModel: 'claude-3.5-sonnet' } },
          { goal: 'Default task' },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const { batchId } = JSON.parse(res.body);

    const tasks = db.prepare('SELECT * FROM tasks WHERE batch_id = ?').all(batchId) as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(2);

    const customTask = tasks.find(t => t.goal === 'High-step task');
    const defaultTask = tasks.find(t => t.goal === 'Default task');

    expect(customTask!.max_steps).toBe(100);
    expect(customTask!.llm_model).toBe('claude-3.5-sonnet');
    expect(defaultTask!.max_steps).toBe(50);
    expect(defaultTask!.llm_model).toBe('gpt-4o');
  });
});

// ══════════════════════════════════════════════════════════════════
// 4. Export/Import Roundtrip
// ══════════════════════════════════════════════════════════════════

describe('Task Lifecycle: Export/Import Roundtrip', () => {
  it('exports a task and imports it back with matching data', async () => {
    // Create a task with steps directly in the database
    const taskId = 'export-import-task-1';
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'completed', 50, 2, ?, ?)`
    ).run(taskId, 'Export import test', '/test/app', 'gpt-4o', now, now);

    // Add steps
    db.prepare(
      `INSERT INTO steps (id, task_id, step_index, phase, status, observation, action, result, reasoning, timestamp, duration)
       VALUES (?, ?, 0, 'observe', 'success', 'Found login button', ?, null, 'Button visible', ?, 150)`
    ).run(`${taskId}-step-0`, taskId, JSON.stringify({ name: 'snapshot', args: {} }), now);

    db.prepare(
      `INSERT INTO steps (id, task_id, step_index, phase, status, observation, action, result, reasoning, timestamp, duration)
       VALUES (?, ?, 1, 'execute', 'success', 'Clicked login', ?, ?, 'Action completed', ?, 300)`
    ).run(
      `${taskId}-step-1`,
      taskId,
      JSON.stringify({ name: 'click', args: { selector: '#login' } }),
      JSON.stringify({ success: true }),
      now,
    );

    // Export the task as JSONL
    const exportRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/export`,
    });

    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers['content-type']).toContain('application/jsonl');
    expect(exportRes.headers['content-disposition']).toContain(`task-${taskId}.jsonl`);

    const jsonlContent = exportRes.body;
    expect(jsonlContent).toBeDefined();
    expect(jsonlContent.length).toBeGreaterThan(0);

    // Verify JSONL structure: first line is task, rest are steps
    const lines = jsonlContent.trim().split('\n');
    expect(lines.length).toBe(3); // 1 task + 2 steps

    const taskLine = JSON.parse(lines[0]);
    expect(taskLine.type).toBe('task');
    expect(taskLine.data.goal).toBe('Export import test');
    expect(taskLine.data.target_app_path).toBe('/test/app');
    expect(taskLine.data.llm_model).toBe('gpt-4o');
    expect(taskLine.data.status).toBe('completed');
    expect(taskLine.data.max_steps).toBe(50);
    expect(taskLine.data.step_count).toBe(2);

    const step1Line = JSON.parse(lines[1]);
    expect(step1Line.type).toBe('step');
    expect(step1Line.data.step_number).toBe(0);
    expect(step1Line.data.phase).toBe('observe');
    expect(step1Line.data.observation).toBe('Found login button');

    const step2Line = JSON.parse(lines[2]);
    expect(step2Line.type).toBe('step');
    expect(step2Line.data.step_number).toBe(1);
    expect(step2Line.data.phase).toBe('execute');

    // Import the JSONL back
    const importRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: { jsonl: jsonlContent },
    });

    expect(importRes.statusCode).toBe(201);
    const importBody = JSON.parse(importRes.body);
    expect(importBody.taskId).toBeDefined();
    expect(importBody.stepCount).toBe(2);

    // The imported task should have a different ID (since original already exists)
    const importedId = importBody.taskId;
    expect(importedId).not.toBe(taskId);

    // Retrieve the imported task and verify it matches
    const getRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/${importedId}`,
    });

    expect(getRes.statusCode).toBe(200);
    const imported = JSON.parse(getRes.body);
    expect(imported.task.goal).toBe('Export import test');
    expect(imported.task.targetAppPath).toBe('/test/app');
    expect(imported.task.llmModel).toBe('gpt-4o');
    expect(imported.task.status).toBe('completed');
    expect(imported.task.maxSteps).toBe(50);
    expect(imported.task.stepCount).toBe(2);
    expect(imported.steps).toHaveLength(2);
    expect(imported.steps[0].phase).toBe('observe');
    expect(imported.steps[0].observation).toBe('Found login button');
    expect(imported.steps[1].phase).toBe('execute');
  });

  it('imports a task with no steps', async () => {
    const jsonl = JSON.stringify({
      type: 'task',
      data: {
        id: 'no-step-task',
        goal: 'Simple task',
        target_app_path: '/app',
        llm_model: 'gpt-4o',
        status: 'queued',
        max_steps: 50,
        step_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    const importRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: { jsonl },
    });

    expect(importRes.statusCode).toBe(201);
    const body = JSON.parse(importRes.body);
    expect(body.taskId).toBe('no-step-task');
    expect(body.stepCount).toBe(0);

    // Verify via GET
    const getRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/no-step-task`,
    });
    const task = JSON.parse(getRes.body);
    expect(task.task.goal).toBe('Simple task');
    expect(task.steps).toHaveLength(0);
  });

  it('returns 400 for invalid JSONL import', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: { jsonl: 'not valid jsonl' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });

  it('returns 400 for empty JSONL import', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: { jsonl: '' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('generates new ID when importing a task with duplicate ID', async () => {
    // Create a task first
    const taskId = 'duplicate-id-task';
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 50, 0, ?, ?)`
    ).run(taskId, 'Original task', '/app', 'gpt-4o', now, now);

    // Try to import with the same ID
    const jsonl = JSON.stringify({
      type: 'task',
      data: {
        id: taskId,
        goal: 'Imported duplicate',
        target_app_path: '/app',
        llm_model: 'gpt-4o',
        status: 'queued',
        max_steps: 50,
        step_count: 0,
        created_at: now,
        updated_at: now,
      },
    });

    const importRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/import',
      payload: { jsonl },
    });

    expect(importRes.statusCode).toBe(201);
    const body = JSON.parse(importRes.body);
    // Should get a new ID since the original exists
    expect(body.taskId).not.toBe(taskId);
    expect(body.taskId).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════
// 5. SSE Event Streaming
// ══════════════════════════════════════════════════════════════════

describe('Task Lifecycle: SSE Event Streaming', () => {
  it('broadcasts SSE event when a task is cancelled', async () => {
    // Insert task directly to avoid worker pool status changes
    const taskId = 'sse-lifecycle-task-1';
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 50, 0, ?, ?)`
    ).run(taskId, 'SSE cancel test', '/app', 'gpt-4o', now, now);

    // Register a mock SSE client for this task
    const { reply, raw } = createMockSSEClient();
    server.sseHub.addClient(taskId, reply);

    // Verify client is registered
    expect(server.sseHub.getClientCount(taskId)).toBe(1);

    // Cancel the task — this should trigger an SSE broadcast
    const cancelRes = await server.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/cancel`,
    });
    expect(cancelRes.statusCode).toBe(200);

    // Verify SSE event was broadcast
    expect(raw.write).toHaveBeenCalled();
    const sseMessages = raw._writtenData;
    const cancelEvent = sseMessages.find((msg: string) => msg.includes('"status":"cancelled"'));
    expect(cancelEvent).toBeDefined();
    expect(cancelEvent).toContain('event: status');
    expect(cancelEvent).toContain(`"taskId":"${taskId}"`);
  });

  it('SSE events are scoped per task ID', async () => {
    const hub = server.sseHub;
    const clientA = createMockSSEClient();
    const clientB = createMockSSEClient();

    hub.addClient('task-scoped-a', clientA.reply);
    hub.addClient('task-scoped-b', clientB.reply);

    // Broadcast to task-scoped-a only
    hub.broadcast('task-scoped-a', {
      event: 'status',
      data: { taskId: 'task-scoped-a', status: 'running' },
    });

    expect(clientA.raw.write).toHaveBeenCalled();
    expect(clientB.raw.write).not.toHaveBeenCalled();
  });

  it('broadcastAll sends to all connected clients', async () => {
    const hub = server.sseHub;
    const clientA = createMockSSEClient();
    const clientB = createMockSSEClient();

    hub.addClient('task-all-a', clientA.reply);
    hub.addClient('task-all-b', clientB.reply);

    hub.broadcastAll({
      event: 'status',
      data: { type: 'global:shutdown' },
    });

    expect(clientA.raw.write).toHaveBeenCalled();
    expect(clientB.raw.write).toHaveBeenCalled();
  });

  it('SSE hub tracks client counts correctly', async () => {
    const hub = server.sseHub;
    const client1 = createMockSSEClient();
    const client2 = createMockSSEClient();

    expect(hub.getClientCount('count-task')).toBe(0);

    hub.addClient('count-task', client1.reply);
    expect(hub.getClientCount('count-task')).toBe(1);

    hub.addClient('count-task', client2.reply);
    expect(hub.getClientCount('count-task')).toBe(2);

    // Simulate disconnect
    client1.raw._closeCallback?.();
    expect(hub.getClientCount('count-task')).toBe(1);
  });

  it('SSE hub sets correct headers on client registration', async () => {
    const hub = server.sseHub;
    const { reply, raw } = createMockSSEClient();

    hub.addClient('header-task', reply);

    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(reply.header).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(raw.flushHeaders).toHaveBeenCalled();
  });

  it('broadcasts step events with correct format', async () => {
    const hub = server.sseHub;
    const { reply, raw } = createMockSSEClient();

    hub.addClient('step-event-task', reply);

    hub.broadcast('step-event-task', {
      event: 'step',
      data: {
        stepIndex: 0,
        phase: 'observe',
        status: 'success',
        observation: 'Found submit button',
      },
    });

    expect(raw._writtenData.length).toBe(1);
    const sseMessage = raw._writtenData[0];
    expect(sseMessage).toContain('event: step');
    expect(sseMessage).toContain('"stepIndex":0');
    expect(sseMessage).toContain('"phase":"observe"');
    expect(sseMessage).toContain('"observation":"Found submit button"');
    expect(sseMessage).toMatch(/\n\n$/);
  });

  it('broadcasts complete events with step count', async () => {
    const hub = server.sseHub;
    const { reply, raw } = createMockSSEClient();

    hub.addClient('complete-event-task', reply);

    hub.broadcast('complete-event-task', {
      event: 'complete',
      data: { taskId: 'complete-event-task', status: 'completed', stepCount: 5 },
    });

    expect(raw._writtenData.length).toBe(1);
    const sseMessage = raw._writtenData[0];
    expect(sseMessage).toContain('event: complete');
    expect(sseMessage).toContain('"stepCount":5');
    expect(sseMessage).toContain('"status":"completed"');
  });
});
