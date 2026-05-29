import { describe, it, expect, afterEach } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

function createTempDbPath(): string {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-server-test-'));
  return join(tmpDir, 'test-db.sqlite3');
}

describe('buildServer', () => {
  let cleanupDirs: string[] = [];

  afterEach(async () => {
    for (const dir of cleanupDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    cleanupDirs = [];
  });

  it('returns server and db instances', async () => {
    const dbPath = createTempDbPath();
    cleanupDirs.push(dbPath.replace(/[^/\\]+$/, ''));

    const { server, db } = await buildServer({ databasePath: dbPath });

    expect(server).toBeDefined();
    expect(db).toBeDefined();
    expect(typeof db.pragma).toBe('function');

    await server.close();
    db.close();
  });

  it('GET /health returns status ok', async () => {
    const dbPath = createTempDbPath();
    cleanupDirs.push(dbPath.replace(/[^/\\]+$/, ''));

    const { server, db } = await buildServer({ databasePath: dbPath });

    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();

    await server.close();
    db.close();
  });

  it('SQLite connection has WAL mode enabled', async () => {
    const dbPath = createTempDbPath();
    cleanupDirs.push(dbPath.replace(/[^/\\]+$/, ''));

    const { server, db } = await buildServer({ databasePath: dbPath });

    const result = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
    expect(result[0].journal_mode).toBe('wal');

    await server.close();
    db.close();
  });

  it('creates expected tables after migration', async () => {
    const dbPath = createTempDbPath();
    cleanupDirs.push(dbPath.replace(/[^/\\]+$/, ''));

    const { server, db } = await buildServer({ databasePath: dbPath });

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('tasks');
    expect(tableNames).toContain('steps');
    expect(tableNames).toContain('logs');

    await server.close();
    db.close();
  });

  it('creates expected indexes after migration', async () => {
    const dbPath = createTempDbPath();
    cleanupDirs.push(dbPath.replace(/[^/\\]+$/, ''));

    const { server, db } = await buildServer({ databasePath: dbPath });

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_steps_task_id');
    expect(indexNames).toContain('idx_logs_task_id');
    expect(indexNames).toContain('idx_tasks_status');

    await server.close();
    db.close();
  });
});

describe('API key authentication', () => {
  let cleanupDirs: string[] = [];

  afterEach(async () => {
    for (const dir of cleanupDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    cleanupDirs = [];
  });

  it('allows all requests when no apiKey is configured', async () => {
    const dbPath = createTempDbPath();
    cleanupDirs.push(dbPath.replace(/[^/\\]+$/, ''));
    const { server, db } = await buildServer({ databasePath: dbPath });

    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);

    await server.close();
    db.close();
  });

  it('returns 401 when apiKey is set but no header provided', async () => {
    const dbPath = createTempDbPath();
    cleanupDirs.push(dbPath.replace(/[^/\\]+$/, ''));
    const { server, db } = await buildServer({ databasePath: dbPath, apiKey: 'test-secret' });

    const res = await server.inject({ method: 'GET', url: '/api/tasks' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Unauthorized');

    await server.close();
    db.close();
  });

  it('allows request when correct x-api-key header is provided', async () => {
    const dbPath = createTempDbPath();
    cleanupDirs.push(dbPath.replace(/[^/\\]+$/, ''));
    const { server, db } = await buildServer({ databasePath: dbPath, apiKey: 'test-secret' });

    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { 'x-api-key': 'test-secret' },
    });
    expect(res.statusCode).toBe(200);

    await server.close();
    db.close();
  });

  it('skips auth for /health even when apiKey is set', async () => {
    const dbPath = createTempDbPath();
    cleanupDirs.push(dbPath.replace(/[^/\\]+$/, ''));
    const { server, db } = await buildServer({ databasePath: dbPath, apiKey: 'test-secret' });

    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);

    await server.close();
    db.close();
  });

  it('skips auth for /api/stream paths even when apiKey is set', async () => {
    const dbPath = createTempDbPath();
    cleanupDirs.push(dbPath.replace(/[^/\\]+$/, ''));
    const { server, db } = await buildServer({ databasePath: dbPath, apiKey: 'test-secret' });

    // SSE endpoint with invalid UUID should get 400 (validation), not 401 (auth)
    const res = await server.inject({
      method: 'GET',
      url: '/api/stream/tasks/not-a-uuid',
    });
    expect(res.statusCode).toBe(400);

    await server.close();
    db.close();
  });
});

describe('config overrides', () => {
  let cleanupDirs: string[] = [];

  afterEach(async () => {
    for (const dir of cleanupDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    cleanupDirs = [];
  });

  it('starts successfully with minimal config', async () => {
    const dbPath = createTempDbPath();
    cleanupDirs.push(dbPath.replace(/[^/\\]+$/, ''));

    const { server, db } = await buildServer({ databasePath: dbPath });
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);

    await server.close();
    db.close();
  });
});
