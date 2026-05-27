import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../apps/server/src/server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance;
let db: Database.Database;
let cleanupDir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-e2e-dashboard-'));
  cleanupDir = tmpDir;
  process.chdir(tmpDir);

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
  process.chdir(originalCwd);
  try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('Dashboard E2E: Task Creation Flow', () => {
  it('creates a task via POST and retrieves it via GET', async () => {
    // Step 1: Create a task
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        goal: 'Click the Settings button',
        targetAppPath: '/path/to/app',
        llmModel: 'gpt-4o',
        maxSteps: 10,
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    expect(created.id).toBeDefined();
    expect(created.goal).toBe('Click the Settings button');
    expect(created.targetAppPath).toBe('/path/to/app');
    expect(created.llmModel).toBe('gpt-4o');
    expect(created.maxSteps).toBe(10);
    expect(created.status).toBe('queued');
    expect(created.stepCount).toBe(0);
    expect(created.createdAt).toBeDefined();
    expect(created.updatedAt).toBeDefined();

    // Step 2: Retrieve the task
    const getRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/${created.id}`,
    });

    expect(getRes.statusCode).toBe(200);
    const body = JSON.parse(getRes.body);
    expect(body.task).toBeDefined();
    expect(body.task.id).toBe(created.id);
    expect(body.task.goal).toBe('Click the Settings button');
    expect(body.steps).toBeDefined();
    expect(Array.isArray(body.steps)).toBe(true);
  });

  it('creates a task with minimal required fields', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        goal: 'Test minimal task',
        targetAppPath: '/test/app',
        llmModel: 'gpt-4o',
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    expect(created.id).toBeDefined();
    expect(created.goal).toBe('Test minimal task');
    expect(created.maxSteps).toBe(50); // default
  });

  it('returns 400 when goal is missing', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        targetAppPath: '/path/to/app',
        llmModel: 'gpt-4o',
      },
    });

    expect(createRes.statusCode).toBe(400);
    const body = JSON.parse(createRes.body);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });
});

describe('Dashboard E2E: Task Monitoring', () => {
  it('lists all created tasks', async () => {
    // Create two tasks
    await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { goal: 'Task One', targetAppPath: '/app', llmModel: 'gpt-4o' },
    });
    await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { goal: 'Task Two', targetAppPath: '/app', llmModel: 'gpt-4o' },
    });

    // List tasks
    const listRes = await server.inject({ method: 'GET', url: '/api/tasks' });
    expect(listRes.statusCode).toBe(200);
    const body = JSON.parse(listRes.body);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it('filters tasks by status', async () => {
    // Insert tasks directly with known statuses to avoid worker pool interference
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 50, 0, ?, ?)`
    ).run('manual-queued', 'Queued task', '/app', 'gpt-4o', now, now);

    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'running', 50, 0, ?, ?)`
    ).run('manual-running', 'Running task', '/app', 'gpt-4o', now, now);

    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'completed', 50, 5, ?, ?)`
    ).run('manual-completed', 'Completed task', '/app', 'gpt-4o', now, now);

    // Filter by queued status
    const queuedRes = await server.inject({ method: 'GET', url: '/api/tasks?status=queued' });
    const queuedBody = JSON.parse(queuedRes.body);
    expect(queuedBody.data.length).toBe(1);
    expect(queuedBody.data[0].id).toBe('manual-queued');

    // Filter by running status
    const runningRes = await server.inject({ method: 'GET', url: '/api/tasks?status=running' });
    const runningBody = JSON.parse(runningRes.body);
    expect(runningBody.data.length).toBe(1);
    expect(runningBody.data[0].id).toBe('manual-running');

    // Filter by completed status
    const completedRes = await server.inject({ method: 'GET', url: '/api/tasks?status=completed' });
    const completedBody = JSON.parse(completedRes.body);
    expect(completedBody.data.length).toBe(1);
    expect(completedBody.data[0].id).toBe('manual-completed');
  });

  it('supports pagination', async () => {
    // Create 5 tasks
    for (let i = 0; i < 5; i++) {
      await server.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: { goal: `Pagination task ${i}`, targetAppPath: '/app', llmModel: 'gpt-4o' },
      });
    }

    // Page 1 with limit 2
    const page1 = await server.inject({ method: 'GET', url: '/api/tasks?limit=2&page=1' });
    const body1 = JSON.parse(page1.body);
    expect(body1.data.length).toBe(2);
    expect(body1.total).toBe(5);
    expect(body1.page).toBe(1);
    expect(body1.limit).toBe(2);

    // Page 2 with limit 2
    const page2 = await server.inject({ method: 'GET', url: '/api/tasks?limit=2&page=2' });
    const body2 = JSON.parse(page2.body);
    expect(body2.data.length).toBe(2);
    expect(body2.page).toBe(2);
  });

  it('monitors task with steps', async () => {
    // Create a task
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { goal: 'Monitored task', targetAppPath: '/app', llmModel: 'gpt-4o' },
    });
    expect(createRes.statusCode).toBe(201);
    const { id } = JSON.parse(createRes.body);

    // Insert steps directly (simulating task execution)
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO steps (id, task_id, step_index, phase, status, observation, timestamp, duration)
       VALUES (?, ?, ?, 'observe', 'success', 'Found button', ?, 150)`
    ).run(`${id}-step-0`, id, 0, now);

    db.prepare(
      `INSERT INTO steps (id, task_id, step_index, phase, status, observation, timestamp, duration)
       VALUES (?, ?, ?, 'execute', 'success', 'Clicked button', ?, 200)`
    ).run(`${id}-step-1`, id, 1, now);

    // Update task status
    db.prepare("UPDATE tasks SET status = 'running', step_count = 2 WHERE id = ?").run(id);

    // Retrieve and verify steps
    const getRes = await server.inject({ method: 'GET', url: `/api/tasks/${id}` });
    expect(getRes.statusCode).toBe(200);
    const body = JSON.parse(getRes.body);
    expect(body.task.stepCount).toBe(2);
    expect(body.steps.length).toBe(2);
    expect(body.steps[0].phase).toBe('observe');
    expect(body.steps[0].observation).toBe('Found button');
    expect(body.steps[1].phase).toBe('execute');
  });
});

describe('Dashboard E2E: Report Viewing', () => {
  it('returns 404 when no report exists', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/550e8400-e29b-41d4-a716-446655440099/report',
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Report or manifest not found');
  });

  it('returns report manifest when report directory exists', async () => {
    const reportId = '550e8400-e29b-41d4-a716-446655440001';
    const reportDir = join('data', 'reports', reportId);
    mkdirSync(reportDir, { recursive: true });

    const manifest = {
      taskId: reportId,
      goal: 'Test report goal',
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

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${reportId}/report`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.taskId).toBe(reportId);
    expect(body.goal).toBe('Test report goal');
    expect(body.totalSteps).toBe(5);
    expect(body.passedSteps).toBe(4);
  });

  it('generates HTML report for an existing task', async () => {
    // Create a task with steps
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { goal: 'HTML report task', targetAppPath: '/app', llmModel: 'gpt-4o' },
    });
    const { id } = JSON.parse(createRes.body);

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO steps (id, task_id, step_index, phase, status, observation, timestamp, duration)
       VALUES (?, ?, 0, 'observe', 'success', 'Found element', ?, 100)`
    ).run(`${id}-step-0`, id, now);

    const htmlRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/${id}/report/html`,
    });

    expect(htmlRes.statusCode).toBe(200);
    expect(htmlRes.headers['content-type']).toContain('text/html');
    expect(htmlRes.body).toContain('HTML report task');
    expect(htmlRes.body).toContain('Found element');
  });
});

describe('Dashboard E2E: Batch Operations', () => {
  it('creates a batch and retrieves batch status', async () => {
    // Step 1: Create a batch with 3 tasks
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'E2E Dashboard Batch',
        tasks: [
          { goal: 'Click login button' },
          { goal: 'Fill in username field' },
          { goal: 'Submit the form' },
        ],
        priority: 'high',
      },
    });

    expect(createRes.statusCode).toBe(201);
    const batchResult = JSON.parse(createRes.body);
    expect(batchResult.batchId).toBeDefined();
    expect(batchResult.taskIds).toHaveLength(3);
    expect(batchResult.totalTasks).toBe(3);

    // Step 2: Retrieve batch status
    const statusRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/batch/${batchResult.batchId}`,
    });

    expect(statusRes.statusCode).toBe(200);
    const batch = JSON.parse(statusRes.body);
    expect(batch.id).toBe(batchResult.batchId);
    expect(batch.name).toBe('E2E Dashboard Batch');
    expect(batch.totalTasks).toBe(3);
    expect(batch.tasks).toHaveLength(3);
    expect(batch.priority).toBe('high');
    expect(batch.progress).toBeDefined();

    // Verify each task has the correct goal
    const goals = batch.tasks.map((t: { goal: string }) => t.goal);
    expect(goals).toContain('Click login button');
    expect(goals).toContain('Fill in username field');
    expect(goals).toContain('Submit the form');
  });

  it('returns 404 for non-existent batch', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/batch/550e8400-e29b-41d4-a716-446655440000',
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Batch not found');
  });

  it('returns 400 for empty tasks array', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Empty Batch',
        tasks: [],
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Dashboard E2E: Template Usage', () => {
  it('lists built-in templates', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/templates' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // Built-in templates should be present
    const names = body.data.map((t: { name: string }) => t.name);
    expect(names).toContain('Login Flow');
    expect(names).toContain('CRUD Operations');
    expect(names).toContain('Form Validation');
  });

  it('retrieves a specific template by ID', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/templates/builtin-login-flow' });
    expect(res.statusCode).toBe(200);
    const template = JSON.parse(res.body);
    expect(template.id).toBe('builtin-login-flow');
    expect(template.name).toBe('Login Flow');
    expect(template.category).toBe('login');
    expect(template.goal).toBeDefined();
    expect(template.builtIn).toBe(true);
  });

  it('creates a custom template', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/templates',
      payload: {
        name: 'Custom E2E Template',
        category: 'custom',
        goal: 'Test custom template goal',
        description: 'A custom template for E2E testing',
      },
    });
    expect(res.statusCode).toBe(201);
    const template = JSON.parse(res.body);
    expect(template.name).toBe('Custom E2E Template');
    expect(template.category).toBe('custom');
    expect(template.builtIn).toBe(false);
    expect(template.id).toBeDefined();
  });

  it('filters templates by category', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/templates?category=login' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBeGreaterThan(0);
    for (const template of body.data) {
      expect(template.category).toBe('login');
    }
  });

  it('uses a template goal to create a task', async () => {
    // Step 1: Get a template
    const templateRes = await server.inject({ method: 'GET', url: '/api/templates/builtin-form-validation' });
    expect(templateRes.statusCode).toBe(200);
    const template = JSON.parse(templateRes.body);

    // Step 2: Create a task using the template's goal
    const taskRes = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        goal: template.goal,
        targetAppPath: '/test/app',
        llmModel: 'gpt-4o' as const,
      },
    });

    expect(taskRes.statusCode).toBe(201);
    const task = JSON.parse(taskRes.body);
    expect(task.goal).toBe(template.goal);
    expect(task.status).toBe('queued');
  });
});

describe('Dashboard E2E: Task Cancellation', () => {
  it('cancels a queued task', async () => {
    // Insert task directly to avoid worker pool changing its status
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 50, 0, ?, ?)`
    ).run('cancel-test-task', 'Task to cancel', '/app', 'gpt-4o', now, now);

    // Cancel the task
    const cancelRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/cancel-test-task/cancel',
    });

    expect(cancelRes.statusCode).toBe(200);
    const cancelled = JSON.parse(cancelRes.body);
    expect(cancelled.status).toBe('cancelled');

    // Verify task is cancelled
    const getRes = await server.inject({ method: 'GET', url: '/api/tasks/cancel-test-task' });
    const body = JSON.parse(getRes.body);
    expect(body.task.status).toBe('cancelled');
  });

  it('returns 409 for already completed task', async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'completed', 50, 0, ?, ?)`
    ).run('done-task', 'Done', '/app', 'gpt-4o', now, now);

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/done-task/cancel',
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task is not in a cancellable state');
  });
});

describe('Dashboard E2E: Export Functionality', () => {
  it('exports a task as JSON', async () => {
    // Create a task
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { goal: 'Exportable task', targetAppPath: '/app', llmModel: 'gpt-4o' },
    });
    const { id } = JSON.parse(createRes.body);

    // Export as JSON
    const exportRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/${id}/export/json`,
    });

    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers['content-type']).toContain('application/json');
    const exported = JSON.parse(exportRes.body);
    expect(exported.task).toBeDefined();
    expect(exported.task.goal).toBe('Exportable task');
    expect(exported.steps).toBeDefined();
    expect(Array.isArray(exported.steps)).toBe(true);
  });

  it('exports a task as CSV', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { goal: 'CSV export task', targetAppPath: '/app', llmModel: 'gpt-4o' },
    });
    expect(createRes.statusCode).toBe(201);
    const { id } = JSON.parse(createRes.body);

    const exportRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/${id}/export/csv`,
    });

    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/csv');
    expect(exportRes.body).toContain('task_id');
    expect(exportRes.body).toContain('task_status');
  });

  it('exports a task as HTML', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { goal: 'HTML export task', targetAppPath: '/app', llmModel: 'gpt-4o' },
    });
    expect(createRes.statusCode).toBe(201);
    const { id } = JSON.parse(createRes.body);

    const exportRes = await server.inject({
      method: 'GET',
      url: `/api/tasks/${id}/export/html`,
    });

    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/html');
    expect(exportRes.body).toContain('HTML export task');
  });

  it('returns 404 for exporting non-existent task', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/550e8400-e29b-41d4-a716-446655440000/export/json',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('Dashboard E2E: Health Check', () => {
  it('returns healthy status', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});
