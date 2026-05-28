import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_TEMPLATE_ID } from '../db/seeds/report-templates.js';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-report-templates-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

const VALID_TEMPLATE_PAYLOAD = {
  name: 'Custom Report',
  description: 'A custom report template',
  sections: [
    { id: 'sec-1', type: 'summary', title: 'Summary', enabled: true, order: 1 },
    { id: 'sec-2', type: 'steps', title: 'Steps', enabled: true, order: 2 },
  ],
  styling: {
    theme: 'light',
    primaryColor: '#3b82f6',
  },
};

describe('Report Template Routes', () => {
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

  describe('GET /api/report-templates', () => {
    it('returns the default template after seeding', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/report-templates' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toBeDefined();
      expect(body.data.length).toBeGreaterThanOrEqual(1);

      const defaultTpl = body.data.find((t: Record<string, unknown>) => t.isDefault === true);
      expect(defaultTpl).toBeDefined();
      expect(defaultTpl.id).toBe(DEFAULT_TEMPLATE_ID);
      expect(defaultTpl.name).toBe('Default');
    });

    it('returns templates with correct structure', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/report-templates' });

      const body = JSON.parse(res.body);
      const template = body.data[0];
      expect(template.id).toBeDefined();
      expect(template.name).toBeDefined();
      expect(template.sections).toBeDefined();
      expect(Array.isArray(template.sections)).toBe(true);
      expect(template.styling).toBeDefined();
      expect(typeof template.isDefault).toBe('boolean');
    });
  });

  describe('GET /api/report-templates/:id', () => {
    it('returns the default template by ID', async () => {
      const res = await server.inject({ method: 'GET', url: `/api/report-templates/${DEFAULT_TEMPLATE_ID}` });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(DEFAULT_TEMPLATE_ID);
      expect(body.name).toBe('Default');
      expect(body.sections).toHaveLength(7);
    });

    it('returns 404 for non-existent template', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/report-templates/00000000-0000-0000-0000-999999999999',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Template not found');
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/report-templates/not-a-uuid' });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/report-templates', () => {
    it('creates a new template', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/report-templates',
        payload: VALID_TEMPLATE_PAYLOAD,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Custom Report');
      expect(body.description).toBe('A custom report template');
      expect(body.sections).toHaveLength(2);
      expect(body.isDefault).toBe(false);
      expect(body.styling.theme).toBe('light');
      expect(body.styling.primaryColor).toBe('#3b82f6');
    });

    it('returns 400 for missing required fields', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/report-templates',
        payload: { name: 'Incomplete' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Validation failed');
    });

    it('returns 400 for empty sections array', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/report-templates',
        payload: {
          name: 'No Sections',
          sections: [],
          styling: { theme: 'light', primaryColor: '#3b82f6' },
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid primaryColor format', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/report-templates',
        payload: {
          name: 'Bad Color',
          sections: [{ id: 'sec-1', type: 'summary', title: 'Summary', enabled: true, order: 1 }],
          styling: { theme: 'light', primaryColor: 'red' },
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT /api/report-templates/:id', () => {
    it('updates template name', async () => {
      // Create a custom template first
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/report-templates',
        payload: VALID_TEMPLATE_PAYLOAD,
      });
      const created = JSON.parse(createRes.body);

      const res = await server.inject({
        method: 'PUT',
        url: `/api/report-templates/${created.id}`,
        payload: { name: 'Updated Template Name' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.name).toBe('Updated Template Name');
      expect(body.id).toBe(created.id);
    });

    it('updates template styling', async () => {
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/report-templates',
        payload: VALID_TEMPLATE_PAYLOAD,
      });
      const created = JSON.parse(createRes.body);

      const res = await server.inject({
        method: 'PUT',
        url: `/api/report-templates/${created.id}`,
        payload: {
          styling: { theme: 'dark', primaryColor: '#ef4444' },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.styling.theme).toBe('dark');
      expect(body.styling.primaryColor).toBe('#ef4444');
    });

    it('returns 404 for non-existent template', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: '/api/report-templates/00000000-0000-0000-0000-999999999999',
        payload: { name: 'Nope' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('can update the default template (non-destructive fields)', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: `/api/report-templates/${DEFAULT_TEMPLATE_ID}`,
        payload: { description: 'Updated description' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.description).toBe('Updated description');
      expect(body.isDefault).toBe(true);
    });
  });

  describe('DELETE /api/report-templates/:id', () => {
    it('deletes a custom template', async () => {
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/report-templates',
        payload: VALID_TEMPLATE_PAYLOAD,
      });
      const created = JSON.parse(createRes.body);

      const deleteRes = await server.inject({
        method: 'DELETE',
        url: `/api/report-templates/${created.id}`,
      });
      expect(deleteRes.statusCode).toBe(204);

      // Verify gone
      const getRes = await server.inject({
        method: 'GET',
        url: `/api/report-templates/${created.id}`,
      });
      expect(getRes.statusCode).toBe(404);
    });

    it('cannot delete the default template', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/api/report-templates/${DEFAULT_TEMPLATE_ID}`,
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Cannot delete');
    });

    it('returns 404 for non-existent template', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/api/report-templates/00000000-0000-0000-0000-999999999999',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('Default template seeding', () => {
    it('seeds a default template with 7 sections', async () => {
      const res = await server.inject({ method: 'GET', url: `/api/report-templates/${DEFAULT_TEMPLATE_ID}` });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.sections).toHaveLength(7);

      const sectionTypes = body.sections.map((s: Record<string, unknown>) => s.type);
      expect(sectionTypes).toContain('summary');
      expect(sectionTypes).toContain('steps');
      expect(sectionTypes).toContain('screenshots');
      expect(sectionTypes).toContain('errors');
      expect(sectionTypes).toContain('performance');
      expect(sectionTypes).toContain('suggestions');
      expect(sectionTypes).toContain('raw');
    });

    it('raw data section is disabled by default', async () => {
      const res = await server.inject({ method: 'GET', url: `/api/report-templates/${DEFAULT_TEMPLATE_ID}` });

      const body = JSON.parse(res.body);
      const rawSection = body.sections.find((s: Record<string, unknown>) => s.type === 'raw');
      expect(rawSection).toBeDefined();
      expect(rawSection.enabled).toBe(false);
    });

    it('default template uses light theme', async () => {
      const res = await server.inject({ method: 'GET', url: `/api/report-templates/${DEFAULT_TEMPLATE_ID}` });

      const body = JSON.parse(res.body);
      expect(body.styling.theme).toBe('light');
      expect(body.styling.primaryColor).toBe('#3b82f6');
    });
  });

  describe('POST /api/reports/:reportId/generate', () => {
    it('returns 404 for non-existent report/task', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/reports/00000000-0000-0000-0000-999999999999/generate',
        payload: {},
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Task not found');
    });

    it('generates HTML report for existing task with default template', async () => {
      // Insert a task directly into the database
      const taskId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      db.prepare(
        `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, step_count, result_summary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).run(taskId, 'Test goal', '/path/to/app', 'gpt-4o', 'completed', 2, JSON.stringify({ success: true, summary: 'All good' }));

      // Insert a step
      db.prepare(
        `INSERT INTO steps (id, task_id, step_index, phase, status, observation, duration, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run('11111111-1111-1111-1111-111111111111', taskId, 0, 'observe', 'success', 'Observed the screen', 1000);

      const res = await server.inject({
        method: 'POST',
        url: `/api/reports/${taskId}/generate`,
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('<!DOCTYPE html>');
      expect(res.body).toContain('Test goal');
    });

    it('generates report with specified custom template', async () => {
      // Insert a task
      const taskId = 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff';
      db.prepare(
        `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, step_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).run(taskId, 'Custom template test', '/path/to/app', 'gpt-4o', 'completed', 0);

      // Create a custom template
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/report-templates',
        payload: {
          name: 'Minimal',
          sections: [
            { id: 'sec-1', type: 'summary', title: 'Overview', enabled: true, order: 1 },
          ],
          styling: { theme: 'dark', primaryColor: '#ef4444' },
        },
      });
      const template = JSON.parse(createRes.body);

      const res = await server.inject({
        method: 'POST',
        url: `/api/reports/${taskId}/generate`,
        payload: { templateId: template.id },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Overview');
      expect(res.body).toContain('#ef4444');
    });

    it('returns 400 for invalid templateId format', async () => {
      const taskId = 'aaaaaaaa-bbbb-cccc-dddd-aaaaaaaaaaaa';
      db.prepare(
        `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, step_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).run(taskId, 'Test', '/path', 'gpt-4o', 'completed', 0);

      const res = await server.inject({
        method: 'POST',
        url: `/api/reports/${taskId}/generate`,
        payload: { templateId: 'not-a-uuid' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 404 when specified template does not exist', async () => {
      const taskId = 'aaaaaaaa-bbbb-cccc-dddd-bbbbbbbbbbbb';
      db.prepare(
        `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, step_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).run(taskId, 'Test', '/path', 'gpt-4o', 'completed', 0);

      const res = await server.inject({
        method: 'POST',
        url: `/api/reports/${taskId}/generate`,
        payload: { templateId: '00000000-0000-0000-0000-999999999999' },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
