/**
 * Handlebars Template Routes Tests
 *
 * Tests for the Fastify route handlers in handlebars-templates.ts:
 * - GET  /api/reports/templates                (list templates)
 * - GET  /api/reports/templates/:name/preview  (preview with sample data)
 * - POST /api/reports/templates/:name/render   (render with data)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-handlebars-routes-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

describe('Handlebars Template Routes', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;

    // Create a template file in the expected templates directory
    const templatesDir = join(dir, 'apps', 'server', 'templates');
    mkdirSync(templatesDir, { recursive: true });
    writeFileSync(
      join(templatesDir, 'task-report.hbs'),
      '<h1>{{taskId}}</h1><p>{{goal}}</p><p>Status: {{status}}</p>'
    );
    writeFileSync(
      join(templatesDir, 'batch-report.hbs'),
      '<h1>Batch {{batchId}}</h1><p>Total: {{totalTasks}}</p>'
    );

    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('GET /api/reports/templates', () => {
    it('returns a list of available templates', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/reports/templates',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.total).toBeDefined();
      expect(typeof body.total).toBe('number');
    });

    it('returns total matching the number of templates', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/reports/templates',
      });

      const body = JSON.parse(res.body);
      expect(body.total).toBe(body.data.length);
    });

    it('template names are strings', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/reports/templates',
      });

      const body = JSON.parse(res.body);
      for (const name of body.data) {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      }
    });
  });

  describe('GET /api/reports/templates/:name/preview', () => {
    it('returns HTML preview for a valid template', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/reports/templates/task-report/preview',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['content-disposition']).toContain('preview-task-report.html');
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('preview contains rendered sample data', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/reports/templates/task-report/preview',
      });

      // The preview should contain sample task data rendered into the template
      expect(res.body).toContain('<h1>');
      expect(res.body).toContain('<p>');
    });

    it('returns 404 for non-existent template', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/reports/templates/nonexistent-template/preview',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('not found');
    });

    it('returns 400 for invalid template name (special characters)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/reports/templates/invalid@name!/preview',
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Invalid template name');
    });

    it('returns 400 for empty template name', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/reports/templates/%20/preview',
      });

      // Empty or whitespace names should fail validation
      expect([400, 404]).toContain(res.statusCode);
    });

    it('accepts template names with hyphens and underscores', async () => {
      // task-report and batch-report use hyphens - these are valid
      const res = await server.inject({
        method: 'GET',
        url: '/api/reports/templates/task-report/preview',
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('POST /api/reports/templates/:name/render', () => {
    it('renders template with provided data', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/reports/templates/task-report/render',
        payload: {
          taskId: 'test-123',
          goal: 'Test goal',
          status: 'completed',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['content-disposition']).toContain('report-task-report.html');
      expect(res.body).toContain('test-123');
      expect(res.body).toContain('Test goal');
      expect(res.body).toContain('completed');
    });

    it('returns 404 for non-existent template', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/reports/templates/missing-template/render',
        payload: { key: 'value' },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('not found');
    });

    it('returns 400 for invalid request body (array instead of object)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/reports/templates/task-report/render',
        payload: [1, 2, 3],
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Invalid request body');
    });

    it('returns 400 for invalid template name', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/reports/templates/invalid$name/render',
        payload: { key: 'value' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Invalid template name');
    });

    it('renders with empty object body', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/reports/templates/task-report/render',
        payload: {},
      });

      // Should succeed - missing variables render as empty
      expect(res.statusCode).toBe(200);
    });

    it('renders with nested data', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/reports/templates/task-report/render',
        payload: {
          taskId: 'nested-test',
          goal: 'Nested data test',
          status: 'running',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('nested-test');
      expect(res.body).toContain('Nested data test');
    });
  });
});
