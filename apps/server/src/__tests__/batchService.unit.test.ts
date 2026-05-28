/**
 * BatchService Unit Tests
 *
 * Tests for updateBatchProgress (L196-251), createBatchService (L280-281),
 * and getBatchService singleton.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrations.js';

// Mock sseHub to avoid real SSE connections
vi.mock('../streams/sseHub.js', () => ({
  sseHub: {
    broadcastAll: vi.fn(),
  },
}));

// Mock getWorkerPool to avoid real worker pool initialization
vi.mock('../tasks/runner.js', () => ({
  getWorkerPool: vi.fn(() => ({
    submit: vi.fn(),
    cancel: vi.fn(),
  })),
}));

// Import after mocks are set up
import { BatchService, getBatchService, createBatchService } from '../services/batchService.js';
import { sseHub } from '../streams/sseHub.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function insertBatch(
  db: Database.Database,
  batchId: string,
  overrides: Partial<{ status: string; totalTasks: number; completedTasks: number; failedTasks: number }> = {},
) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
    VALUES (?, 'Test Batch', ?, ?, ?, ?, 'medium', ?, ?)
  `).run(
    batchId,
    overrides.status ?? 'running',
    overrides.totalTasks ?? 2,
    overrides.completedTasks ?? 0,
    overrides.failedTasks ?? 0,
    now,
    now,
  );
}

function insertTask(
  db: Database.Database,
  taskId: string,
  batchId: string,
  status: string = 'queued',
) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, batch_id)
    VALUES (?, ?, '/app', 'gpt-4o', ?, 50, 0, ?, ?, ?)
  `).run(taskId, `Goal for ${taskId}`, status, now, now, batchId);
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('BatchService.updateBatchProgress', () => {
  let db: Database.Database;
  let service: BatchService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    runMigrations(db);
    service = new BatchService(db);
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
  });

  it('returns early when batchId is empty string', () => {
    service.updateBatchProgress('');
    expect(sseHub.broadcastAll).not.toHaveBeenCalled();
  });

  it('sets batch status to completed when all tasks completed (L217-221)', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440010';
    insertBatch(db, batchId, { totalTasks: 2 });
    insertTask(db, 'task-a', batchId, 'completed');
    insertTask(db, 'task-b', batchId, 'completed');

    service.updateBatchProgress(batchId);

    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batch.status).toBe('completed');
    expect(batch.completed_tasks).toBe(2);
    expect(batch.failed_tasks).toBe(0);
  });

  it('sets batch status to failed when all tasks failed (L217-221)', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440011';
    insertBatch(db, batchId, { totalTasks: 2 });
    insertTask(db, 'task-a', batchId, 'failed');
    insertTask(db, 'task-b', batchId, 'failed');

    service.updateBatchProgress(batchId);

    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batch.status).toBe('failed');
    expect(batch.completed_tasks).toBe(0);
    expect(batch.failed_tasks).toBe(2);
  });

  it('sets batch status to failed when some tasks failed and rest completed (L218)', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440012';
    insertBatch(db, batchId, { totalTasks: 3 });
    insertTask(db, 'task-a', batchId, 'completed');
    insertTask(db, 'task-b', batchId, 'failed');
    insertTask(db, 'task-c', batchId, 'completed');

    service.updateBatchProgress(batchId);

    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batch.status).toBe('failed');
    expect(batch.completed_tasks).toBe(2);
    expect(batch.failed_tasks).toBe(1);
  });

  it('broadcasts batch:completed event when all tasks are done (L223-235)', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440013';
    insertBatch(db, batchId, { totalTasks: 2 });
    insertTask(db, 'task-a', batchId, 'completed');
    insertTask(db, 'task-b', batchId, 'completed');

    service.updateBatchProgress(batchId);

    expect(sseHub.broadcastAll).toHaveBeenCalledWith({
      event: 'status',
      data: {
        type: 'batch:completed',
        batchId,
        summary: {
          total: 2,
          completed: 2,
          failed: 0,
        },
      },
    });
  });

  it('broadcasts batch:completed event with failure summary', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440014';
    insertBatch(db, batchId, { totalTasks: 2 });
    insertTask(db, 'task-a', batchId, 'completed');
    insertTask(db, 'task-b', batchId, 'failed');

    service.updateBatchProgress(batchId);

    expect(sseHub.broadcastAll).toHaveBeenCalledWith({
      event: 'status',
      data: {
        type: 'batch:completed',
        batchId,
        summary: {
          total: 2,
          completed: 1,
          failed: 1,
        },
      },
    });
  });

  it('broadcasts batch:progress event when batch is partially done (L236-250)', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440015';
    insertBatch(db, batchId, { totalTasks: 4 });
    insertTask(db, 'task-a', batchId, 'completed');
    insertTask(db, 'task-b', batchId, 'running');
    insertTask(db, 'task-c', batchId, 'queued');
    insertTask(db, 'task-d', batchId, 'queued');

    service.updateBatchProgress(batchId);

    // Batch should remain running
    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batch.status).toBe('running');
    expect(batch.completed_tasks).toBe(1);
    expect(batch.failed_tasks).toBe(0);

    expect(sseHub.broadcastAll).toHaveBeenCalledWith({
      event: 'status',
      data: {
        type: 'batch:progress',
        batchId,
        completed: 1,
        failed: 0,
        total: 4,
        percentage: 25, // 1/4 = 25%
      },
    });
  });

  it('broadcasts batch:progress with 0% when no tasks completed yet', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440016';
    insertBatch(db, batchId, { totalTasks: 3 });
    insertTask(db, 'task-a', batchId, 'running');
    insertTask(db, 'task-b', batchId, 'queued');
    insertTask(db, 'task-c', batchId, 'queued');

    service.updateBatchProgress(batchId);

    expect(sseHub.broadcastAll).toHaveBeenCalledWith({
      event: 'status',
      data: {
        type: 'batch:progress',
        batchId,
        completed: 0,
        failed: 0,
        total: 3,
        percentage: 0,
      },
    });
  });

  it('updates completed_tasks and failed_tasks counts in DB (L210-214)', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440017';
    insertBatch(db, batchId, { totalTasks: 3 });
    insertTask(db, 'task-a', batchId, 'completed');
    insertTask(db, 'task-b', batchId, 'failed');
    insertTask(db, 'task-c', batchId, 'running');

    service.updateBatchProgress(batchId);

    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batch.completed_tasks).toBe(1);
    expect(batch.failed_tasks).toBe(1);
  });

  it('broadcasts batch:progress with correct percentage for partial progress', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440018';
    insertBatch(db, batchId, { totalTasks: 3 });
    insertTask(db, 'task-a', batchId, 'completed');
    insertTask(db, 'task-b', batchId, 'completed');
    insertTask(db, 'task-c', batchId, 'running');

    service.updateBatchProgress(batchId);

    expect(sseHub.broadcastAll).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'batch:progress',
          percentage: 67, // 2/3 = 67%
        }),
      }),
    );
  });

  it('handles batch with single task completing', () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440019';
    insertBatch(db, batchId, { totalTasks: 1 });
    insertTask(db, 'task-a', batchId, 'completed');

    service.updateBatchProgress(batchId);

    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batch.status).toBe('completed');
    expect(sseHub.broadcastAll).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'batch:completed',
          summary: { total: 1, completed: 1, failed: 0 },
        }),
      }),
    );
  });
});

describe('BatchService.createBatchService', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates a new BatchService instance (L280-281)', () => {
    const service = createBatchService(db);
    expect(service).toBeInstanceOf(BatchService);
  });

  it('creates a fresh instance on every call', () => {
    const service1 = createBatchService(db);
    const service2 = createBatchService(db);
    expect(service1).not.toBe(service2);
  });
});

describe('BatchService.getBatchService', () => {
  afterEach(() => {
    // Reset singleton by calling with a fresh DB in each test
  });

  it('returns a BatchService instance', () => {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    runMigrations(db);

    const service = getBatchService(db);
    expect(service).toBeInstanceOf(BatchService);

    db.close();
  });

  it('returns the same instance for the same database reference', () => {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    runMigrations(db);

    const service1 = getBatchService(db);
    const service2 = getBatchService(db);
    expect(service1).toBe(service2);

    db.close();
  });

  it('creates a new instance when database reference changes', () => {
    const db1 = new Database(':memory:');
    const db2 = new Database(':memory:');
    db1.pragma('journal_mode = WAL');
    db2.pragma('journal_mode = WAL');
    runMigrations(db1);
    runMigrations(db2);

    const service1 = getBatchService(db1);
    const service2 = getBatchService(db2);
    expect(service1).not.toBe(service2);

    db1.close();
    db2.close();
  });
});
