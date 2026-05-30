import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WorkerPoolManager } from '../services/workerPool/manager.js';
import type { PoolTask, TaskExecutor } from '../services/workerPool/types.js';
import { WorkerManager, type Logger } from '../services/workerManager.js';
import { sseHub } from '../streams/sseHub.js';
import { getBatchService } from '../services/batchService.js';
import type { StepRecord } from '@eata/shared-types';
import type Database from 'better-sqlite3';
import { toErrorMessage } from '@eata/agent-core/utils/error';
import { createStderrLogger } from '../utils/logger.js';

const log = createStderrLogger('runner');

// ── Hoisted prepared statements ────────────────────────────────────────

let updateRunningStmt: Database.Statement;
let updateCompletedStmt: Database.Statement;
let updateFailedStmt: Database.Statement;
let insertStepStmt: Database.Statement;
let updateStepCountStmt: Database.Statement;

function initStatements(db: Database.Database): void {
  updateRunningStmt = db.prepare("UPDATE tasks SET status = 'running', updated_at = datetime('now') WHERE id = ?");
  updateCompletedStmt = db.prepare("UPDATE tasks SET status = 'completed', updated_at = datetime('now') WHERE id = ?");
  updateFailedStmt = db.prepare("UPDATE tasks SET status = 'failed', updated_at = datetime('now') WHERE id = ?");
  insertStepStmt = db.prepare(
    `INSERT OR REPLACE INTO steps (id, task_id, step_index, phase, status, observation, action, result, reasoning, screenshot_path, accessibility_snapshot_path, timestamp, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  updateStepCountStmt = db.prepare("UPDATE tasks SET step_count = ?, updated_at = datetime('now') WHERE id = ?");
}

// ── TaskExecutor adapter ──────────────────────────────────────────────

/**
 * Bridges WorkerPoolManager (pool-level abstraction) to WorkerManager
 * (actual child-process spawner). Converts pool lifecycle callbacks
 * into WorkerManager spawn/cancel calls.
 */
class ProcessTaskExecutor implements TaskExecutor {
  private workerManager: WorkerManager;
  private logger = createStderrLogger('ProcessTaskExecutor');

  constructor(workerManager: WorkerManager) {
    this.workerManager = workerManager;
  }

  execute(
    task: PoolTask,
    onComplete: (taskId: string, result: 'completed' | 'failed', error?: string) => void,
  ): void {
    this.logger.info(`Spawning worker for task ${task.id}, goal: ${task.goal.substring(0, 50)}`);
    try {
      this.workerManager.spawnWorker({
        taskId: task.id,
        goal: task.goal,
        targetAppPath: task.targetAppPath,
        llmModel: task.llmModel,
        maxSteps: task.maxSteps,
        contextInjection: task.contextInjection,
        providerId: task.providerId,
        dataDir: task.dataDir,
      });
      this.logger.info(`Worker spawned for task ${task.id}`);
    } catch (err: unknown) {
      this.logger.error(`Spawn failed for task ${task.id}: ${toErrorMessage(err)}`);
      onComplete(task.id, 'failed', toErrorMessage(err));
      return;
    }

    const listener = (event: { taskId: string; type: 'started' | 'completed' | 'failed' | 'cancelled'; error?: string }) => {
      if (event.taskId !== task.id) return;
      this.logger.info(`Event for task ${task.id}: ${event.type}${event.error ? ` - ${event.error}` : ''}`);
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
let currentConcurrency: number = 0;

export function getWorkerPool(options?: { maxConcurrency?: number; logger?: Logger }): WorkerPoolManager {
  if (!pool) {
    const concurrency = options?.maxConcurrency ?? 1; // Default to 1 until user-data-dir isolation (PR-4) is merged
    const workerManager = new WorkerManager(options?.logger);
    executor = new ProcessTaskExecutor(workerManager);
    pool = new WorkerPoolManager(
      { maxConcurrency: concurrency },
      executor,
    );
    currentConcurrency = concurrency;
  } else if (options?.maxConcurrency !== undefined && options.maxConcurrency !== currentConcurrency) {
    log.warn(`WorkerPool already initialized with concurrency ${currentConcurrency}`);
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
 *
 * @param db - The main application database
 * @param dataDir - Base directory for reports/screenshots (defaults to './data')
 */
export function attachPoolEventListeners(db: Database.Database, dataDir: string = './data'): void {
  initStatements(db);
  const p = getWorkerPool();

  p.onEvent((event) => {
    switch (event.type) {
      case 'started':
        updateRunningStmt.run(event.taskId);
        sseHub.broadcast(event.taskId, {
          event: 'status',
          data: { taskId: event.taskId, status: 'running' },
        });
        break;

      case 'completed':
        updateCompletedStmt.run(event.taskId);
        sseHub.broadcast(event.taskId, {
          event: 'status',
          data: { taskId: event.taskId, status: 'completed' },
        });
        // Persist step records (with screenshot paths) from worker output
        persistStepRecords(db, event.taskId, dataDir).catch((err: unknown) => {
          log.warn(`Failed to persist step records for ${event.taskId}: ${toErrorMessage(err)}`);
        });
        // Update batch progress if task belongs to a batch
        updateTaskBatchProgress(db, event.taskId);
        break;

      case 'failed':
        updateFailedStmt.run(event.taskId);
        sseHub.broadcast(event.taskId, {
          event: 'status',
          data: { taskId: event.taskId, status: 'failed', error: event.error },
        });
        // Update batch progress if task belongs to a batch
        updateTaskBatchProgress(db, event.taskId);
        break;
    }
  });
}

/**
 * Helper to update batch progress when a task completes or fails.
 */
function updateTaskBatchProgress(db: Database.Database, taskId: string): void {
  const taskRow = db.prepare('SELECT batch_id FROM tasks WHERE id = ?').get(taskId) as { batch_id: string | null } | undefined;
  if (taskRow?.batch_id) {
    const batchService = getBatchService(db);
    batchService.updateBatchProgress(taskRow.batch_id);
  }
}

/**
 * Read step records written by the worker process and persist them to SQLite.
 *
 * The worker writes step records (including screenshotPath and
 * accessibilitySnapshotPath) to `data/reports/{taskId}/steps.json`.
 * This function reads that file and inserts each record into the steps table.
 */
async function persistStepRecords(
  db: Database.Database,
  taskId: string,
  dataDir: string,
): Promise<void> {
  const stepsFile = join(dataDir, 'reports', taskId, 'steps.json');

  let raw: string;
  try {
    raw = await readFile(stepsFile, 'utf-8');
  } catch (err: unknown) {
    // File may not exist if the worker didn't produce step records
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      log.info(`No step records file for task ${taskId}`);
      return;
    }
    throw err;
  }

  let steps: StepRecord[];
  try {
    steps = JSON.parse(raw) as StepRecord[];
  } catch {
    log.warn(`Invalid step records JSON for task ${taskId}`);
    return;
  }

  if (!Array.isArray(steps) || steps.length === 0) {
    return;
  }

  // Insert step records in a transaction
  const insertAll = db.transaction((records: StepRecord[]) => {
    for (const step of records) {
      insertStepStmt.run(
        step.id,
        step.taskId,
        step.stepIndex,
        step.phase,
        step.status,
        step.observation ?? null,
        step.action ? JSON.stringify(step.action) : null,
        step.result ? JSON.stringify(step.result) : null,
        step.reasoning ?? null,
        step.screenshotPath ?? null,
        step.accessibilitySnapshotPath ?? null,
        step.timestamp,
        step.duration,
      );
    }
    // Update task step_count
    updateStepCountStmt.run(records.length, taskId);
  });

  insertAll(steps);
  log.info(`Persisted ${steps.length} step records for task ${taskId}`);
}
