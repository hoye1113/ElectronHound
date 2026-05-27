/**
 * Batch Testing Service
 *
 * Manages batch operations including creation, status tracking,
 * and cancellation of batched tasks.
 */
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { CreateBatchInput, Batch, BatchWithTasks, BatchStatus } from '../schemas/batch.js';
import { sseHub } from '../streams/sseHub.js';
import { getWorkerPool } from '../tasks/runner.js';

// ── Batch Service ────────────────────────────────────────────────────

export class BatchService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create a new batch with associated tasks.
   */
  createBatch(input: CreateBatchInput, defaultTargetAppPath: string): { batchId: string; taskIds: string[] } {
    const batchId = randomUUID();
    const now = new Date().toISOString();

    // Create tasks first to get IDs
    const taskIds: string[] = [];
    const createTaskStmt = this.db.prepare(`
      INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, context_injection, step_count, created_at, updated_at, provider_id, batch_id)
      VALUES (?, ?, ?, ?, 'queued', ?, ?, 0, ?, ?, ?, ?)
    `);

    // Use transaction for atomicity
    const insertBatch = this.db.prepare(`
      INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
      VALUES (?, ?, 'pending', ?, 0, 0, ?, ?, ?)
    `);

    this.db.transaction(() => {
      // Create batch record
      insertBatch.run(
        batchId,
        input.name ?? null,
        input.tasks.length,
        input.priority,
        now,
        now
      );

      // Create individual tasks
      for (const taskItem of input.tasks) {
        const taskId = randomUUID();
        const targetAppPath = taskItem.config?.targetAppPath ?? defaultTargetAppPath;
        const llmModel = taskItem.config?.llmModel ?? 'gpt-4o';
        const maxSteps = taskItem.config?.maxSteps ?? 50;
        const contextInjection = taskItem.config?.contextInjection ?? null;
        const providerId = taskItem.config?.providerId ?? null;

        createTaskStmt.run(
          taskId,
          taskItem.goal,
          targetAppPath,
          llmModel,
          maxSteps,
          contextInjection,
          now,
          now,
          providerId,
          batchId
        );

        taskIds.push(taskId);
      }
    })();

    // Submit tasks to worker pool
    const pool = getWorkerPool();
    for (let i = 0; i < taskIds.length; i++) {
      const taskItem = input.tasks[i];
      pool.submit({
        id: taskIds[i],
        goal: taskItem.goal,
        targetAppPath: taskItem.config?.targetAppPath ?? defaultTargetAppPath,
        llmModel: taskItem.config?.llmModel ?? 'gpt-4o',
        maxSteps: taskItem.config?.maxSteps ?? 50,
        contextInjection: taskItem.config?.contextInjection,
        providerId: taskItem.config?.providerId,
        priority: input.priority,
      });
    }

    // Update batch status to running
    this.db.prepare(
      "UPDATE batches SET status = 'running', updated_at = datetime('now') WHERE id = ?"
    ).run(batchId);

    return { batchId, taskIds };
  }

  /**
   * Get batch status with task breakdown and progress.
   */
  getBatchStatus(batchId: string): BatchWithTasks | null {
    // Get batch record
    const batchRow = this.db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown> | undefined;

    if (!batchRow) {
      return null;
    }

    // Get tasks in this batch
    const taskRows = this.db.prepare(
      'SELECT id, goal, status, created_at, updated_at FROM tasks WHERE batch_id = ? ORDER BY created_at'
    ).all(batchId) as Array<Record<string, unknown>>;

    // Calculate progress
    const totalTasks = Number(batchRow.total_tasks);
    const completedTasks = Number(batchRow.completed_tasks);
    const failedTasks = Number(batchRow.failed_tasks);
    const progress = totalTasks > 0 ? Math.round(((completedTasks + failedTasks) / totalTasks) * 100) : 0;

    return {
      id: String(batchRow.id),
      name: batchRow.name as string | null,
      status: batchRow.status as BatchStatus,
      totalTasks,
      completedTasks,
      failedTasks,
      priority: String(batchRow.priority) as Batch['priority'],
      createdAt: String(batchRow.created_at),
      updatedAt: String(batchRow.updated_at),
      tasks: taskRows.map(row => ({
        id: String(row.id),
        goal: String(row.goal),
        status: String(row.status),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      })),
      progress,
    };
  }

  /**
   * Cancel a batch and all its pending tasks.
   */
  cancelBatch(batchId: string): boolean {
    const batchRow = this.db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown> | undefined;

    if (!batchRow) {
      return false;
    }

    const status = batchRow.status as string;

    // Can only cancel pending or running batches
    if (status !== 'pending' && status !== 'running') {
      return false;
    }

    // Get all pending/queued tasks in this batch
    const pendingTasks = this.db.prepare(
      "SELECT id FROM tasks WHERE batch_id = ? AND status IN ('queued', 'running')"
    ).all(batchId) as Array<{ id: string }>;

    // Cancel each task in the worker pool
    const pool = getWorkerPool();
    for (const task of pendingTasks) {
      pool.cancel(task.id);
    }

    // Update batch status
    this.db.prepare(
      "UPDATE batches SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
    ).run(batchId);

    // Broadcast cancellation event
    sseHub.broadcastAll({
      event: 'status',
      data: {
        type: 'batch:cancelled',
        batchId,
      },
    });

    return true;
  }

  /**
   * Update batch progress when a task completes.
   * Called by task completion handlers.
   */
  updateBatchProgress(batchId: string): void {
    if (!batchId) return;

    // Count completed and failed tasks
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM tasks WHERE batch_id = ?
    `).get(batchId) as { total: number; completed: number; failed: number };

    const now = new Date().toISOString();

    // Update batch counts
    this.db.prepare(`
      UPDATE batches
      SET completed_tasks = ?, failed_tasks = ?, updated_at = ?
      WHERE id = ?
    `).run(stats.completed, stats.failed, now, batchId);

    // Check if batch is complete
    if (stats.completed + stats.failed >= stats.total) {
      const newStatus = stats.failed > 0 ? 'failed' : 'completed';
      this.db.prepare(
        'UPDATE batches SET status = ?, updated_at = ? WHERE id = ?'
      ).run(newStatus, now, batchId);

      // Broadcast completion event
      sseHub.broadcastAll({
        event: 'status',
        data: {
          type: 'batch:completed',
          batchId,
          summary: {
            total: stats.total,
            completed: stats.completed,
            failed: stats.failed,
          },
        },
      });
    } else {
      // Broadcast progress event
      const progress = Math.round(((stats.completed + stats.failed) / stats.total) * 100);
      sseHub.broadcastAll({
        event: 'status',
        data: {
          type: 'batch:progress',
          batchId,
          completed: stats.completed,
          failed: stats.failed,
          total: stats.total,
          percentage: progress,
        },
      });
    }
  }
}

// ── Factory function ─────────────────────────────────────────────────

/**
 * Create a new BatchService instance.
 * Always creates a fresh instance to avoid stale database references.
 */
export function createBatchService(db: Database.Database): BatchService {
  return new BatchService(db);
}
