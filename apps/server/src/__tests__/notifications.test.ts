import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-notif-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

function resetDb(db: Database.Database) {
  db.prepare('DELETE FROM notification_log').run();
  db.prepare('DELETE FROM notification_config').run();
}

describe('Route: /api/notifications', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const built = await buildServer({ databasePath: dbPath });
    server = built.server;
    db = built.db;
  });

  afterAll(async () => {
    await server.close();
    try {
      rmSync(cleanupDir, { recursive: true, force: true });
    } catch {
      // Windows may lock SQLite files briefly
    }
  });

  beforeEach(() => {
    resetDb(db);
  });

  // ── GET /api/notifications/config ───────────────────────────────────

  describe('GET /api/notifications/config', () => {
    it('returns default config when none exists', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/notifications/config',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.webhookUrls).toEqual([]);
      expect(body.sseEnabled).toBe(true);
      expect(body.eventTypes).toEqual(
        expect.arrayContaining(['task.completed', 'task.failed', 'batch.completed']),
      );
    });

    it('returns existing config when one exists', async () => {
      // Create a config first
      await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: { webhookUrls: ['https://example.com/hook'] },
      });

      const res = await server.inject({
        method: 'GET',
        url: '/api/notifications/config',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.webhookUrls).toEqual(['https://example.com/hook']);
    });
  });

  // ── PUT /api/notifications/config ───────────────────────────────────

  describe('PUT /api/notifications/config', () => {
    it('updates webhook URLs', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: { webhookUrls: ['https://hooks.example.com/a', 'https://hooks.example.com/b'] },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.webhookUrls).toEqual([
        'https://hooks.example.com/a',
        'https://hooks.example.com/b',
      ]);
    });

    it('updates sseEnabled', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: { sseEnabled: false },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.sseEnabled).toBe(false);
    });

    it('updates event types', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: { eventTypes: ['task.completed', 'batch.failed'] },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.eventTypes).toEqual(['task.completed', 'batch.failed']);
    });

    it('returns 400 for invalid body', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: { webhookUrls: 'not-an-array' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── POST /api/notifications/test ────────────────────────────────────

  describe('POST /api/notifications/test', () => {
    it('returns error when no webhooks configured', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/notifications/test',
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toBeTruthy();
    });
  });

  // ── GET /api/notifications/history ──────────────────────────────────

  describe('GET /api/notifications/history', () => {
    it('returns empty array when no logs exist', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/notifications/history',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toEqual([]);
    });

    it('returns log entries after they are created', async () => {
      // Insert a log entry directly
      db.prepare(
        `INSERT INTO notification_log (id, event_type, channel, target, status, error, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        'test-log-1',
        'test',
        'webhook',
        'https://example.com',
        'sent',
        null,
        '{"type":"test"}',
      );

      const res = await server.inject({
        method: 'GET',
        url: '/api/notifications/history',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe('test-log-1');
      expect(body.data[0].eventType).toBe('test');
      expect(body.data[0].channel).toBe('webhook');
      expect(body.data[0].status).toBe('sent');
    });
  });
});
