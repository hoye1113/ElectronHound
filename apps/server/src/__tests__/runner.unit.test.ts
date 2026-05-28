/**
 * Runner Module Unit Tests
 *
 * Tests for attachPoolEventListeners (specifically the 'failed' case at L148-155)
 * and the updateTaskBatchProgress helper (L163-169).
 *
 * Strategy: Use the real getWorkerPool singleton and spy on its onEvent method
 * to capture the callback that attachPoolEventListeners registers. Then invoke
 * the callback directly with test events.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrations.js';

// Mock sseHub to capture SSE broadcasts
vi.mock('../streams/sseHub.js', () => ({
  sseHub: {
    broadcast: vi.fn(),
    broadcastAll: vi.fn(),
  },
}));

// Import after mocks
import { attachPoolEventListeners, getWorkerPool, closeWorkerPool } from '../tasks/runner.js';
import { sseHub } from '../streams/sseHub.js';
import type { PoolEvent } from '../services/workerPool/types.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function insertTask(
  db: Database.Database,
  taskId: string,
  status: string = 'queued',
  batchId: string | null = null,
) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, batch_id)
    VALUES (?, ?, '/app', 'gpt-4o', ?, 50, 0, ?, ?, ?)
  `).run(taskId, `Goal for ${taskId}`, status, now, now, batchId);
}

function insertBatch(
  db: Database.Database,
  batchId: string,
  totalTasks: number = 2,
) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
    VALUES (?, 'Test Batch', 'running', ?, 0, 0, 'medium', ?, ?)
  `).run(batchId, totalTasks, now, now);
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('attachPoolEventListeners', () => {
  let db: Database.Database;
  let capturedCallback: ((event: PoolEvent) => void) | null;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    runMigrations(db);
    capturedCallback = null;
    vi.clearAllMocks();

    // Get the singleton pool and spy on its onEvent before attaching listeners
    const pool = getWorkerPool();
    const onEventSpy = vi.spyOn(pool, 'onEvent');

    attachPoolEventListeners(db);

    // Capture the callback that was registered
    expect(onEventSpy).toHaveBeenCalledTimes(1);
    capturedCallback = onEventSpy.mock.calls[0][0] as (event: PoolEvent) => void;
    expect(capturedCallback).toBeTypeOf('function');

    onEventSpy.mockRestore();
  });

  afterEach(async () => {
    db.close();
    await closeWorkerPool();
  });

  // ── started event ─────────────────────────────────────────────────

  it('updates task status to running on started event', () => {
    insertTask(db, 'task-1', 'queued');

    capturedCallback!({ taskId: 'task-1', type: 'started' });

    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get('task-1') as { status: string };
    expect(task.status).toBe('running');
  });

  it('broadcasts SSE status event on started', () => {
    insertTask(db, 'task-1', 'queued');

    capturedCallback!({ taskId: 'task-1', type: 'started' });

    expect(sseHub.broadcast).toHaveBeenCalledWith('task-1', {
      event: 'status',
      data: { taskId: 'task-1', status: 'running' },
    });
  });

  // ── completed event ───────────────────────────────────────────────

  it('updates task status to completed on completed event', () => {
    insertTask(db, 'task-1', 'running');

    capturedCallback!({ taskId: 'task-1', type: 'completed' });

    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get('task-1') as { status: string };
    expect(task.status).toBe('completed');
  });

  it('broadcasts SSE status event on completed', () => {
    insertTask(db, 'task-1', 'running');

    capturedCallback!({ taskId: 'task-1', type: 'completed' });

    expect(sseHub.broadcast).toHaveBeenCalledWith('task-1', {
      event: 'status',
      data: { taskId: 'task-1', status: 'completed' },
    });
  });

  // ── failed event (L148-155) ───────────────────────────────────────

  it('updates task status to failed on failed event (L148)', () => {
    insertTask(db, 'task-1', 'running');

    capturedCallback!({ taskId: 'task-1', type: 'failed', error: 'Something broke' });

    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get('task-1') as { status: string };
    expect(task.status).toBe('failed');
  });

  it('broadcasts SSE status event with error on failed (L149-152)', () => {
    insertTask(db, 'task-1', 'running');

    capturedCallback!({ taskId: 'task-1', type: 'failed', error: 'LLM timeout' });

    expect(sseHub.broadcast).toHaveBeenCalledWith('task-1', {
      event: 'status',
      data: { taskId: 'task-1', status: 'failed', error: 'LLM timeout' },
    });
  });

  it('broadcasts SSE status event with undefined error when no error provided', () => {
    insertTask(db, 'task-1', 'running');

    capturedCallback!({ taskId: 'task-1', type: 'failed' });

    expect(sseHub.broadcast).toHaveBeenCalledWith('task-1', {
      event: 'status',
      data: { taskId: 'task-1', status: 'failed', error: undefined },
    });
  });

  // ── updateTaskBatchProgress (L163-169) ────────────────────────────

  it('updates batch progress when completed task belongs to a batch (L164-168)', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440020';
    insertBatch(db, batchId, 2);
    insertTask(db, 'task-1', 'running', batchId);
    insertTask(db, 'task-2', 'queued', batchId);

    capturedCallback!({ taskId: 'task-1', type: 'completed' });

    // The batch should have its counts updated: 1 completed, 0 failed
    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batch.completed_tasks).toBe(1);
    expect(batch.failed_tasks).toBe(0);
  });

  it('updates batch progress when failed task belongs to a batch (L164-168)', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440021';
    insertBatch(db, batchId, 2);
    insertTask(db, 'task-1', 'running', batchId);
    insertTask(db, 'task-2', 'queued', batchId);

    capturedCallback!({ taskId: 'task-1', type: 'failed', error: 'Crash' });

    // The batch should have its counts updated: 0 completed, 1 failed
    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batch.completed_tasks).toBe(0);
    expect(batch.failed_tasks).toBe(1);
  });

  it('does not call updateBatchProgress when task has no batch_id (L165)', () => {
    insertTask(db, 'task-1', 'running', null); // no batch

    capturedCallback!({ taskId: 'task-1', type: 'completed' });

    // Task should still be marked completed
    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get('task-1') as { status: string };
    expect(task.status).toBe('completed');

    // broadcastAll should NOT have been called (no batch progress event)
    expect(sseHub.broadcastAll).not.toHaveBeenCalled();
  });

  it('marks batch as completed when all tasks finish via event stream', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440022';
    insertBatch(db, batchId, 2);
    insertTask(db, 'task-1', 'running', batchId);
    insertTask(db, 'task-2', 'running', batchId);

    // Complete task-1
    capturedCallback!({ taskId: 'task-1', type: 'completed' });

    let batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batch.status).toBe('running'); // not done yet

    // Complete task-2
    capturedCallback!({ taskId: 'task-2', type: 'completed' });

    batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batch.status).toBe('completed');
  });

  it('marks batch as failed when any task fails and all tasks done', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440023';
    insertBatch(db, batchId, 2);
    insertTask(db, 'task-1', 'running', batchId);
    insertTask(db, 'task-2', 'running', batchId);

    // Complete task-1
    capturedCallback!({ taskId: 'task-1', type: 'completed' });

    // Fail task-2
    capturedCallback!({ taskId: 'task-2', type: 'failed', error: 'Crash' });

    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batch.status).toBe('failed');
    expect(batch.completed_tasks).toBe(1);
    expect(batch.failed_tasks).toBe(1);
  });

  it('broadcasts batch:completed SSE event when batch finishes', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440024';
    insertBatch(db, batchId, 1);
    insertTask(db, 'task-1', 'running', batchId);

    capturedCallback!({ taskId: 'task-1', type: 'completed' });

    expect(sseHub.broadcastAll).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'status',
        data: expect.objectContaining({
          type: 'batch:completed',
          batchId,
        }),
      }),
    );
  });

  it('broadcasts batch:progress SSE event when batch is partially done', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440025';
    insertBatch(db, batchId, 3);
    insertTask(db, 'task-1', 'running', batchId);
    insertTask(db, 'task-2', 'queued', batchId);
    insertTask(db, 'task-3', 'queued', batchId);

    capturedCallback!({ taskId: 'task-1', type: 'completed' });

    expect(sseHub.broadcastAll).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'status',
        data: expect.objectContaining({
          type: 'batch:progress',
          batchId,
          percentage: 33,
        }),
      }),
    );
  });

  it('broadcasts batch:completed SSE when a failed task completes the batch', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440026';
    insertBatch(db, batchId, 2);
    insertTask(db, 'task-1', 'completed', batchId);
    insertTask(db, 'task-2', 'running', batchId);

    capturedCallback!({ taskId: 'task-2', type: 'failed', error: 'timeout' });

    expect(sseHub.broadcastAll).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'status',
        data: expect.objectContaining({
          type: 'batch:completed',
          batchId,
          summary: expect.objectContaining({
            total: 2,
            completed: 1,
            failed: 1,
          }),
        }),
      }),
    );
  });
});
