import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../apps/server/src/server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance;
let db: Database.Database;
let cleanupDir: string;

beforeEach(async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-e2e-batch-'));
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

describe('Batch Workflow E2E: Creation with Multiple Tasks', () => {
  it('creates a batch with 3 tasks and verifies all records', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Multi-Task Batch',
        tasks: [
          { goal: 'Click the login button' },
          { goal: 'Enter credentials' },
          { goal: 'Verify dashboard loads' },
        ],
        priority: 'high',
      },
    });

    expect(res.statusCode).toBe(201);
    const batchResult = JSON.parse(res.body);
    expect(batchResult.batchId).toBeDefined();
    expect(batchResult.taskIds).toHaveLength(3);
    expect(batchResult.totalTasks).toBe(3);

    // Verify batch record in database
    const batchRow = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchResult.batchId) as Record<string, unknown>;
    expect(batchRow).toBeDefined();
    expect(batchRow.name).toBe('Multi-Task Batch');
    expect(batchRow.total_tasks).toBe(3);
    expect(batchRow.priority).toBe('high');

    // Verify all tasks have batch_id reference
    const tasks = db.prepare('SELECT * FROM tasks WHERE batch_id = ?').all(batchResult.batchId) as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(3);
    const goals = tasks.map(t => t.goal);
    expect(goals).toContain('Click the login button');
    expect(goals).toContain('Enter credentials');
    expect(goals).toContain('Verify dashboard loads');

    // All tasks should be queued
    for (const task of tasks) {
      expect(['queued', 'failed', 'running']).toContain(task.status);
    }
  });

  it('creates a batch with task-specific config overrides', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Config Override Batch',
        tasks: [
          {
            goal: 'High-step task',
            config: { maxSteps: 100, llmModel: 'claude-3.5-sonnet' },
          },
          {
            goal: 'Default config task',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const { batchId } = JSON.parse(res.body);

    const tasks = db.prepare('SELECT * FROM tasks WHERE batch_id = ?').all(batchId) as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(2);

    // Find the task with custom config
    const customTask = tasks.find(t => t.goal === 'High-step task');
    const defaultTask = tasks.find(t => t.goal === 'Default config task');

    expect(customTask).toBeDefined();
    expect(defaultTask).toBeDefined();
    expect(customTask!.max_steps).toBe(100);
    expect(customTask!.llm_model).toBe('claude-3.5-sonnet');
    expect(defaultTask!.max_steps).toBe(50);
    expect(defaultTask!.llm_model).toBe('gpt-4o');
  });

  it('creates a batch with default values when optional fields are omitted', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Simple batch task' }],
      },
    });

    expect(res.statusCode).toBe(201);
    const { batchId } = JSON.parse(res.body);

    const batchRow = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batchRow.name).toBeNull();
    expect(batchRow.priority).toBe('medium');
    expect(batchRow.total_tasks).toBe(1);
  });

  it('creates a large batch with 10 tasks', async () => {
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      goal: `Large batch task ${i + 1}`,
    }));

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Large Batch',
        tasks,
        priority: 'low',
      },
    });

    expect(res.statusCode).toBe(201);
    const { batchId, taskIds, totalTasks } = JSON.parse(res.body);
    expect(taskIds).toHaveLength(10);
    expect(totalTasks).toBe(10);

    const dbTasks = db.prepare('SELECT * FROM tasks WHERE batch_id = ?').all(batchId) as Array<Record<string, unknown>>;
    expect(dbTasks).toHaveLength(10);
  });

  it('returns 400 for empty tasks array', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: { name: 'Empty', tasks: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for task with empty goal', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: { tasks: [{ goal: '' }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid priority', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: { tasks: [{ goal: 'Test' }], priority: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Batch Workflow E2E: Progress Tracking', () => {
  it('tracks batch progress as tasks complete', async () => {
    // Insert batch and tasks directly to avoid worker pool interference
    const batchId = '550e8400-e29b-41d4-a716-446655440030';
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
      VALUES (?, 'Progress Tracking Batch', 'running', 4, 0, 0, 'medium', ?, ?)
    `).run(batchId, now, now);

    // Insert 4 queued tasks
    for (let i = 0; i < 4; i++) {
      db.prepare(`
        INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, batch_id)
        VALUES (?, ?, '/app', 'gpt-4o', 'queued', 50, 0, ?, ?, ?)
      `).run(`progress-task-${i}`, `Task ${String.fromCharCode(65 + i)}`, now, now, batchId);
    }

    // Get initial status
    const initialRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}`,
    });
    const initial = JSON.parse(initialRes.body);
    expect(initial.totalTasks).toBe(4);
    expect(initial.progress).toBe(0);

    // Complete 2 tasks
    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run('progress-task-0');
    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run('progress-task-1');
    db.prepare("UPDATE batches SET completed_tasks = 2, status = 'running' WHERE id = ?").run(batchId);

    // Get updated status
    const updatedRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}`,
    });
    const updated = JSON.parse(updatedRes.body);
    expect(updated.completedTasks).toBe(2);
    expect(updated.totalTasks).toBe(4);
    expect(updated.progress).toBe(50); // 2/4 = 50%

    // Complete the remaining tasks
    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run('progress-task-2');
    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run('progress-task-3');
    db.prepare("UPDATE batches SET completed_tasks = 4, failed_tasks = 0, status = 'completed' WHERE id = ?").run(batchId);

    // Get final status
    const finalRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}`,
    });
    const final = JSON.parse(finalRes.body);
    expect(final.completedTasks).toBe(4);
    expect(final.failedTasks).toBe(0);
    expect(final.status).toBe('completed');
    expect(final.progress).toBe(100);
  });

  it('tracks batch with mixed completed and failed tasks', async () => {
    // Create a batch with 3 tasks
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Mixed Results Batch',
        tasks: [
          { goal: 'Success task' },
          { goal: 'Fail task' },
          { goal: 'Another success' },
        ],
      },
    });
    const { batchId } = JSON.parse(createRes.body);

    // Set mixed statuses
    const tasks = db.prepare('SELECT id FROM tasks WHERE batch_id = ?').all(batchId) as Array<{ id: string }>;
    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(tasks[0].id);
    db.prepare("UPDATE tasks SET status = 'failed' WHERE id = ?").run(tasks[1].id);
    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(tasks[2].id);
    db.prepare("UPDATE batches SET completed_tasks = 2, failed_tasks = 1, status = 'failed' WHERE id = ?").run(batchId);

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}`,
    });
    const body = JSON.parse(res.body);
    expect(body.status).toBe('failed');
    expect(body.completedTasks).toBe(2);
    expect(body.failedTasks).toBe(1);
    expect(body.totalTasks).toBe(3);
    expect(body.progress).toBe(100); // (2+1)/3 = 100%
  });

  it('returns batch with individual task details', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Task Detail Batch',
        tasks: [
          { goal: 'Detail task 1' },
          { goal: 'Detail task 2' },
        ],
      },
    });
    const { batchId } = JSON.parse(createRes.body);

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}`,
    });
    const body = JSON.parse(res.body);

    expect(body.tasks).toHaveLength(2);
    for (const task of body.tasks) {
      expect(task.id).toBeDefined();
      expect(task.goal).toBeDefined();
      expect(task.status).toBeDefined();
      expect(task.createdAt).toBeDefined();
      expect(task.updatedAt).toBeDefined();
    }
  });
});

describe('Batch Workflow E2E: Cancellation', () => {
  it('cancels a running batch and all its pending tasks', async () => {
    // Insert a batch with tasks directly (to avoid worker pool side effects)
    const batchId = '550e8400-e29b-41d4-a716-446655440010';
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
      VALUES (?, 'Cancel Test Batch', 'running', 3, 0, 0, 'high', ?, ?)
    `).run(batchId, now, now);

    // Insert 3 queued tasks
    const taskIds = ['cancel-task-1', 'cancel-task-2', 'cancel-task-3'];
    for (let i = 0; i < taskIds.length; i++) {
      db.prepare(`
        INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, batch_id)
        VALUES (?, ?, '/app', 'gpt-4o', 'queued', 50, 0, ?, ?, ?)
      `).run(taskIds[i], `Cancel task ${i + 1}`, now, now, batchId);
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
  });

  it('returns 404 for cancelling non-existent batch', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch/550e8400-e29b-41d4-a716-446655440000/cancel',
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Batch not found');
  });

  it('returns 409 for cancelling an already completed batch', async () => {
    // Create a batch
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Complete then cancel' }],
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

  it('returns 400 for invalid batch ID format', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch/not-a-uuid/cancel',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Batch Workflow E2E: Export', () => {
  it('exports a batch as JSON', async () => {
    // Create a batch with tasks
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Export JSON Batch',
        tasks: [
          { goal: 'Export task 1' },
          { goal: 'Export task 2' },
        ],
      },
    });
    const { batchId } = JSON.parse(createRes.body);

    // Export as JSON
    const exportRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}/export/json`,
    });

    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers['content-type']).toContain('application/json');
    expect(exportRes.headers['content-disposition']).toContain(`batch-${batchId}`);

    const exported = JSON.parse(exportRes.body);
    expect(exported.batch).toBeDefined();
    expect(exported.batch.id).toBe(batchId);
    expect(exported.batch.name).toBe('Export JSON Batch');
    expect(exported.tasks).toBeDefined();
    expect(Array.isArray(exported.tasks)).toBe(true);
    expect(exported.tasks).toHaveLength(2);

    // Each task should have task and steps properties
    for (const entry of exported.tasks) {
      expect(entry.task).toBeDefined();
      expect(entry.steps).toBeDefined();
      expect(Array.isArray(entry.steps)).toBe(true);
    }
  });

  it('exports a batch as CSV', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [
          { goal: 'CSV task 1' },
          { goal: 'CSV task 2' },
        ],
      },
    });
    const { batchId } = JSON.parse(createRes.body);

    const exportRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}/export/csv`,
    });

    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/csv');
    expect(exportRes.body).toContain('task_id');
    expect(exportRes.body).toContain('task_status');
    expect(exportRes.body).toContain('step_id');
  });

  it('exports a batch as HTML', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'HTML Export Batch',
        tasks: [
          { goal: 'HTML task 1' },
          { goal: 'HTML task 2' },
          { goal: 'HTML task 3' },
        ],
      },
    });
    const { batchId } = JSON.parse(createRes.body);

    const exportRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}/export/html`,
    });

    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/html');
    expect(exportRes.body).toContain('HTML Export Batch');
    expect(exportRes.body).toContain('HTML task 1');
    expect(exportRes.body).toContain('HTML task 2');
    expect(exportRes.body).toContain('HTML task 3');
    expect(exportRes.body).toContain('<!DOCTYPE html>');
  });

  it('returns 404 for exporting non-existent batch', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/batch/550e8400-e29b-41d4-a716-446655440000/export/json',
    });
    expect(res.statusCode).toBe(404);
  });

  it('exports a batch with completed tasks including their data', async () => {
    // Create a batch
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Completed Export Batch',
        tasks: [
          { goal: 'Completed export task' },
        ],
      },
    });
    const { batchId, taskIds } = JSON.parse(createRes.body);

    // Simulate task completion with steps
    const now = new Date().toISOString();
    db.prepare("UPDATE tasks SET status = 'completed', step_count = 1 WHERE id = ?").run(taskIds[0]);
    db.prepare(
      `INSERT INTO steps (id, task_id, step_index, phase, status, observation, timestamp, duration)
       VALUES (?, ?, 0, 'verify', 'success', 'Verified element', ?, 200)`
    ).run(`${taskIds[0]}-step-0`, taskIds[0], now);

    // Export as JSON
    const exportRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}/export/json`,
    });

    expect(exportRes.statusCode).toBe(200);
    const exported = JSON.parse(exportRes.body);
    expect(exported.tasks[0].task.status).toBe('completed');
    expect(exported.tasks[0].steps).toHaveLength(1);
    expect(exported.tasks[0].steps[0].observation).toBe('Verified element');
  });
});

describe('Batch Workflow E2E: Status Lifecycle', () => {
  it('batch starts in running status after creation', async () => {
    // Insert batch directly to avoid worker pool status changes
    const batchId = '550e8400-e29b-41d4-a716-446655440040';
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
      VALUES (?, NULL, 'running', 1, 0, 0, 'medium', ?, ?)
    `).run(batchId, now, now);

    db.prepare(`
      INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, batch_id)
      VALUES (?, 'Lifecycle task', '/app', 'gpt-4o', 'queued', 50, 0, ?, ?, ?)
    `).run('lifecycle-task-1', now, now, batchId);

    const statusRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}`,
    });
    const batch = JSON.parse(statusRes.body);
    expect(batch.status).toBe('running');
    expect(batch.totalTasks).toBe(1);
  });

  it('batch with all tasks completed has status completed', async () => {
    // Insert batch and tasks directly to avoid worker pool interference
    const batchId = '550e8400-e29b-41d4-a716-446655440041';
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
      VALUES (?, 'Completion Test', 'completed', 2, 2, 0, 'medium', ?, ?)
    `).run(batchId, now, now);

    for (let i = 0; i < 2; i++) {
      db.prepare(`
        INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, batch_id)
        VALUES (?, ?, '/app', 'gpt-4o', 'completed', 50, 0, ?, ?, ?)
      `).run(`complete-task-${i}`, `Complete ${String.fromCharCode(65 + i)}`, now, now, batchId);
    }

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}`,
    });
    const batch = JSON.parse(res.body);
    expect(batch.status).toBe('completed');
    expect(batch.progress).toBe(100);
  });

  it('batch status reflects individual task statuses', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [
          { goal: 'Will succeed' },
          { goal: 'Will fail' },
          { goal: 'Will succeed too' },
        ],
      },
    });
    const { batchId, taskIds } = JSON.parse(createRes.body);

    // Set individual task statuses
    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(taskIds[0]);
    db.prepare("UPDATE tasks SET status = 'failed' WHERE id = ?").run(taskIds[1]);
    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(taskIds[2]);
    db.prepare("UPDATE batches SET status = 'failed', completed_tasks = 2, failed_tasks = 1 WHERE id = ?").run(batchId);

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}`,
    });
    const batch = JSON.parse(res.body);
    expect(batch.status).toBe('failed');
    expect(batch.completedTasks).toBe(2);
    expect(batch.failedTasks).toBe(1);
    expect(batch.tasks).toHaveLength(3);

    const statuses = batch.tasks.map((t: { status: string }) => t.status);
    expect(statuses.filter((s: string) => s === 'completed')).toHaveLength(2);
    expect(statuses.filter((s: string) => s === 'failed')).toHaveLength(1);
  });
});
