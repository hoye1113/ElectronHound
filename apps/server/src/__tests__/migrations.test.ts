import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../db/migrations.js';

describe('Database Migrations', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'eata-migration-test-'));
    db = new Database(join(tmpDir, 'test.sqlite3'));
    db.pragma('journal_mode = WAL');
    runMigrations(db);
  });

  afterAll(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Table creation ────────────────────────────────────────────────────

  it('creates tasks table', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  it('creates steps table', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='steps'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  it('creates logs table', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='logs'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  it('creates batches table', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='batches'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  it('creates templates table', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='templates'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  it('creates report_templates table', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='report_templates'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  // ── Index creation ────────────────────────────────────────────────────

  it('creates idx_steps_task_id index', () => {
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_steps_task_id'")
      .all() as Array<{ name: string }>;
    expect(indexes).toHaveLength(1);
  });

  it('creates idx_logs_task_id index', () => {
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_logs_task_id'")
      .all() as Array<{ name: string }>;
    expect(indexes).toHaveLength(1);
  });

  it('creates idx_tasks_status index', () => {
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_tasks_status'")
      .all() as Array<{ name: string }>;
    expect(indexes).toHaveLength(1);
  });

  it('creates idx_report_templates_is_default index', () => {
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_report_templates_is_default'")
      .all() as Array<{ name: string }>;
    expect(indexes).toHaveLength(1);
  });

  it('creates idx_templates_category index', () => {
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_templates_category'")
      .all() as Array<{ name: string }>;
    expect(indexes).toHaveLength(1);
  });

  it('creates idx_templates_built_in index', () => {
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_templates_built_in'")
      .all() as Array<{ name: string }>;
    expect(indexes).toHaveLength(1);
  });

  // ── Foreign key enforcement ───────────────────────────────────────────

  it('enforces foreign key from steps.task_id to tasks.id', () => {
    // Insert a valid task first
    db.prepare(
      "INSERT INTO tasks (id, goal, target_app_path, llm_model) VALUES ('task-fk-1', 'test', '/app', 'gpt-4o')"
    ).run();

    // Inserting a step with valid task_id should succeed
    expect(() => {
      db.prepare(
        "INSERT INTO steps (id, task_id, step_index, phase, status) VALUES ('step-fk-1', 'task-fk-1', 0, 'plan', 'pending')"
      ).run();
    }).not.toThrow();

    // Inserting a step with invalid task_id should fail
    expect(() => {
      db.prepare(
        "INSERT INTO steps (id, task_id, step_index, phase, status) VALUES ('step-fk-bad', 'nonexistent', 0, 'plan', 'pending')"
      ).run();
    }).toThrow();
  });

  it('enforces foreign key from logs.task_id to tasks.id', () => {
    // Inserting a log with valid task_id should succeed
    expect(() => {
      db.prepare(
        "INSERT INTO logs (task_id, level, message) VALUES ('task-fk-1', 'info', 'test log')"
      ).run();
    }).not.toThrow();

    // Inserting a log with invalid task_id should fail
    expect(() => {
      db.prepare(
        "INSERT INTO logs (task_id, level, message) VALUES ('nonexistent', 'info', 'bad log')"
      ).run();
    }).toThrow();
  });

  it('enforces foreign key from tasks.batch_id to batches.id', () => {
    // Insert a valid batch
    db.prepare(
      "INSERT INTO batches (id, total_tasks) VALUES ('batch-fk-1', 5)"
    ).run();

    // Inserting a task with valid batch_id should succeed
    expect(() => {
      db.prepare(
        "INSERT INTO tasks (id, goal, target_app_path, llm_model, batch_id) VALUES ('task-fk-batch', 'test', '/app', 'gpt-4o', 'batch-fk-1')"
      ).run();
    }).not.toThrow();

    // Inserting a task with invalid batch_id should fail
    expect(() => {
      db.prepare(
        "INSERT INTO tasks (id, goal, target_app_path, llm_model, batch_id) VALUES ('task-fk-bad', 'test', '/app', 'gpt-4o', 'nonexistent')"
      ).run();
    }).toThrow();
  });

  // ── Incremental migrations ────────────────────────────────────────────

  it('runMigrations returns true for a fresh database', () => {
    const freshDir = mkdtempSync(join(tmpdir(), 'eata-migration-fresh-'));
    const freshDb = new Database(join(freshDir, 'fresh.sqlite3'));
    const result = runMigrations(freshDb);
    expect(result).toBe(true);
    freshDb.close();
    rmSync(freshDir, { recursive: true, force: true });
  });

  it('runMigrations returns false when tables already exist', () => {
    const result = runMigrations(db);
    expect(result).toBe(false);
  });

  it('is idempotent — running migrations twice does not duplicate tables', () => {
    const countBefore = db
      .prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .get() as { cnt: number };

    runMigrations(db);

    const countAfter = db
      .prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .get() as { cnt: number };

    expect(countAfter.cnt).toBe(countBefore.cnt);
  });

  it('adds provider_id column to tasks table via incremental migration', () => {
    const columns = db
      .prepare('PRAGMA table_info(tasks)')
      .all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('provider_id');
  });

  it('adds batch_id column to tasks table via incremental migration', () => {
    const columns = db
      .prepare('PRAGMA table_info(tasks)')
      .all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('batch_id');
  });

  // ── Column structure ──────────────────────────────────────────────────

  it('tasks table has expected columns', () => {
    const columns = db
      .prepare('PRAGMA table_info(tasks)')
      .all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('goal');
    expect(columnNames).toContain('target_app_path');
    expect(columnNames).toContain('llm_model');
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('created_at');
    expect(columnNames).toContain('updated_at');
  });

  it('templates table has category CHECK constraint', () => {
    // Valid category should succeed
    expect(() => {
      db.prepare(
        `INSERT INTO templates (id, name, category, goal) VALUES ('tpl-check-valid', 'test', 'login', 'test goal')`
      ).run();
    }).not.toThrow();

    // Invalid category should fail
    expect(() => {
      db.prepare(
        `INSERT INTO templates (id, name, category, goal) VALUES ('tpl-check-bad', 'test', 'invalid_category', 'test goal')`
      ).run();
    }).toThrow();
  });
});
