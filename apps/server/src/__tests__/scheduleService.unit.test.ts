/**
 * ScheduleService Unit Tests
 *
 * Tests for the ScheduleService class methods:
 * - start / stop lifecycle
 * - execute (schedule execution)
 * - compareResults (result comparison)
 * - cron expression parsing via scheduleNext
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ScheduleService } from '../services/scheduleService.js';
import { randomUUID } from 'node:crypto';

// ── Helpers ─────────────────────────────────────────────────────────────────

function createTestDb(): Database.Database {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      template_id TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT,
      run_count INTEGER NOT NULL DEFAULT 0,
      last_status TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schedule_runs (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      task_id TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      summary TEXT,
      error TEXT,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      goal TEXT NOT NULL,
      built_in INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      goal TEXT NOT NULL,
      target_app_path TEXT,
      llm_model TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      max_steps INTEGER DEFAULT 50,
      step_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function insertTemplate(db: Database.Database, id?: string): string {
  const templateId = id ?? randomUUID();
  db.prepare(
    `INSERT INTO templates (id, name, category, goal, built_in, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))`
  ).run(templateId, 'Test Template', 'custom', 'Test goal');
  return templateId;
}

function insertSchedule(
  db: Database.Database,
  templateId: string,
  overrides?: Partial<{ id: string; name: string; cronExpression: string; enabled: number }>
): string {
  const id = overrides?.id ?? randomUUID();
  db.prepare(
    `INSERT INTO schedules (id, name, template_id, cron_expression, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run(
    id,
    overrides?.name ?? 'Test Schedule',
    templateId,
    overrides?.cronExpression ?? '0 9 * * *',
    overrides?.enabled ?? 1
  );
  return id;
}

function insertTask(
  db: Database.Database,
  overrides?: Partial<{ id: string; status: string; stepCount: number }>
): string {
  const id = overrides?.id ?? randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, step_count, created_at, updated_at)
     VALUES (?, 'test goal', '', '', ?, ?, ?, ?)`
  ).run(id, overrides?.status ?? 'completed', overrides?.stepCount ?? 5, now, now);
  return id;
}

function insertScheduleRun(
  db: Database.Database,
  scheduleId: string,
  taskId?: string
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO schedule_runs (id, schedule_id, task_id, started_at, status)
     VALUES (?, ?, ?, datetime('now'), 'completed')`
  ).run(id, scheduleId, taskId ?? null);
  return id;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ScheduleService', () => {
  let db: Database.Database;
  let service: ScheduleService;

  beforeEach(() => {
    db = createTestDb();
    service = new ScheduleService(db);
  });

  afterEach(() => {
    service.stop();
    db.close();
  });

  describe('start / stop lifecycle', () => {
    it('starts with no timers when no enabled schedules exist', () => {
      // Should not throw
      expect(() => service.start()).not.toThrow();
    });

    it('loads enabled schedules on start', () => {
      const templateId = insertTemplate(db);
      insertSchedule(db, templateId, { enabled: 1 });

      // start() calls scheduleNext for each enabled schedule
      // which requires cron-parser to parse the expression
      expect(() => service.start()).not.toThrow();
    });

    it('skips disabled schedules on start', () => {
      const templateId = insertTemplate(db);
      insertSchedule(db, templateId, { enabled: 0 });

      // Should not try to schedule disabled ones
      expect(() => service.start()).not.toThrow();
    });

    it('stop clears all timers without error', () => {
      const templateId = insertTemplate(db);
      insertSchedule(db, templateId, { enabled: 1 });
      service.start();

      expect(() => service.stop()).not.toThrow();
    });

    it('stop is safe to call multiple times', () => {
      service.start();
      service.stop();
      expect(() => service.stop()).not.toThrow();
    });
  });

  describe('compareResults', () => {
    it('returns null when current task does not exist', () => {
      const templateId = insertTemplate(db);
      const scheduleId = insertSchedule(db, templateId);

      const result = service.compareResults(scheduleId, 'nonexistent-task');
      expect(result).toBeNull();
    });

    it('returns null when no previous run exists', () => {
      const templateId = insertTemplate(db);
      const scheduleId = insertSchedule(db, templateId);
      const taskId = insertTask(db, { status: 'completed', stepCount: 5 });

      const result = service.compareResults(scheduleId, taskId);
      expect(result).toBeNull();
    });

    it('returns null when previous run has no task', () => {
      const templateId = insertTemplate(db);
      const scheduleId = insertSchedule(db, templateId);
      const currentTaskId = insertTask(db, { status: 'completed', stepCount: 5 });

      // Insert a previous run with no task_id
      insertScheduleRun(db, scheduleId, undefined);

      const result = service.compareResults(scheduleId, currentTaskId);
      expect(result).toBeNull();
    });

    it('detects improvement when status goes from failed to completed', () => {
      const templateId = insertTemplate(db);
      const scheduleId = insertSchedule(db, templateId);

      const previousTaskId = insertTask(db, { status: 'failed', stepCount: 10 });
      insertScheduleRun(db, scheduleId, previousTaskId);

      const currentTaskId = insertTask(db, { status: 'completed', stepCount: 5 });

      const result = service.compareResults(scheduleId, currentTaskId);

      expect(result).not.toBeNull();
      expect(result!.improved).toBe(true);
      expect(result!.regressed).toBe(false);
      expect(result!.currentStatus).toBe('completed');
      expect(result!.previousStatus).toBe('failed');
    });

    it('detects regression when status goes from completed to failed', () => {
      const templateId = insertTemplate(db);
      const scheduleId = insertSchedule(db, templateId);

      const previousTaskId = insertTask(db, { status: 'completed', stepCount: 5 });
      insertScheduleRun(db, scheduleId, previousTaskId);

      const currentTaskId = insertTask(db, { status: 'failed', stepCount: 10 });

      const result = service.compareResults(scheduleId, currentTaskId);

      expect(result).not.toBeNull();
      expect(result!.regressed).toBe(true);
      expect(result!.improved).toBe(false);
      expect(result!.currentStatus).toBe('failed');
      expect(result!.previousStatus).toBe('completed');
    });

    it('detects step count regression when steps increased significantly', () => {
      const templateId = insertTemplate(db);
      const scheduleId = insertSchedule(db, templateId);

      const previousTaskId = insertTask(db, { status: 'completed', stepCount: 5 });
      insertScheduleRun(db, scheduleId, previousTaskId);

      // Step count increased from 5 to 20 (>50% + 5 threshold)
      const currentTaskId = insertTask(db, { status: 'completed', stepCount: 20 });

      const result = service.compareResults(scheduleId, currentTaskId);

      expect(result).not.toBeNull();
      expect(result!.regressed).toBe(true);
      expect(result!.currentStepCount).toBe(20);
      expect(result!.previousStepCount).toBe(5);
    });

    it('detects step count improvement when steps decreased significantly', () => {
      const templateId = insertTemplate(db);
      const scheduleId = insertSchedule(db, templateId);

      const previousTaskId = insertTask(db, { status: 'completed', stepCount: 20 });
      insertScheduleRun(db, scheduleId, previousTaskId);

      // Step count decreased from 20 to 5 (>50% + 5 threshold)
      const currentTaskId = insertTask(db, { status: 'completed', stepCount: 5 });

      const result = service.compareResults(scheduleId, currentTaskId);

      expect(result).not.toBeNull();
      expect(result!.improved).toBe(true);
      expect(result!.regressed).toBe(false);
    });

    it('returns neither improved nor regressed for similar results', () => {
      const templateId = insertTemplate(db);
      const scheduleId = insertSchedule(db, templateId);

      const previousTaskId = insertTask(db, { status: 'completed', stepCount: 5 });
      insertScheduleRun(db, scheduleId, previousTaskId);

      const currentTaskId = insertTask(db, { status: 'completed', stepCount: 6 });

      const result = service.compareResults(scheduleId, currentTaskId);

      expect(result).not.toBeNull();
      expect(result!.improved).toBe(false);
      expect(result!.regressed).toBe(false);
      expect(result!.currentStatus).toBe('completed');
      expect(result!.previousStatus).toBe('completed');
    });

    it('returns details string with status and step info', () => {
      const templateId = insertTemplate(db);
      const scheduleId = insertSchedule(db, templateId);

      const previousTaskId = insertTask(db, { status: 'completed', stepCount: 5 });
      insertScheduleRun(db, scheduleId, previousTaskId);

      const currentTaskId = insertTask(db, { status: 'failed', stepCount: 10 });

      const result = service.compareResults(scheduleId, currentTaskId);

      expect(result).not.toBeNull();
      expect(result!.details).toContain('completed');
      expect(result!.details).toContain('failed');
      expect(result!.details).toContain('5');
      expect(result!.details).toContain('10');
    });
  });

  describe('execute', () => {
    it('creates a task and schedule run for a valid schedule', async () => {
      const templateId = insertTemplate(db);
      const scheduleId = insertSchedule(db, templateId, { name: 'Test Execute' });

      await service.execute(scheduleId);

      // Check task was created
      const tasks = db.prepare('SELECT * FROM tasks').all() as Array<Record<string, unknown>>;
      expect(tasks.length).toBe(1);
      expect(tasks[0].status).toBe('queued');
      expect(tasks[0].goal).toBe('Test goal');

      // Check schedule run was recorded
      const runs = db.prepare('SELECT * FROM schedule_runs').all() as Array<Record<string, unknown>>;
      expect(runs.length).toBe(1);
      expect(runs[0].schedule_id).toBe(scheduleId);
      expect(runs[0].status).toBe('running');

      // Check schedule stats updated
      const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(scheduleId) as Record<string, unknown>;
      expect(schedule.run_count).toBe(1);
      expect(schedule.last_run_at).not.toBeNull();
      expect(schedule.last_status).toBe('running');
    });

    it('does nothing for non-existent schedule', async () => {
      await service.execute('nonexistent-schedule-id');

      const tasks = db.prepare('SELECT * FROM tasks').all();
      expect(tasks.length).toBe(0);
    });

    it('returns early when template is missing (no run recorded)', async () => {
      const scheduleId = randomUUID();
      db.prepare(
        `INSERT INTO schedules (id, name, template_id, cron_expression, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
      ).run(scheduleId, 'Missing Template Schedule', 'nonexistent-template', '0 9 * * *');

      await service.execute(scheduleId);

      // When template is missing, execute returns early without recording a run
      const runs = db.prepare('SELECT * FROM schedule_runs').all() as Array<Record<string, unknown>>;
      expect(runs.length).toBe(0);

      // No task should be created
      const tasks = db.prepare('SELECT * FROM tasks').all();
      expect(tasks.length).toBe(0);
    });

    it('increments run_count on each execution', async () => {
      const templateId = insertTemplate(db);
      const scheduleId = insertSchedule(db, templateId);

      await service.execute(scheduleId);
      await service.execute(scheduleId);

      const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(scheduleId) as Record<string, unknown>;
      expect(schedule.run_count).toBe(2);
    });

    it('links task_id in schedule_runs', async () => {
      const templateId = insertTemplate(db);
      const scheduleId = insertSchedule(db, templateId);

      await service.execute(scheduleId);

      const runs = db.prepare('SELECT * FROM schedule_runs').all() as Array<Record<string, unknown>>;
      expect(runs[0].task_id).not.toBeNull();

      // The task should exist
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(runs[0].task_id) as Record<string, unknown>;
      expect(task).toBeDefined();
      expect(task.goal).toBe('Test goal');
    });
  });

  describe('getNotificationService', () => {
    it('returns a NotificationService instance', () => {
      const ns = service.getNotificationService();
      expect(ns).toBeDefined();
      expect(typeof ns.send).toBe('function');
    });

    it('returns the same instance on multiple calls', () => {
      const ns1 = service.getNotificationService();
      const ns2 = service.getNotificationService();
      expect(ns1).toBe(ns2);
    });
  });
});
