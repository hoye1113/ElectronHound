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
    // Cleanup temp directories
    for (const dir of cleanupDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
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
