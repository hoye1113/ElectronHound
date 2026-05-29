import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-fewshot-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

const sampleExample = {
  goal: 'Test login functionality',
  steps: [
    { action: 'Navigate to login page', observation: 'Login form is displayed' },
    { action: 'Enter credentials', observation: 'Fields are filled' },
    { action: 'Click login button', observation: 'Redirected to dashboard' },
  ],
  expectedResult: 'User is successfully logged in',
  metadata: {
    tags: ['login', 'authentication'],
    domain: 'web-app',
    difficulty: 'easy' as const,
  },
};

const sampleExample2 = {
  goal: 'Test file upload',
  steps: [
    { action: 'Open file dialog', observation: 'File picker appears' },
    { action: 'Select file', observation: 'File is selected' },
  ],
  expectedResult: 'File is uploaded successfully',
  metadata: {
    tags: ['file', 'upload'],
    domain: 'desktop-app',
    difficulty: 'medium' as const,
  },
};

describe('Few-Shot Routes', () => {
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

  beforeEach(() => {
    db.prepare('DELETE FROM few_shot_examples').run();
  });

  describe('GET /api/few-shot', () => {
    it('returns empty array when no examples exist', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/few-shot' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('returns all examples', async () => {
      // Create two examples
      await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: sampleExample,
      });
      await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: sampleExample2,
      });

      const res = await server.inject({ method: 'GET', url: '/api/few-shot' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(2);
      expect(body.total).toBe(2);
    });

    it('returns examples with correct structure', async () => {
      await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: sampleExample,
      });

      const res = await server.inject({ method: 'GET', url: '/api/few-shot' });
      const body = JSON.parse(res.body);
      const example = body.data[0];

      expect(example.id).toBeDefined();
      expect(example.goal).toBe(sampleExample.goal);
      expect(example.steps).toEqual(sampleExample.steps);
      expect(example.expectedResult).toBe(sampleExample.expectedResult);
      expect(example.metadata).toEqual(sampleExample.metadata);
      expect(example.createdAt).toBeDefined();
      expect(example.updatedAt).toBeDefined();
    });

    it('filters examples by search term', async () => {
      await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: sampleExample,
      });
      await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: sampleExample2,
      });

      const res = await server.inject({ method: 'GET', url: '/api/few-shot?search=login' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(1);
      expect(body.data[0].goal).toBe('Test login functionality');
    });

    it('filters examples by domain', async () => {
      await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: sampleExample,
      });
      await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: sampleExample2,
      });

      const res = await server.inject({ method: 'GET', url: '/api/few-shot?domain=desktop-app' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(1);
      expect(body.data[0].goal).toBe('Test file upload');
    });

    it('filters examples by difficulty', async () => {
      await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: sampleExample,
      });
      await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: sampleExample2,
      });

      const res = await server.inject({ method: 'GET', url: '/api/few-shot?difficulty=medium' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(1);
      expect(body.data[0].goal).toBe('Test file upload');
    });

    it('combines multiple filters', async () => {
      await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: sampleExample,
      });
      await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: sampleExample2,
      });

      const res = await server.inject({
        method: 'GET',
        url: '/api/few-shot?domain=web-app&difficulty=easy',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(1);
      expect(body.data[0].goal).toBe('Test login functionality');
    });

    it('returns empty array for non-matching search', async () => {
      await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: sampleExample,
      });

      const res = await server.inject({ method: 'GET', url: '/api/few-shot?search=nonexistent' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(0);
      expect(body.total).toBe(0);
    });
  });

  describe('POST /api/few-shot', () => {
    it('creates a new example', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: sampleExample,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(body.goal).toBe(sampleExample.goal);
      expect(body.steps).toEqual(sampleExample.steps);
      expect(body.expectedResult).toBe(sampleExample.expectedResult);
      expect(body.metadata).toEqual(sampleExample.metadata);
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
    });

    it('creates an example with custom ID', async () => {
      const customId = 'custom-fewshot-id';
      const res = await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: { ...sampleExample, id: customId },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(customId);
    });

    it('returns 400 for missing required fields', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: { goal: 'Test' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Validation failed');
    });

    it('returns 400 for empty goal', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: { ...sampleExample, goal: '' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Validation failed');
    });

    it('returns 400 for empty steps array', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: { ...sampleExample, steps: [] },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Validation failed');
    });

    it('returns 400 for step missing action', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: {
          ...sampleExample,
          steps: [{ observation: 'Test' }],
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for step missing observation', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: {
          ...sampleExample,
          steps: [{ action: 'Test' }],
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid difficulty', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: {
          ...sampleExample,
          metadata: { ...sampleExample.metadata, difficulty: 'invalid' },
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for missing expectedResult', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: {
          goal: 'Test',
          steps: [{ action: 'Test', observation: 'Test' }],
          metadata: sampleExample.metadata,
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT /api/few-shot/:id', () => {
    it('updates an existing example', async () => {
      // First create an example
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: sampleExample,
      });
      const created = JSON.parse(createRes.body);

      // Then update it
      const updateRes = await server.inject({
        method: 'PUT',
        url: `/api/few-shot/${created.id}`,
        payload: {
          goal: 'Updated login test',
          metadata: {
            tags: ['login', 'updated'],
            domain: 'web-app',
            difficulty: 'hard' as const,
          },
        },
      });

      expect(updateRes.statusCode).toBe(200);
      const body = JSON.parse(updateRes.body);
      expect(body.goal).toBe('Updated login test');
      expect(body.metadata.difficulty).toBe('hard');
      expect(body.metadata.tags).toContain('updated');
    });

    it('returns 404 for non-existent example', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: '/api/few-shot/nonexistent',
        payload: { goal: 'Test' },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Example not found');
    });

    it('returns 400 for invalid update data', async () => {
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: sampleExample,
      });
      const created = JSON.parse(createRes.body);

      const res = await server.inject({
        method: 'PUT',
        url: `/api/few-shot/${created.id}`,
        payload: { goal: '' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Validation failed');
    });
  });

  describe('DELETE /api/few-shot/:id', () => {
    it('deletes an existing example', async () => {
      // First create an example
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: sampleExample,
      });
      const created = JSON.parse(createRes.body);

      // Then delete it
      const deleteRes = await server.inject({
        method: 'DELETE',
        url: `/api/few-shot/${created.id}`,
      });

      expect(deleteRes.statusCode).toBe(204);

      // Verify it's gone
      const getRes = await server.inject({
        method: 'GET',
        url: `/api/few-shot`,
      });
      const body = JSON.parse(getRes.body);
      expect(body.data.length).toBe(0);
    });

    it('returns 404 for non-existent example', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/api/few-shot/nonexistent',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Example not found');
    });
  });

  describe('POST /api/few-shot/migrate', () => {
    it('imports multiple examples', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/few-shot/migrate',
        payload: {
          examples: [sampleExample, sampleExample2],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.imported).toBe(2);
      expect(body.skipped).toBe(0);

      // Verify examples were created
      const listRes = await server.inject({ method: 'GET', url: '/api/few-shot' });
      const listBody = JSON.parse(listRes.body);
      expect(listBody.data.length).toBe(2);
    });

    it('imports examples with custom IDs', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/few-shot/migrate',
        payload: {
          examples: [
            { ...sampleExample, id: 'migrate-1' },
            { ...sampleExample2, id: 'migrate-2' },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.imported).toBe(2);

      // Verify examples were created with custom IDs
      const listRes = await server.inject({ method: 'GET', url: '/api/few-shot' });
      const listBody = JSON.parse(listRes.body);
      const ids = listBody.data.map((e: { id: string }) => e.id);
      expect(ids).toContain('migrate-1');
      expect(ids).toContain('migrate-2');
    });

    it('replaces existing examples with same ID', async () => {
      // First create an example
      await server.inject({
        method: 'POST',
        url: '/api/few-shot',
        payload: { ...sampleExample, id: 'replace-test' },
      });

      // Then migrate with same ID but different data
      const res = await server.inject({
        method: 'POST',
        url: '/api/few-shot/migrate',
        payload: {
          examples: [
            { ...sampleExample2, id: 'replace-test' },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.imported).toBe(1);

      // Verify the example was replaced
      const listRes = await server.inject({ method: 'GET', url: '/api/few-shot' });
      const listBody = JSON.parse(listRes.body);
      expect(listBody.data.length).toBe(1);
      expect(listBody.data[0].goal).toBe(sampleExample2.goal);
    });

    it('returns 400 for invalid migrate data', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/few-shot/migrate',
        payload: {
          examples: [{ goal: 'Invalid' }],
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Validation failed');
    });

    it('returns 400 when exceeding max examples limit', async () => {
      const examples = Array.from({ length: 501 }, (_, i) => ({
        ...sampleExample,
        goal: `Example ${i}`,
      }));

      const res = await server.inject({
        method: 'POST',
        url: '/api/few-shot/migrate',
        payload: { examples },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Error handling', () => {
    it('returns 400 for invalid ID format in PUT', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: '/api/few-shot/',
        payload: { goal: 'Test' },
      });

      // Fastify returns 404 for missing param, but let's check
      expect([400, 404]).toContain(res.statusCode);
    });

    it('returns 400 for invalid ID format in DELETE', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/api/few-shot/',
      });

      // Fastify returns 404 for missing param, but let's check
      expect([400, 404]).toContain(res.statusCode);
    });
  });
});
