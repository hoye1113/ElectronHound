/**
 * Storage Routes Tests
 *
 * Tests for the Fastify route handlers in storage.ts:
 * - GET  /api/storage          (disk usage stats)
 * - POST /api/storage/cleanup  (cleanup old files)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-storage-routes-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

describe('Storage Routes', () => {
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

  describe('GET /api/storage', () => {
    it('returns disk usage stats', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/storage',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('totalSize');
      expect(body).toHaveProperty('fileCount');
      expect(body).toHaveProperty('quota');
      expect(body).toHaveProperty('isOverQuota');
    });

    it('totalSize is a non-negative number', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/storage',
      });

      const body = JSON.parse(res.body);
      expect(typeof body.totalSize).toBe('number');
      expect(body.totalSize).toBeGreaterThanOrEqual(0);
    });

    it('fileCount is a non-negative integer', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/storage',
      });

      const body = JSON.parse(res.body);
      expect(typeof body.fileCount).toBe('number');
      expect(body.fileCount).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(body.fileCount)).toBe(true);
    });

    it('quota is a positive number', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/storage',
      });

      const body = JSON.parse(res.body);
      expect(typeof body.quota).toBe('number');
      expect(body.quota).toBeGreaterThan(0);
    });

    it('isOverQuota is a boolean', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/storage',
      });

      const body = JSON.parse(res.body);
      expect(typeof body.isOverQuota).toBe('boolean');
    });
  });

  describe('POST /api/storage/cleanup', () => {
    it('triggers cleanup and returns results', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/storage/cleanup',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('deletedCount');
      expect(body).toHaveProperty('totalSize');
      expect(body).toHaveProperty('fileCount');
    });

    it('deletedCount is a non-negative integer', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/storage/cleanup',
      });

      const body = JSON.parse(res.body);
      expect(typeof body.deletedCount).toBe('number');
      expect(body.deletedCount).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(body.deletedCount)).toBe(true);
    });

    it('totalSize after cleanup is non-negative', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/storage/cleanup',
      });

      const body = JSON.parse(res.body);
      expect(typeof body.totalSize).toBe('number');
      expect(body.totalSize).toBeGreaterThanOrEqual(0);
    });

    it('fileCount after cleanup is non-negative', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/storage/cleanup',
      });

      const body = JSON.parse(res.body);
      expect(typeof body.fileCount).toBe('number');
      expect(body.fileCount).toBeGreaterThanOrEqual(0);
    });

    it('multiple cleanup calls are idempotent', async () => {
      const res1 = await server.inject({
        method: 'POST',
        url: '/api/storage/cleanup',
      });
      const body1 = JSON.parse(res1.body);

      const res2 = await server.inject({
        method: 'POST',
        url: '/api/storage/cleanup',
      });
      const body2 = JSON.parse(res2.body);

      // Second cleanup should delete fewer or equal files
      expect(body2.deletedCount).toBeLessThanOrEqual(body1.deletedCount);
    });
  });
});
