import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { buildServer } from '../server.js';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

// Mock readFile from node:fs/promises to control file access in tests
const { mockReadFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: mockReadFile };
});

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-reports-uuid-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

const VALID_ID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

describe('Reports Routes', () => {
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
    try {
      rmSync(cleanupDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  beforeEach(() => {
    db.prepare('DELETE FROM steps').run();
    db.prepare('DELETE FROM tasks').run();
    // Default: all readFile calls reject with ENOENT
    mockReadFile.mockReset();
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });

  function seedTask() {
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(VALID_ID, 'Test goal', '/app', 'gpt-4o', 'completed', 1, NOW, NOW);
  }

  function seedStep(index: number, screenshotPath: string | null = null) {
    db.prepare(
      `INSERT INTO steps (id, task_id, step_index, phase, status, screenshot_path, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(`step-${index}`, VALID_ID, index, 'observe', 'success', screenshotPath, NOW);
  }

  // ── UUID Validation ─────────────────────────────────────────────────

  describe('UUID validation', () => {
    it('GET /api/tasks/:id/report rejects non-UUID format', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/tasks/not-a-valid-uuid/report',
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Invalid task ID format');
    });

    it('GET /api/tasks/:id/report/html rejects non-UUID format', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/tasks/not-a-valid-uuid/report/html',
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Invalid task ID format');
    });

    it('GET /api/tasks/:id/steps/:stepIndex/screenshot rejects non-UUID format', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/tasks/not-a-valid-uuid/steps/0/screenshot',
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Invalid task ID format');
    });

    it('valid UUID passes validation (returns 404 since report does not exist)', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/api/tasks/${VALID_ID}/report`,
      });
      expect(res.statusCode).toBe(404);
    });

    it('valid UUID with uppercase passes validation', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/tasks/550E8400-E29B-41D4-A716-446655440000/report',
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects IDs containing path traversal segments', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/tasks/..%2F..%2Fetc%2Fpasswd/report',
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Route 1: GET /tasks/:id/report (manifest) ──────────────────────

  describe('GET /tasks/:id/report', () => {
    it('returns 404 when manifest file does not exist (ENOENT)', async () => {
      // mockReadFile default already rejects with ENOENT
      const res = await server.inject({
        method: 'GET',
        url: `/api/tasks/${VALID_ID}/report`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Report or manifest not found');
    });

    it('returns 200 with parsed JSON when manifest exists', async () => {
      const manifest = { version: 1, taskId: VALID_ID, generatedAt: NOW };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(manifest));

      const res = await server.inject({
        method: 'GET',
        url: `/api/tasks/${VALID_ID}/report`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.version).toBe(1);
      expect(body.taskId).toBe(VALID_ID);
    });
  });

  // ── Route 2: GET /tasks/:id/report/html ────────────────────────────

  describe('GET /tasks/:id/report/html', () => {
    it('returns 404 when task does not exist in database', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/api/tasks/${VALID_ID}/report/html`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Task not found');
    });

    it('returns 200 with HTML and correct headers when task exists', async () => {
      seedTask();
      seedStep(0);

      const res = await server.inject({
        method: 'GET',
        url: `/api/tasks/${VALID_ID}/report/html`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['content-disposition']).toContain(`report-${VALID_ID}.html`);
      expect(res.body).toContain('<!DOCTYPE html>');
      expect(res.body).toContain('Test goal');
    });
  });

  // ── Route 3: GET /tasks/:id/steps/:stepIndex/screenshot ────────────

  describe('GET /tasks/:id/steps/:stepIndex/screenshot', () => {
    it('returns 400 when step index exceeds 1000', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/api/tasks/${VALID_ID}/steps/1001/screenshot`,
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 404 when step does not exist in database', async () => {
      seedTask();

      const res = await server.inject({
        method: 'GET',
        url: `/api/tasks/${VALID_ID}/steps/0/screenshot`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Screenshot not found');
    });

    it('returns 404 when step exists but has no screenshot_path', async () => {
      seedTask();
      seedStep(0, null);

      const res = await server.inject({
        method: 'GET',
        url: `/api/tasks/${VALID_ID}/steps/0/screenshot`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Screenshot not found');
    });

    it('returns 200 with PNG and Cache-Control when screenshot file exists', async () => {
      seedTask();
      seedStep(0, 'screenshot-0.png');
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
      mockReadFile.mockResolvedValueOnce(pngBuffer);

      const res = await server.inject({
        method: 'GET',
        url: `/api/tasks/${VALID_ID}/steps/0/screenshot`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['cache-control']).toBe('public, max-age=31536000');
      expect(Buffer.from(res.rawPayload)).toEqual(pngBuffer);
    });

    it('returns 404 when screenshot file is missing from disk (ENOENT)', async () => {
      seedTask();
      seedStep(0, 'screenshot-0.png');
      // mockReadFile default already rejects with ENOENT

      const res = await server.inject({
        method: 'GET',
        url: `/api/tasks/${VALID_ID}/steps/0/screenshot`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Screenshot file not found');
    });
  });
});
