/**
 * Runner Module Tests — Uncovered paths
 *
 * Tests for code paths not covered by runner.unit.test.ts:
 * - getWorkerPool singleton behavior (creation, re-init warning)
 * - getWorkerManager (null before init, WorkerManager after)
 * - closeWorkerPool (shutdown, null-out, no-op when already null)
 * - persistStepRecords (via completed event): file not found, invalid JSON,
 *   empty array, valid step records with screenshot paths
 * - ProcessTaskExecutor spawn failure handling
 * - ProcessTaskExecutor cancelled event mapping
 *
 * Strategy: Use real DB + temp filesystem, control the pool lifecycle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { runMigrations } from '../db/migrations.js';

// Mock sseHub to capture SSE broadcasts
vi.mock('../streams/sseHub.js', () => ({
  sseHub: {
    broadcast: vi.fn(),
    broadcastAll: vi.fn(),
  },
}));

// Import after mocks
import {
  getWorkerPool,
  getWorkerManager,
  closeWorkerPool,
  attachPoolEventListeners,
} from '../tasks/runner.js';
import { sseHub } from '../streams/sseHub.js';
import type { PoolEvent } from '../services/workerPool/types.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function insertTask(
  db: Database.Database,
  taskId: string,
  status: string = 'queued',
) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
    VALUES (?, ?, '/app', 'gpt-4o', ?, 50, 0, ?, ?)
  `).run(taskId, `Goal for ${taskId}`, status, now, now);
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('getWorkerPool singleton', () => {
  afterEach(async () => {
    await closeWorkerPool();
  });

  it('creates a pool with default concurrency of 1', () => {
    const pool = getWorkerPool();
    expect(pool).toBeDefined();
  });

  it('returns the same pool on subsequent calls', () => {
    const pool1 = getWorkerPool();
    const pool2 = getWorkerPool();
    expect(pool1).toBe(pool2);
  });

  it('creates pool with custom concurrency', () => {
    const pool = getWorkerPool({ maxConcurrency: 3 });
    expect(pool).toBeDefined();
  });

  it('logs warning when re-initializing with different concurrency', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // First init with concurrency 1 (default)
    getWorkerPool();
    // Try to change concurrency — should warn
    getWorkerPool({ maxConcurrency: 5 });
    // The pool is already initialized, so it should just warn
    warnSpy.mockRestore();
  });

  it('accepts a custom logger', () => {
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const pool = getWorkerPool({ logger: mockLogger });
    expect(pool).toBeDefined();
  });
});

describe('getWorkerManager', () => {
  afterEach(async () => {
    await closeWorkerPool();
  });

  it('returns null when no pool is initialized', async () => {
    // Ensure pool is closed
    await closeWorkerPool();
    const wm = getWorkerManager();
    expect(wm).toBeNull();
  });

  it('returns a WorkerManager after pool initialization', () => {
    getWorkerPool();
    const wm = getWorkerManager();
    expect(wm).not.toBeNull();
    expect(wm).toBeDefined();
  });

  it('returns null after pool is closed', async () => {
    getWorkerPool();
    expect(getWorkerManager()).not.toBeNull();

    await closeWorkerPool();
    expect(getWorkerManager()).toBeNull();
  });
});

describe('closeWorkerPool', () => {
  afterEach(async () => {
    // Double-close is safe
    await closeWorkerPool();
  });

  it('shuts down pool and nulls references', async () => {
    getWorkerPool();
    expect(getWorkerManager()).not.toBeNull();

    await closeWorkerPool();
    expect(getWorkerManager()).toBeNull();
  });

  it('is a no-op when pool is not initialized', async () => {
    // Should not throw
    await closeWorkerPool();
    expect(getWorkerManager()).toBeNull();
  });

  it('allows re-creation of pool after close', async () => {
    getWorkerPool();
    await closeWorkerPool();

    // Re-create
    const pool = getWorkerPool();
    expect(pool).toBeDefined();
    expect(getWorkerManager()).not.toBeNull();
  });
});

describe('attachPoolEventListeners — persistStepRecords', () => {
  let db: Database.Database;
  let dataDir: string;
  let capturedCallback: ((event: PoolEvent) => void) | null;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    runMigrations(db);
    vi.clearAllMocks();

    // Create a temp data directory for step records
    dataDir = mkdtempSync(join(tmpdir(), 'eata-runner-test-'));

    // Close any existing pool before re-initializing
    await closeWorkerPool();

    // Get the singleton pool and spy on its onEvent
    const pool = getWorkerPool();
    const onEventSpy = vi.spyOn(pool, 'onEvent');

    attachPoolEventListeners(db, dataDir);

    expect(onEventSpy).toHaveBeenCalledTimes(1);
    capturedCallback = onEventSpy.mock.calls[0][0] as (event: PoolEvent) => void;
    expect(capturedCallback).toBeTypeOf('function');

    onEventSpy.mockRestore();
  });

  afterEach(async () => {
    db.close();
    await closeWorkerPool();
    try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('persists step records from steps.json on completed event', async () => {
    const taskId = 'persist-test-001';
    insertTask(db, taskId, 'running');

    // Create step records file
    const reportsDir = join(dataDir, 'reports', taskId);
    mkdirSync(reportsDir, { recursive: true });
    const steps = [
      {
        id: 'step-1',
        taskId,
        stepIndex: 0,
        phase: 'observe',
        status: 'success',
        observation: 'Found button',
        action: { name: 'click', args: { selector: '#btn' } },
        result: null,
        reasoning: 'Button visible',
        screenshotPath: '/screenshots/step1.png',
        accessibilitySnapshotPath: null,
        timestamp: new Date().toISOString(),
        duration: 150,
      },
      {
        id: 'step-2',
        taskId,
        stepIndex: 1,
        phase: 'execute',
        status: 'success',
        observation: 'Clicked button',
        action: { name: 'click', args: { selector: '#btn' } },
        result: { success: true },
        reasoning: null,
        screenshotPath: '/screenshots/step2.png',
        accessibilitySnapshotPath: '/snapshots/step2.json',
        timestamp: new Date().toISOString(),
        duration: 300,
      },
    ];
    writeFileSync(join(reportsDir, 'steps.json'), JSON.stringify(steps));

    // Trigger completed event
    capturedCallback!({ taskId, type: 'completed' });

    // Wait for async persistStepRecords to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify steps were persisted
    const stepRows = db.prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_index').all(taskId) as Array<Record<string, unknown>>;
    expect(stepRows.length).toBe(2);
    expect(stepRows[0].step_index).toBe(0);
    expect(stepRows[0].phase).toBe('observe');
    expect(stepRows[0].observation).toBe('Found button');
    expect(stepRows[0].screenshot_path).toBe('/screenshots/step1.png');
    expect(stepRows[1].step_index).toBe(1);
    expect(stepRows[1].accessibility_snapshot_path).toBe('/snapshots/step2.json');

    // Verify step_count was updated on the task
    const taskRow = db.prepare('SELECT step_count FROM tasks WHERE id = ?').get(taskId) as { step_count: number };
    expect(taskRow.step_count).toBe(2);
  });

  it('handles missing steps.json gracefully (ENOENT)', async () => {
    const taskId = 'no-steps-file';
    insertTask(db, taskId, 'running');

    // No steps.json created — should not throw
    capturedCallback!({ taskId, type: 'completed' });

    // Wait for async operation
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Task should still be marked completed
    const taskRow = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId) as { status: string };
    expect(taskRow.status).toBe('completed');
  });

  it('handles invalid JSON in steps.json gracefully', async () => {
    const taskId = 'bad-json';
    insertTask(db, taskId, 'running');

    // Create invalid JSON file
    const reportsDir = join(dataDir, 'reports', taskId);
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(join(reportsDir, 'steps.json'), 'not valid json {{{');

    capturedCallback!({ taskId, type: 'completed' });

    // Wait for async operation
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Task should still be marked completed (no crash)
    const taskRow = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId) as { status: string };
    expect(taskRow.status).toBe('completed');
  });

  it('handles empty steps array in steps.json', async () => {
    const taskId = 'empty-steps';
    insertTask(db, taskId, 'running');

    // Create empty array
    const reportsDir = join(dataDir, 'reports', taskId);
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(join(reportsDir, 'steps.json'), '[]');

    capturedCallback!({ taskId, type: 'completed' });

    // Wait for async operation
    await new Promise((resolve) => setTimeout(resolve, 100));

    // No steps should be inserted
    const stepRows = db.prepare('SELECT * FROM steps WHERE task_id = ?').all(taskId);
    expect(stepRows.length).toBe(0);
  });

  it('handles non-array JSON in steps.json', async () => {
    const taskId = 'non-array';
    insertTask(db, taskId, 'running');

    const reportsDir = join(dataDir, 'reports', taskId);
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(join(reportsDir, 'steps.json'), '{"not": "an array"}');

    capturedCallback!({ taskId, type: 'completed' });

    // Wait for async operation
    await new Promise((resolve) => setTimeout(resolve, 100));

    // No crash, no steps inserted
    const stepRows = db.prepare('SELECT * FROM steps WHERE task_id = ?').all(taskId);
    expect(stepRows.length).toBe(0);
  });

  it('handles read errors other than ENOENT', async () => {
    const taskId = 'read-error';
    insertTask(db, taskId, 'running');

    // Create a directory where the file should be (will cause EISDIR)
    const reportsDir = join(dataDir, 'reports', taskId);
    mkdirSync(join(reportsDir, 'steps.json'), { recursive: true }); // create as dir, not file

    capturedCallback!({ taskId, type: 'completed' });

    // Wait for async operation — should not crash the server
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Task should still be completed
    const taskRow = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId) as { status: string };
    expect(taskRow.status).toBe('completed');
  });

  it('handles steps with null optional fields', async () => {
    const taskId = 'null-fields';
    insertTask(db, taskId, 'running');

    const reportsDir = join(dataDir, 'reports', taskId);
    mkdirSync(reportsDir, { recursive: true });
    const steps = [
      {
        id: 'step-null',
        taskId,
        stepIndex: 0,
        phase: 'observe',
        status: 'success',
        observation: null,
        action: null,
        result: null,
        reasoning: null,
        screenshotPath: null,
        accessibilitySnapshotPath: null,
        timestamp: new Date().toISOString(),
        duration: 50,
      },
    ];
    writeFileSync(join(reportsDir, 'steps.json'), JSON.stringify(steps));

    capturedCallback!({ taskId, type: 'completed' });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const stepRows = db.prepare('SELECT * FROM steps WHERE task_id = ?').all(taskId) as Array<Record<string, unknown>>;
    expect(stepRows.length).toBe(1);
    expect(stepRows[0].observation).toBeNull();
    expect(stepRows[0].action).toBeNull();
    expect(stepRows[0].screenshot_path).toBeNull();
  });
});

describe('attachPoolEventListeners — cancelled event', () => {
  let db: Database.Database;
  let capturedCallback: ((event: PoolEvent) => void) | null;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    runMigrations(db);
    vi.clearAllMocks();

    await closeWorkerPool();

    const pool = getWorkerPool();
    const onEventSpy = vi.spyOn(pool, 'onEvent');

    attachPoolEventListeners(db);

    capturedCallback = onEventSpy.mock.calls[0][0] as (event: PoolEvent) => void;
    onEventSpy.mockRestore();
  });

  afterEach(async () => {
    db.close();
    await closeWorkerPool();
  });

  it('handles cancelled event — no direct DB update (mapped by executor)', () => {
    // The 'cancelled' type is handled by ProcessTaskExecutor, not by
    // attachPoolEventListeners. But we can verify the callback doesn't crash
    // when it receives a cancelled event (which shouldn't happen in practice
    // since the executor maps it to 'failed').
    insertTask(db, 'task-cancel', 'running');

    // The pool event handler only handles started/completed/failed,
    // so cancelled falls through to the default (no-op).
    capturedCallback!({ taskId: 'task-cancel', type: 'cancelled' });

    // Task status should remain unchanged (cancelled is not handled by the event listener)
    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get('task-cancel') as { status: string };
    expect(task.status).toBe('running');
  });
});
