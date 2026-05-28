import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-templates-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

describe('Template Routes', () => {
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

  describe('GET /api/templates', () => {
    it('returns all templates including built-in ones', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/templates' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toBeDefined();
      expect(body.total).toBe(6); // 6 built-in templates
      expect(body.data.length).toBe(6);
    });

    it('returns templates with correct structure', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/templates' });

      const body = JSON.parse(res.body);
      const template = body.data[0];
      expect(template.id).toBeDefined();
      expect(template.name).toBeDefined();
      expect(template.category).toBeDefined();
      expect(template.goal).toBeDefined();
      expect(template.builtIn).toBe(true);
      expect(template.createdAt).toBeDefined();
      expect(template.updatedAt).toBeDefined();
    });

    it('filters templates by category', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/templates?category=login' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(1);
      expect(body.data[0].category).toBe('login');
      expect(body.data[0].name).toBe('Login Flow');
    });

    it('filters templates by search term', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/templates?search=CRUD' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(1);
      expect(body.data[0].name).toBe('CRUD Operations');
    });

    it('returns empty array for non-matching search', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/templates?search=nonexistent' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(0);
      expect(body.total).toBe(0);
    });
  });

  describe('GET /api/templates/:id', () => {
    it('returns a specific template', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/templates/builtin-login-flow' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe('builtin-login-flow');
      expect(body.name).toBe('Login Flow');
      expect(body.category).toBe('login');
    });

    it('returns 404 for non-existent template', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/templates/nonexistent' });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Template not found');
    });
  });

  describe('POST /api/templates', () => {
    it('creates a custom template', async () => {
      const newTemplate = {
        name: 'Custom Test',
        description: 'A custom test template',
        category: 'custom',
        goal: 'Test custom functionality',
        variables: ['var1', 'var2'],
      };

      const res = await server.inject({
        method: 'POST',
        url: '/api/templates',
        payload: newTemplate,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Custom Test');
      expect(body.category).toBe('custom');
      expect(body.builtIn).toBe(false);
      expect(body.variables).toEqual(['var1', 'var2']);
    });

    it('creates template with config', async () => {
      const newTemplate = {
        name: 'Config Test',
        category: 'form',
        goal: 'Test with config',
        config: { steps: ['Step 1', 'Step 2'] },
      };

      const res = await server.inject({
        method: 'POST',
        url: '/api/templates',
        payload: newTemplate,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.config).toEqual({ steps: ['Step 1', 'Step 2'] });
    });

    it('returns 400 for invalid template data', async () => {
      const invalidTemplate = {
        name: '',
        category: 'invalid',
      };

      const res = await server.inject({
        method: 'POST',
        url: '/api/templates',
        payload: invalidTemplate,
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Validation failed');
    });

    it('returns 400 for missing required fields', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/templates',
        payload: { name: 'Test' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT /api/templates/:id', () => {
    it('updates a custom template', async () => {
      // First create a custom template
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/templates',
        payload: {
          name: 'To Update',
          category: 'custom',
          goal: 'Original goal',
        },
      });
      const created = JSON.parse(createRes.body);

      // Then update it
      const updateRes = await server.inject({
        method: 'PUT',
        url: `/api/templates/${created.id}`,
        payload: {
          name: 'Updated Name',
          goal: 'Updated goal',
        },
      });

      expect(updateRes.statusCode).toBe(200);
      const body = JSON.parse(updateRes.body);
      expect(body.name).toBe('Updated Name');
      expect(body.goal).toBe('Updated goal');
    });

    it('returns 403 when trying to update a built-in template', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: '/api/templates/builtin-login-flow',
        payload: { name: 'Modified' },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Cannot modify built-in templates');
    });

    it('returns 404 for non-existent template', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: '/api/templates/nonexistent',
        payload: { name: 'Test' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/templates/:id', () => {
    it('deletes a custom template', async () => {
      // First create a custom template
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/templates',
        payload: {
          name: 'To Delete',
          category: 'custom',
          goal: 'Will be deleted',
        },
      });
      const created = JSON.parse(createRes.body);

      // Then delete it
      const deleteRes = await server.inject({
        method: 'DELETE',
        url: `/api/templates/${created.id}`,
      });

      expect(deleteRes.statusCode).toBe(204);

      // Verify it's gone
      const getRes = await server.inject({
        method: 'GET',
        url: `/api/templates/${created.id}`,
      });
      expect(getRes.statusCode).toBe(404);
    });

    it('returns 403 when trying to delete a built-in template', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/api/templates/builtin-login-flow',
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Cannot delete built-in templates');
    });

    it('returns 404 for non-existent template', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/api/templates/nonexistent',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('Built-in templates data', () => {
    it('has all expected built-in templates', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/templates' });
      const body = JSON.parse(res.body);

      const templateNames = body.data.map((t: Record<string, unknown>) => t.name);
      expect(templateNames).toContain('Login Flow');
      expect(templateNames).toContain('CRUD Operations');
      expect(templateNames).toContain('Form Validation');
      expect(templateNames).toContain('Navigation Test');
      expect(templateNames).toContain('File Dialog');
      expect(templateNames).toContain('Settings Page');
    });

    it('built-in templates have correct categories', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/templates' });
      const body = JSON.parse(res.body);

      const templatesByCategory = body.data.reduce((acc: Record<string, string>, t: { category: string; name: string }) => {
        acc[t.category] = t.name;
        return acc;
      }, {});

      expect(templatesByCategory.login).toBe('Login Flow');
      expect(templatesByCategory.crud).toBe('CRUD Operations');
      expect(templatesByCategory.form).toBe('Form Validation');
      expect(templatesByCategory.navigation).toBe('Navigation Test');
      expect(templatesByCategory.file).toBe('File Dialog');
      expect(templatesByCategory.settings).toBe('Settings Page');
    });

    it('built-in templates have variables defined', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/templates/builtin-login-flow' });
      const body = JSON.parse(res.body);

      expect(body.variables).toBeDefined();
      expect(body.variables).toContain('formSelector');
      expect(body.variables).toContain('submitButton');
      expect(body.variables).toContain('validUser');
      expect(body.variables).toContain('validPass');
    });
  });
});
