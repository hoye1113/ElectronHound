import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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

describe('Route: /api/notifications additional coverage', () => {
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

  // ── GET /api/notifications/config additional paths ────────────────────

  describe('GET /api/notifications/config', () => {
    it('creates default config with correct default values', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/notifications/config',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.id).toBeDefined();
      expect(body.webhookUrls).toEqual([]);
      expect(body.sseEnabled).toBe(true);
      expect(body.eventTypes).toContain('task.completed');
      expect(body.eventTypes).toContain('task.failed');
      expect(body.eventTypes).toContain('batch.completed');
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
    });

    it('returns same config on second GET', async () => {
      // First call creates the default
      const res1 = await server.inject({
        method: 'GET',
        url: '/api/notifications/config',
      });
      const body1 = JSON.parse(res1.payload);

      // Second call returns the same one
      const res2 = await server.inject({
        method: 'GET',
        url: '/api/notifications/config',
      });
      const body2 = JSON.parse(res2.payload);

      expect(body2.id).toBe(body1.id);
      expect(body2.webhookUrls).toEqual(body1.webhookUrls);
    });
  });

  // ── PUT /api/notifications/config additional paths ────────────────────

  describe('PUT /api/notifications/config', () => {
    it('creates default config before updating when none exists', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: { webhookUrls: ['https://new-hook.com'] },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.webhookUrls).toEqual(['https://new-hook.com']);
    });

    it('updates multiple fields at once', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: {
          webhookUrls: ['https://hook-a.com'],
          sseEnabled: false,
          eventTypes: ['task.completed'],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.webhookUrls).toEqual(['https://hook-a.com']);
      expect(body.sseEnabled).toBe(false);
      expect(body.eventTypes).toEqual(['task.completed']);
    });

    it('returns 400 for invalid webhook URL', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: { webhookUrls: ['not-a-url'] },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid sseEnabled type', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: { sseEnabled: 'yes' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid eventTypes type', async () => {
      const res = await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: { eventTypes: 'not-an-array' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('preserves unupdated fields', async () => {
      // Set webhookUrls first
      await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: { webhookUrls: ['https://keep-me.com'] },
      });

      // Update only sseEnabled
      const res = await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: { sseEnabled: false },
      });

      const body = JSON.parse(res.payload);
      expect(body.webhookUrls).toEqual(['https://keep-me.com']);
      expect(body.sseEnabled).toBe(false);
    });

    it('does nothing extra when update body has no recognized fields', async () => {
      // First create config
      await server.inject({
        method: 'GET',
        url: '/api/notifications/config',
      });

      // PUT with empty body should succeed (no updates to apply)
      const res = await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: {},
      });

      expect(res.statusCode).toBe(200);
    });
  });

  // ── POST /api/notifications/test additional paths ─────────────────────

  describe('POST /api/notifications/test', () => {
    it('returns error when config exists but no webhook URLs', async () => {
      // Create config via GET (defaults have empty webhook_urls)
      await server.inject({
        method: 'GET',
        url: '/api/notifications/config',
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/notifications/test',
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('No webhook URLs configured');
    });

    it('sends test webhook and logs success', async () => {
      // Configure a webhook URL
      await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: { webhookUrls: ['https://httpbin.org/post'] },
      });

      // Mock global fetch to succeed
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      try {
        const res = await server.inject({
          method: 'POST',
          url: '/api/notifications/test',
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(body.message).toContain('successfully');

        // Verify log entry was created
        const logRes = await server.inject({
          method: 'GET',
          url: '/api/notifications/history',
        });
        const logBody = JSON.parse(logRes.payload);
        expect(logBody.data.length).toBeGreaterThanOrEqual(1);
        const testLog = logBody.data.find((l: { eventType: string }) => l.eventType === 'test');
        expect(testLog).toBeDefined();
        expect(testLog.status).toBe('sent');
        expect(testLog.channel).toBe('webhook');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('handles webhook fetch failure (non-OK response)', async () => {
      await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: { webhookUrls: ['https://example.com/fail'] },
      });

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      try {
        const res = await server.inject({
          method: 'POST',
          url: '/api/notifications/test',
        });

        const body = JSON.parse(res.payload);
        expect(body.success).toBe(false);
        expect(body.message).toContain('failed');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('handles webhook fetch network error', async () => {
      await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: { webhookUrls: ['https://unreachable.example.com'] },
      });

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      try {
        const res = await server.inject({
          method: 'POST',
          url: '/api/notifications/test',
        });

        const body = JSON.parse(res.payload);
        expect(body.success).toBe(false);
        expect(body.message).toContain('ECONNREFUSED');

        // Verify failure was logged
        const logRes = await server.inject({
          method: 'GET',
          url: '/api/notifications/history',
        });
        const logBody = JSON.parse(logRes.payload);
        const failedLog = logBody.data.find((l: { status: string }) => l.status === 'failed');
        expect(failedLog).toBeDefined();
        expect(failedLog.error).toContain('ECONNREFUSED');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('handles non-Error fetch rejection', async () => {
      await server.inject({
        method: 'PUT',
        url: '/api/notifications/config',
        payload: { webhookUrls: ['https://example.com'] },
      });

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue('string error');

      try {
        const res = await server.inject({
          method: 'POST',
          url: '/api/notifications/test',
        });

        const body = JSON.parse(res.payload);
        expect(body.success).toBe(false);
        expect(body.message).toContain('string error');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  // ── GET /api/notifications/history additional paths ───────────────────

  describe('GET /api/notifications/history', () => {
    it('returns entries ordered by created_at DESC', async () => {
      db.prepare(
        `INSERT INTO notification_log (id, event_type, channel, target, status, error, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('log-1', 'test', 'webhook', 'https://a.com', 'sent', null, '{"type":"test"}', '2026-01-01T00:00:00Z');

      db.prepare(
        `INSERT INTO notification_log (id, event_type, channel, target, status, error, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('log-2', 'task.completed', 'webhook', 'https://b.com', 'sent', null, '{"type":"task"}', '2026-01-02T00:00:00Z');

      const res = await server.inject({
        method: 'GET',
        url: '/api/notifications/history',
      });

      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(2);
      // Most recent first
      expect(body.data[0].id).toBe('log-2');
      expect(body.data[1].id).toBe('log-1');
    });

    it('maps log fields correctly', async () => {
      db.prepare(
        `INSERT INTO notification_log (id, event_type, channel, target, status, error, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('log-map', 'task.failed', 'webhook', 'https://example.com', 'failed', 'Timeout', '{"taskId":"123"}');

      const res = await server.inject({
        method: 'GET',
        url: '/api/notifications/history',
      });

      const body = JSON.parse(res.payload);
      const entry = body.data[0];
      expect(entry.id).toBe('log-map');
      expect(entry.eventType).toBe('task.failed');
      expect(entry.channel).toBe('webhook');
      expect(entry.target).toBe('https://example.com');
      expect(entry.status).toBe('failed');
      expect(entry.error).toBe('Timeout');
      expect(entry.payload).toEqual({ taskId: '123' });
      expect(entry.createdAt).toBeDefined();
    });

    it('handles null payload correctly', async () => {
      db.prepare(
        `INSERT INTO notification_log (id, event_type, channel, target, status, error, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('log-null', 'test', 'sse', null, 'sent', null, null);

      const res = await server.inject({
        method: 'GET',
        url: '/api/notifications/history',
      });

      const body = JSON.parse(res.payload);
      expect(body.data[0].payload).toBeNull();
      expect(body.data[0].target).toBeNull();
      expect(body.data[0].error).toBeNull();
    });

    it('handles many entries (respects limit 50)', async () => {
      // Insert 55 entries
      const stmt = db.prepare(
        `INSERT INTO notification_log (id, event_type, channel, target, status, error, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (let i = 0; i < 55; i++) {
        stmt.run(`log-${i}`, 'test', 'webhook', 'https://example.com', 'sent', null, null);
      }

      const res = await server.inject({
        method: 'GET',
        url: '/api/notifications/history',
      });

      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(50);
    });
  });
});
