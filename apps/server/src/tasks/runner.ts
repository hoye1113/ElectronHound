import { WorkerPoolManager } from '../services/workerPool/manager.js';
import type { PoolTask, TaskExecutor } from '../services/workerPool/types.js';
import { WorkerManager } from '../services/workerManager.js';
import { sseHub } from '../streams/sseHub.js';
import type Database from 'better-sqlite3';

// ── TaskExecutor adapter ──────────────────────────────────────────────

/**
 * Bridges WorkerPoolManager (pool-level abstraction) to WorkerManager
 * (actual child-process spawner). Converts pool lifecycle callbacks
 * into WorkerManager spawn/cancel calls.
 */
class ProcessTaskExecutor implements TaskExecutor {
  private workerManager: WorkerManager;

  constructor(workerManager: WorkerManager) {
    this.workerManager = workerManager;
  }

  execute(
    task: PoolTask,
    onComplete: (taskId: string, result: 'completed' | 'failed', error?: string) => void,
  ): void {
    this.workerManager.spawnWorker({
      taskId: task.id,
      goal: task.goal,
      targetAppPath: task.targetAppPath,
      llmModel: task.llmModel,
      maxSteps: task.maxSteps,
      contextInjection: task.contextInjection,
      providerId: task.providerId,
    });

    const listener = (event: { taskId: string; type: 'started' | 'completed' | 'failed' | 'cancelled'; error?: string }) => {
      if (event.taskId !== task.id) return;
      if (event.type === 'completed' || event.type === 'failed') {
        this.workerManager.removeListener(listener);
        onComplete(task.id, event.type, event.error);
      } else if (event.type === 'cancelled') {
        this.workerManager.removeListener(listener);
        onComplete(task.id, 'failed', 'Cancelled');
      }
    };

    this.workerManager.onEvent(listener);
  }

  cancel(taskId: string): void {
    this.workerManager.cancelWorker(taskId);
  }

  getWorkerManager(): WorkerManager {
    return this.workerManager;
  }
}

// ── Singleton pool ───────────────────────────────────────────────────

let pool: WorkerPoolManager | null = null;
let executor: ProcessTaskExecutor | null = null;

export function getWorkerPool(): WorkerPoolManager {
  if (!pool) {
    const workerManager = new WorkerManager();
    executor = new ProcessTaskExecutor(workerManager);
    pool = new WorkerPoolManager(
      // Max 3 concurrent workers
      { maxConcurrency: 3 },
      executor,
    );
  }
  return pool;
}

export function getWorkerManager(): WorkerManager | null {
  return executor?.getWorkerManager() ?? null;
}

export async function closeWorkerPool(): Promise<void> {
  if (pool) {
    pool.shutdown();
    const wm = executor?.getWorkerManager();
    wm?.shutdown();
    pool = null;
    executor = null;
  }
}

// ── Pool event → DB sync ─────────────────────────────────────────────

/**
 * Wire pool events to database updates and SSE broadcasts.
 * Call once at server startup after getWorkerPool().
 */
export function attachPoolEventListeners(db: Database.Database): void {
  const p = getWorkerPool();
  p.onEvent((event) => {
    switch (event.type) {
      case 'started':
        db.prepare(
          "UPDATE tasks SET status = 'running', updated_at = datetime('now') WHERE id = ?"
        ).run(event.taskId);
        sseHub.broadcast(event.taskId, {
          event: 'status',
          data: { taskId: event.taskId, status: 'running' },
        });
        break;

      case 'completed':
        db.prepare(
          "UPDATE tasks SET status = 'completed', updated_at = datetime('now') WHERE id = ?"
        ).run(event.taskId);
        sseHub.broadcast(event.taskId, {
          event: 'status',
          data: { taskId: event.taskId, status: 'completed' },
        });
        break;

      case 'failed':
        db.prepare(
          "UPDATE tasks SET status = 'failed', updated_at = datetime('now') WHERE id = ?"
        ).run(event.taskId);
        sseHub.broadcast(event.taskId, {
          event: 'status',
          data: { taskId: event.taskId, status: 'failed', error: event.error },
        });
        break;
    }
  });
}
