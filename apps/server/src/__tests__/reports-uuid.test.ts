import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../server.js';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-reports-uuid-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

describe('Reports Routes - UUID Validation', () => {
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
    try {
      rmSync(cleanupDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

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
      url: '/api/tasks/550e8400-e29b-41d4-a716-446655440000/report',
    });
    // 404 is expected (report not found) — validation passed
    expect(res.statusCode).toBe(404);
  });

  it('valid UUID with uppercase passes validation', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/550E8400-E29B-41D4-A716-446655440000/report',
    });
    // 404 is expected (report not found) — validation passed
    expect(res.statusCode).toBe(404);
  });

  it('rejects IDs containing path traversal segments', async () => {
    // Use a URL-encoded path traversal attempt that stays within the route pattern
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/..%2F..%2Fetc%2Fpasswd/report',
    });
    // The decoded ID contains '..' which is not a valid UUID, so it should be rejected
    expect(res.statusCode).toBe(400);
  });
});
