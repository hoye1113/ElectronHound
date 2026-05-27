import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

describe('GET /metrics', () => {
  let server: Awaited<ReturnType<typeof buildServer>>['server'];
  let db: Awaited<ReturnType<typeof buildServer>>['db'];
  let cleanupDir: string;

  beforeAll(async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'eata-metrics-test-'));
    cleanupDir = tmpDir;
    const dbPath = join(tmpDir, 'test-db.sqlite3');
    const result = await buildServer({ databasePath: dbPath });
    server = result.server;
    db = result.db;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    rmSync(cleanupDir, { recursive: true, force: true });
  });

  it('returns 200 OK', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/metrics',
    });
    expect(response.statusCode).toBe(200);
  });

  it('returns text/plain content type', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/metrics',
    });
    expect(response.headers['content-type']).toContain('text/plain');
  });

  it('contains prom-client metrics', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/metrics',
    });
    expect(response.payload).toContain('eata_tasks_total');
    expect(response.payload).toContain('eata_workers_active');
    expect(response.payload).toContain('eata_sse_connections');
  });

  it('contains process metrics', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/metrics',
    });
    expect(response.payload).toContain('process_cpu_user_seconds_total');
    expect(response.payload).toContain('process_resident_memory_bytes');
  });
});
