import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import { scheduleRoutes } from '../routes/schedules.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-schedules-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

describe('Schedule Routes', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;
  let templateId: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;

    // Register schedule routes (since index.ts is not modified yet)
    await server.register(scheduleRoutes, { prefix: '/api' });
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => {
    // Clean up
    db.prepare('DELETE FROM schedule_runs').run();
    db.prepare('DELETE FROM schedules').run();
    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM steps').run();
    db.prepare('DELETE FROM templates WHERE built_in = 0').run();

    // Create a test template for schedule tests
    const existingTemplate = db
      .prepare('SELECT id FROM templates LIMIT 1')
      .get() as { id: string } | undefined;

    if (existingTemplate) {
      templateId = existingTemplate.id;
    } else {
      // Should not happen since buildServer seeds built-in templates
      const id = 'test-template-id';
      db.prepare(
        `INSERT INTO templates (id, name, category, goal, built_in, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))`
      ).run(id, 'Test Template', 'custom', 'Test goal');
      templateId = id;
    }
  });

  describe('POST /api/schedules', () => {
    it('creates a schedule with valid data', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: {
          name: 'Daily Login Test',
          templateId,
          cronExpression: '0 9 * * *',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Daily Login Test');
      expect(body.templateId).toBe(templateId);
      expect(body.cronExpression).toBe('0 9 * * *');
      expect(body.enabled).toBe(true);
      expect(body.runCount).toBe(0);
      expect(body.nextRunAt).toBeDefined();
      expect(body.createdAt).toBeDefined();
    });

    it('creates a schedule with enabled=false', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: {
          name: 'Disabled Schedule',
          templateId,
          cronExpression: '0 * * * *',
          enabled: false,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.enabled).toBe(false);
    });

    it('returns 400 for invalid cron expression', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: {
          name: 'Bad Cron',
          templateId,
          cronExpression: 'not-a-cron',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Invalid cron expression');
    });

    it('returns 400 for non-existent template', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: {
          name: 'Missing Template',
          templateId: 'nonexistent-template-id',
          cronExpression: '0 9 * * *',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Template not found');
    });

    it('returns 400 for missing required fields', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'Incomplete' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Validation failed');
    });

    it('returns 400 for empty name', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: {
          name: '',
          templateId,
          cronExpression: '0 9 * * *',
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/schedules', () => {
    it('returns empty list when no schedules exist', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/schedules' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('returns all schedules', async () => {
      // Create two schedules
      await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'Schedule 1', templateId, cronExpression: '0 9 * * *' },
      });
      await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'Schedule 2', templateId, cronExpression: '0 10 * * *' },
      });

      const res = await server.inject({ method: 'GET', url: '/api/schedules' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(2);
      expect(body.total).toBe(2);
    });

    it('filters by enabled=true', async () => {
      await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'Enabled', templateId, cronExpression: '0 9 * * *', enabled: true },
      });
      await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'Disabled', templateId, cronExpression: '0 10 * * *', enabled: false },
      });

      const res = await server.inject({ method: 'GET', url: '/api/schedules?enabled=true' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(1);
      expect(body.data[0].name).toBe('Enabled');
    });

    it('filters by enabled=false', async () => {
      await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'Enabled', templateId, cronExpression: '0 9 * * *', enabled: true },
      });
      await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'Disabled', templateId, cronExpression: '0 10 * * *', enabled: false },
      });

      const res = await server.inject({ method: 'GET', url: '/api/schedules?enabled=false' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(1);
      expect(body.data[0].name).toBe('Disabled');
    });
  });

  describe('GET /api/schedules/:id', () => {
    it('returns a specific schedule', async () => {
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'Specific Schedule', templateId, cronExpression: '0 9 * * *' },
      });
      const created = JSON.parse(createRes.body);

      const res = await server.inject({
        method: 'GET',
        url: `/api/schedules/${created.id}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(created.id);
      expect(body.name).toBe('Specific Schedule');
    });

    it('returns 404 for non-existent schedule', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/schedules/nonexistent-id',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Schedule not found');
    });
  });

  describe('PUT /api/schedules/:id', () => {
    it('updates a schedule name', async () => {
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'Original Name', templateId, cronExpression: '0 9 * * *' },
      });
      const created = JSON.parse(createRes.body);

      const res = await server.inject({
        method: 'PUT',
        url: `/api/schedules/${created.id}`,
        payload: { name: 'Updated Name' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.name).toBe('Updated Name');
      expect(body.cronExpression).toBe('0 9 * * *');
    });

    it('updates cron expression and recalculates next run', async () => {
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'Cron Update', templateId, cronExpression: '0 9 * * *' },
      });
      const created = JSON.parse(createRes.body);

      const res = await server.inject({
        method: 'PUT',
        url: `/api/schedules/${created.id}`,
        payload: { cronExpression: '0 18 * * *' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.cronExpression).toBe('0 18 * * *');
      expect(body.nextRunAt).toBeDefined();
    });

    it('updates enabled status', async () => {
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'Toggle', templateId, cronExpression: '0 9 * * *' },
      });
      const created = JSON.parse(createRes.body);

      const res = await server.inject({
        method: 'PUT',
        url: `/api/schedules/${created.id}`,
        payload: { enabled: false },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.enabled).toBe(false);
    });

    it('returns 400 for invalid cron on update', async () => {
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'Bad Update', templateId, cronExpression: '0 9 * * *' },
      });
      const created = JSON.parse(createRes.body);

      const res = await server.inject({
        method: 'PUT',
        url: `/api/schedules/${created.id}`,
        payload: { cronExpression: 'invalid-cron' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Invalid cron expression');
    });

    it('returns 400 for non-existent template on update', async () => {
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'Template Update', templateId, cronExpression: '0 9 * * *' },
      });
      const created = JSON.parse(createRes.body);

      const res = await server.inject({
        method: 'PUT',
        url: `/api/schedules/${created.id}`,
        payload: { templateId: 'nonexistent-template' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Template not found');
    });

    it('returns 404 for non-existent schedule', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: '/api/schedules/nonexistent-id',
        payload: { name: 'Test' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for validation failure', async () => {
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'Validate Me', templateId, cronExpression: '0 9 * * *' },
      });
      const created = JSON.parse(createRes.body);

      const res = await server.inject({
        method: 'PUT',
        url: `/api/schedules/${created.id}`,
        payload: { name: '' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/schedules/:id', () => {
    it('deletes a schedule', async () => {
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'To Delete', templateId, cronExpression: '0 9 * * *' },
      });
      const created = JSON.parse(createRes.body);

      const deleteRes = await server.inject({
        method: 'DELETE',
        url: `/api/schedules/${created.id}`,
      });

      expect(deleteRes.statusCode).toBe(204);

      // Verify it's gone
      const getRes = await server.inject({
        method: 'GET',
        url: `/api/schedules/${created.id}`,
      });
      expect(getRes.statusCode).toBe(404);
    });

    it('returns 404 for non-existent schedule', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/api/schedules/nonexistent-id',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/schedules/:id/run', () => {
    it('triggers immediate execution and returns 202', async () => {
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'Run Now', templateId, cronExpression: '0 9 * * *' },
      });
      const created = JSON.parse(createRes.body);

      const res = await server.inject({
        method: 'POST',
        url: `/api/schedules/${created.id}/run`,
      });

      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body);
      expect(body.taskId).toBeDefined();
      expect(body.runId).toBeDefined();
      expect(body.message).toBe('Schedule execution started');
    });

    it('increments run count after execution', async () => {
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'Count Test', templateId, cronExpression: '0 9 * * *' },
      });
      const created = JSON.parse(createRes.body);

      await server.inject({
        method: 'POST',
        url: `/api/schedules/${created.id}/run`,
      });

      const getRes = await server.inject({
        method: 'GET',
        url: `/api/schedules/${created.id}`,
      });
      const body = JSON.parse(getRes.body);
      expect(body.runCount).toBe(1);
      expect(body.lastRunAt).toBeDefined();
      expect(body.lastStatus).toBe('running');
    });

    it('returns 404 for non-existent schedule', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/schedules/nonexistent-id/run',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/schedules/:id/history', () => {
    it('returns empty history for new schedule', async () => {
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'History Test', templateId, cronExpression: '0 9 * * *' },
      });
      const created = JSON.parse(createRes.body);

      const res = await server.inject({
        method: 'GET',
        url: `/api/schedules/${created.id}/history`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('returns execution history after runs', async () => {
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/schedules',
        payload: { name: 'History Run', templateId, cronExpression: '0 9 * * *' },
      });
      const created = JSON.parse(createRes.body);

      // Trigger two runs
      await server.inject({
        method: 'POST',
        url: `/api/schedules/${created.id}/run`,
      });
      await server.inject({
        method: 'POST',
        url: `/api/schedules/${created.id}/run`,
      });

      const res = await server.inject({
        method: 'GET',
        url: `/api/schedules/${created.id}/history`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(2);
      expect(body.total).toBe(2);
      expect(body.data[0].scheduleId).toBe(created.id);
      expect(body.data[0].status).toBe('running');
      expect(body.data[0].taskId).toBeDefined();
    });

    it('returns 404 for non-existent schedule', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/schedules/nonexistent-id/history',
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
