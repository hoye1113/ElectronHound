import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';

describe('Token Usage Audit', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;
  let testTaskId: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'eata-audit-test-'));
    cleanupDir = tmpDir;
    const dbPath = join(tmpDir, 'test-db.sqlite3');
    const result = await buildServer({ databasePath: dbPath });
    server = result.server;
    db = result.db;

    // Create a test task for foreign key constraint
    testTaskId = randomUUID();
    db.prepare(`
      INSERT INTO tasks (id, goal, target_app_path, llm_model, status, created_at, updated_at)
      VALUES (?, 'Test goal', '/path/to/app', 'gpt-4o', 'completed', datetime('now'), datetime('now'))
    `).run(testTaskId);
  });

  afterAll(async () => {
    await server.close();
    db.close();
    rmSync(cleanupDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Clean up token_usage table before each test
    db.prepare('DELETE FROM token_usage').run();
  });

  describe('POST /api/audit/tokens', () => {
    it('records token usage', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/audit/tokens',
        payload: {
          task_id: testTaskId,
          provider: 'openai',
          model: 'gpt-4o',
          prompt_tokens: 100,
          completion_tokens: 50,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.task_id).toBe(testTaskId);
      expect(body.provider).toBe('openai');
      expect(body.model).toBe('gpt-4o');
      expect(body.prompt_tokens).toBe(100);
      expect(body.completion_tokens).toBe(50);
      expect(body.id).toBeDefined();
      expect(body.created_at).toBeDefined();
    });

    it('validates required fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/audit/tokens',
        payload: {
          task_id: testTaskId,
          // Missing provider, model, etc.
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('validates task_id is UUID', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/audit/tokens',
        payload: {
          task_id: 'not-a-uuid',
          provider: 'openai',
          model: 'gpt-4o',
          prompt_tokens: 100,
          completion_tokens: 50,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/audit/tokens', () => {
    beforeEach(async () => {
      // Insert test data
      const insertStmt = db.prepare(`
        INSERT INTO token_usage (task_id, provider, model, prompt_tokens, completion_tokens, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(testTaskId, 'openai', 'gpt-4o', 100, 50, '2026-05-01 10:00:00');
      insertStmt.run(testTaskId, 'openai', 'gpt-4o', 200, 100, '2026-05-02 10:00:00');
      insertStmt.run(testTaskId, 'deepseek', 'deepseek-chat', 150, 75, '2026-05-02 15:00:00');
      insertStmt.run(testTaskId, 'openai', 'gpt-4o', 300, 150, '2026-05-03 10:00:00');
    });

    it('returns all records without filters', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/tokens',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.records).toHaveLength(4);
      expect(body.total).toBe(4);
      expect(body.summary.total_tokens).toBe(100 + 50 + 200 + 100 + 150 + 75 + 300 + 150);
      expect(body.summary.record_count).toBe(4);
    });

    it('filters by date range', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/tokens?start_date=2026-05-02&end_date=2026-05-02',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.records).toHaveLength(2);
      expect(body.total).toBe(2);
    });

    it('filters by provider', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/tokens?provider=deepseek',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.records).toHaveLength(1);
      expect(body.records[0].provider).toBe('deepseek');
    });

    it('returns by_provider aggregation', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/tokens',
      });

      const body = JSON.parse(response.payload);
      expect(body.by_provider).toBeDefined();
      expect(body.by_provider.length).toBeGreaterThan(0);

      // Should have openai and deepseek
      const providers = body.by_provider.map((p: { provider: string }) => p.provider);
      expect(providers).toContain('openai');
      expect(providers).toContain('deepseek');
    });

    it('returns by_day aggregation', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/tokens',
      });

      const body = JSON.parse(response.payload);
      expect(body.by_day).toBeDefined();
      expect(body.by_day.length).toBeGreaterThan(0);

      // Should have dates
      const dates = body.by_day.map((d: { date: string }) => d.date);
      expect(dates).toContain('2026-05-01');
      expect(dates).toContain('2026-05-02');
      expect(dates).toContain('2026-05-03');
    });

    it('paginates results', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/tokens?page=1&limit=2',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.records).toHaveLength(2);
      expect(body.total).toBe(4);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(2);
    });

    it('validates date format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/tokens?start_date=invalid-date',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/audit/tokens/task/:taskId', () => {
    beforeEach(async () => {
      const insertStmt = db.prepare(`
        INSERT INTO token_usage (task_id, provider, model, prompt_tokens, completion_tokens, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(testTaskId, 'openai', 'gpt-4o', 100, 50, '2026-05-01 10:00:00');
      insertStmt.run(testTaskId, 'deepseek', 'deepseek-chat', 200, 100, '2026-05-02 10:00:00');
    });

    it('returns usage for a specific task', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/api/audit/tokens/task/${testTaskId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].task_id).toBe(testTaskId);
    });

    it('returns 400 for invalid task ID', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/tokens/task/not-a-uuid',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/audit/tokens/providers', () => {
    beforeEach(async () => {
      const insertStmt = db.prepare(`
        INSERT INTO token_usage (task_id, provider, model, prompt_tokens, completion_tokens, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(testTaskId, 'openai', 'gpt-4o', 100, 50, '2026-05-01 10:00:00');
      insertStmt.run(testTaskId, 'deepseek', 'deepseek-chat', 200, 100, '2026-05-02 10:00:00');
    });

    it('returns list of providers', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/audit/tokens/providers',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toContain('openai');
      expect(body.data).toContain('deepseek');
    });
  });
});
