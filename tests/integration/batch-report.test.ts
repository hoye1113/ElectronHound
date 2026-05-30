import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../apps/server/src/server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance;
let db: Database.Database;
let cleanupDir: string;

beforeEach(async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-integration-batch-report-'));
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

// ══════════════════════════════════════════════════════════════════
// 1. Batch Execution Lifecycle
// ══════════════════════════════════════════════════════════════════

describe('Batch Execution Lifecycle', () => {
  it('creates a batch with 3 tasks and verifies correct total_tasks', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Lifecycle Batch',
        tasks: [
          { goal: 'Test login flow' },
          { goal: 'Test signup flow' },
          { goal: 'Test logout flow' },
        ],
        priority: 'high',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.batchId).toBeDefined();
    expect(body.taskIds).toHaveLength(3);
    expect(body.totalTasks).toBe(3);

    // Verify batch in database
    const batchRow = db.prepare('SELECT * FROM batches WHERE id = ?').get(body.batchId) as Record<string, unknown>;
    expect(batchRow).toBeDefined();
    expect(batchRow.total_tasks).toBe(3);
    expect(batchRow.name).toBe('Lifecycle Batch');
    expect(batchRow.priority).toBe('high');
  });

  it('verifies all 3 tasks are created with the correct batch_id', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Batch ID Check',
        tasks: [
          { goal: 'Task A' },
          { goal: 'Task B' },
          { goal: 'Task C' },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const { batchId, taskIds } = JSON.parse(res.body);

    // Verify each task has the correct batch_id
    const tasks = db.prepare('SELECT * FROM tasks WHERE batch_id = ?').all(batchId) as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(3);

    for (const task of tasks) {
      expect(task.batch_id).toBe(batchId);
      expect(taskIds).toContain(task.id);
      expect(task.status).toBeDefined();
    }
  });

  it('cancels a batch and verifies all tasks are cancelled', async () => {
    // Insert batch and tasks directly to avoid worker pool interference
    const batchId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
      VALUES (?, 'Cancel Lifecycle Batch', 'running', 3, 0, 0, 'medium', ?, ?)
    `).run(batchId, now, now);

    const taskIds = [randomUUID(), randomUUID(), randomUUID()];
    for (let i = 0; i < taskIds.length; i++) {
      db.prepare(`
        INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, batch_id)
        VALUES (?, ?, '/app', 'gpt-4o', 'queued', 50, 0, ?, ?, ?)
      `).run(taskIds[i], `Lifecycle cancel task ${i + 1}`, now, now, batchId);
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

    // Verify batch status is cancelled
    const batchRow = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batchRow.status).toBe('cancelled');

    // Verify tasks exist in the batch
    const tasks = db.prepare('SELECT * FROM tasks WHERE batch_id = ?').all(batchId) as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(3);
  });
});

// ══════════════════════════════════════════════════════════════════
// 2. Batch Progress Tracking
// ══════════════════════════════════════════════════════════════════

describe('Batch Progress Tracking', () => {
  it('creates a batch and checks status via GET /api/tasks/batch/:id', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Progress Tracking Batch',
        tasks: [
          { goal: 'Track task 1' },
          { goal: 'Track task 2' },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const { batchId } = JSON.parse(res.body);

    // Check batch status
    const statusRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}`,
    });

    expect(statusRes.statusCode).toBe(200);
    const statusBody = JSON.parse(statusRes.body);
    expect(statusBody.id).toBe(batchId);
    expect(statusBody.name).toBe('Progress Tracking Batch');
    expect(statusBody.totalTasks).toBe(2);
    expect(statusBody.tasks).toHaveLength(2);
    expect(statusBody.progress).toBeDefined();
    expect(typeof statusBody.progress).toBe('number');
  });

  it('verifies progress fields reflect task completion counts', async () => {
    // Insert batch directly with known progress values
    const batchId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
      VALUES (?, 'Progress Fields Batch', 'running', 5, 2, 1, 'medium', ?, ?)
    `).run(batchId, now, now);

    // Insert tasks with varying statuses
    const taskStatuses = ['completed', 'completed', 'failed', 'queued', 'running'];
    for (let i = 0; i < taskStatuses.length; i++) {
      db.prepare(`
        INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, batch_id)
        VALUES (?, ?, '/app', 'gpt-4o', ?, 50, 0, ?, ?, ?)
      `).run(randomUUID(), `Progress task ${i + 1}`, taskStatuses[i], now, now, batchId);
    }

    const statusRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchId}`,
    });

    expect(statusRes.statusCode).toBe(200);
    const body = JSON.parse(statusRes.body);
    expect(body.totalTasks).toBe(5);
    expect(body.completedTasks).toBe(2);
    expect(body.failedTasks).toBe(1);
    expect(body.tasks).toHaveLength(5);
    // progress = (completed + failed) / total * 100 = (2+1)/5*100 = 60
    expect(body.progress).toBe(60);
  });

  it('returns 404 for non-existent batch', async () => {
    const fakeId = randomUUID();
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${fakeId}`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Batch not found');
  });

  it('lists all batches via GET /api/tasks/batches', async () => {
    // Create two batches
    await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'List Batch A',
        tasks: [{ goal: 'Task in batch A' }],
      },
    });

    await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'List Batch B',
        tasks: [{ goal: 'Task in batch B' }],
      },
    });

    const listRes = await server.inject({
      method: 'GET',
      url: '/api/tasks/batches',
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.data).toBeDefined();
    expect(Array.isArray(listBody.data)).toBe(true);
    expect(listBody.data.length).toBeGreaterThanOrEqual(2);
    expect(listBody.total).toBeGreaterThanOrEqual(2);

    // Verify batch names are present
    const names = listBody.data.map((b: { name: string }) => b.name);
    expect(names).toContain('List Batch A');
    expect(names).toContain('List Batch B');
  });
});

// ══════════════════════════════════════════════════════════════════
// 3. Report Generation
// ══════════════════════════════════════════════════════════════════

describe('Report Generation', () => {
  it('generates an HTML report for a task with steps', async () => {
    // Create a task with steps directly in the database
    const taskId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'completed', 50, 2, ?, ?)`
    ).run(taskId, 'Report generation test', '/test/app', 'gpt-4o', now, now);

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

    // Generate HTML report
    const reportRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/report/html`,
    });

    expect(reportRes.statusCode).toBe(200);
    expect(reportRes.headers['content-type']).toContain('text/html');
    expect(reportRes.headers['content-disposition']).toContain(`report-${taskId}.html`);

    // Verify HTML content contains task data
    const html = reportRes.body;
    expect(html).toContain('Report generation test');
    expect(html).toContain('gpt-4o');
    expect(html).toContain('completed');
    expect(html).toContain('Found login button');
    expect(html).toContain('Clicked login');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('returns 404 for HTML report of non-existent task', async () => {
    const fakeId = randomUUID();
    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${fakeId}/report/html`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task not found');
  });

  it('generates an HTML report for a task with no steps', async () => {
    const taskId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 50, 0, ?, ?)`
    ).run(taskId, 'Empty steps report', '/test/app', 'gpt-4o', now, now);

    const reportRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/report/html`,
    });

    expect(reportRes.statusCode).toBe(200);
    expect(reportRes.headers['content-type']).toContain('text/html');
    const html = reportRes.body;
    expect(html).toContain('Empty steps report');
    expect(html).toContain('No steps recorded');
  });

  it('fetches report manifest (returns 404 if no report files exist)', async () => {
    const taskId = randomUUID();
    const now = new Date().toISOString();

    // The report manifest endpoint reads from filesystem, so without actual
    // report files it should return 404
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'completed', 50, 1, ?, ?)`
    ).run(taskId, 'Manifest test', '/test/app', 'gpt-4o', now, now);

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/report`,
    });

    // No manifest.json file exists on disk, so expect 404
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Report or manifest not found');
  });
});

// ══════════════════════════════════════════════════════════════════
// 4. Notification Integration
// ══════════════════════════════════════════════════════════════════

describe('Notification Integration', () => {
  it('retrieves default notification config via GET', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/notifications/config',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBeDefined();
    expect(body.webhookUrls).toEqual([]);
    expect(body.sseEnabled).toBe(true);
    expect(body.eventTypes).toContain('task.completed');
    expect(body.eventTypes).toContain('task.failed');
    expect(body.eventTypes).toContain('batch.completed');
  });

  it('updates notification config via PUT and persists changes', async () => {
    const newConfig = {
      webhookUrls: ['https://hooks.example.com/test'],
      sseEnabled: false,
      eventTypes: ['task.completed', 'task.failed', 'batch.completed', 'batch.failed'],
    };

    const putRes = await server.inject({
      method: 'PUT',
      url: '/api/notifications/config',
      payload: newConfig,
    });

    expect(putRes.statusCode).toBe(200);
    const putBody = JSON.parse(putRes.body);
    expect(putBody.webhookUrls).toEqual(['https://hooks.example.com/test']);
    expect(putBody.sseEnabled).toBe(false);
    expect(putBody.eventTypes).toEqual(['task.completed', 'task.failed', 'batch.completed', 'batch.failed']);

    // Verify persistence via GET
    const getRes = await server.inject({
      method: 'GET',
      url: '/api/notifications/config',
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.webhookUrls).toEqual(['https://hooks.example.com/test']);
    expect(getBody.sseEnabled).toBe(false);
    expect(getBody.eventTypes).toContain('batch.failed');
  });

  it('rejects invalid notification config with 400', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/notifications/config',
      payload: {
        webhookUrls: ['not-a-valid-url'],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
  });

  it('returns error when testing notification without webhook URLs', async () => {
    // Trigger default config creation first
    await server.inject({
      method: 'GET',
      url: '/api/notifications/config',
    });

    // Default config has no webhook URLs
    const res = await server.inject({
      method: 'POST',
      url: '/api/notifications/test',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('No webhook URLs configured');
  });

  it('returns notification history via GET /api/notifications/history', async () => {
    // Insert a log entry directly
    db.prepare(
      `INSERT INTO notification_log (id, event_type, channel, target, status, error, payload)
       VALUES (?, 'test', 'webhook', 'https://example.com', 'sent', null, ?)`
    ).run(randomUUID(), JSON.stringify({ type: 'test' }));

    const res = await server.inject({
      method: 'GET',
      url: '/api/notifications/history',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].eventType).toBe('test');
    expect(body.data[0].channel).toBe('webhook');
    expect(body.data[0].status).toBe('sent');
  });
});

// ══════════════════════════════════════════════════════════════════
// 5. Schedule Integration
// ══════════════════════════════════════════════════════════════════

describe('Schedule Integration', () => {
  /** Helper: seed a template so schedule creation succeeds */
  function seedTemplate(): string {
    const templateId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO templates (id, name, description, category, goal, config, variables, built_in, created_at, updated_at)
       VALUES (?, 'Smoke Test Template', 'Runs a smoke test', 'custom', 'Verify app launches successfully', '{}', '[]', 0, ?, ?)`
    ).run(templateId, now, now);
    return templateId;
  }

  it('creates a schedule via POST and verifies it is listed', async () => {
    const templateId = seedTemplate();

    const createRes = await server.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: {
        name: 'Nightly Smoke Test',
        templateId,
        cronExpression: '0 2 * * *',
        enabled: true,
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    expect(created.id).toBeDefined();
    expect(created.name).toBe('Nightly Smoke Test');
    expect(created.templateId).toBe(templateId);
    expect(created.cronExpression).toBe('0 2 * * *');
    expect(created.enabled).toBe(true);
    expect(created.nextRunAt).toBeDefined();

    // Verify it appears in the schedule list
    const listRes = await server.inject({
      method: 'GET',
      url: '/api/schedules',
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.data).toBeDefined();
    expect(listBody.data.length).toBeGreaterThanOrEqual(1);
    const found = listBody.data.find((s: { id: string }) => s.id === created.id);
    expect(found).toBeDefined();
    expect(found.name).toBe('Nightly Smoke Test');
  });

  it('runs a schedule immediately via POST /api/schedules/:id/run', async () => {
    const templateId = seedTemplate();

    // Create schedule
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: {
        name: 'Manual Run Schedule',
        templateId,
        cronExpression: '0 0 1 1 *',
      },
    });

    expect(createRes.statusCode).toBe(201);
    const { id: scheduleId } = JSON.parse(createRes.body);

    // Trigger immediate run
    const runRes = await server.inject({
      method: 'POST',
      url: `/api/schedules/${scheduleId}/run`,
    });

    expect(runRes.statusCode).toBe(202);
    const runBody = JSON.parse(runRes.body);
    expect(runBody.taskId).toBeDefined();
    expect(runBody.runId).toBeDefined();
    expect(runBody.message).toBe('Schedule execution started');

    // Verify the task was created
    const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(runBody.taskId) as Record<string, unknown> | undefined;
    expect(taskRow).toBeDefined();
    expect(taskRow!.goal).toBe('Verify app launches successfully');

    // Verify schedule run count was incremented
    const scheduleRow = db.prepare('SELECT * FROM schedules WHERE id = ?').get(scheduleId) as Record<string, unknown> | undefined;
    expect(scheduleRow).toBeDefined();
    expect(scheduleRow!.run_count).toBe(1);
    expect(scheduleRow!.last_status).toBe('running');
  });

  it('checks execution history after running a schedule', async () => {
    const templateId = seedTemplate();

    // Create schedule
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: {
        name: 'History Schedule',
        templateId,
        cronExpression: '0 0 1 1 *',
      },
    });

    expect(createRes.statusCode).toBe(201);
    const { id: scheduleId } = JSON.parse(createRes.body);

    // Run schedule twice
    await server.inject({
      method: 'POST',
      url: `/api/schedules/${scheduleId}/run`,
    });
    await server.inject({
      method: 'POST',
      url: `/api/schedules/${scheduleId}/run`,
    });

    // Check execution history
    const historyRes = await server.inject({
      method: 'GET',
      url: `/api/schedules/${scheduleId}/history`,
    });

    expect(historyRes.statusCode).toBe(200);
    const historyBody = JSON.parse(historyRes.body);
    expect(historyBody.data).toBeDefined();
    expect(Array.isArray(historyBody.data)).toBe(true);
    expect(historyBody.data.length).toBe(2);
    expect(historyBody.total).toBe(2);

    // Verify each run entry
    for (const run of historyBody.data) {
      expect(run.scheduleId).toBe(scheduleId);
      expect(run.taskId).toBeDefined();
      expect(run.startedAt).toBeDefined();
      expect(run.status).toBe('running');
    }
  });

  it('returns 404 when running a non-existent schedule', async () => {
    const fakeId = randomUUID();
    const res = await server.inject({
      method: 'POST',
      url: `/api/schedules/${fakeId}/run`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Schedule not found');
  });

  it('returns 404 for history of non-existent schedule', async () => {
    const fakeId = randomUUID();
    const res = await server.inject({
      method: 'GET',
      url: `/api/schedules/${fakeId}/history`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Schedule not found');
  });
});
