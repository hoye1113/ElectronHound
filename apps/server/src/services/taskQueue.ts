import { WorkerManager, type WorkerOptions } from './workerManager.js';

// ── Types ───────────────────────────────────────────────────────────

export interface QueueEntry {
  taskId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  options: WorkerOptions;
  enqueuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

// ── TaskQueue ───────────────────────────────────────────────────────

export class TaskQueue {
  private entries: Map<string, QueueEntry> = new Map();
  private queue: QueueEntry[] = [];
  private current: QueueEntry | null = null;
  private workerManager: WorkerManager;

  constructor(workerManager: WorkerManager) {
    this.workerManager = workerManager;

    // Listen for worker events to auto-dequeue
    this.workerManager.onEvent((event) => {
      if (event.type === 'completed' || event.type === 'failed' || event.type === 'cancelled') {
        if (this.current && this.current.taskId === event.taskId) {
          this.current.status = event.type;
          this.current.completedAt = new Date();
          this.current = null;
          this.dequeue();
        }
      }
    });
  }

  // ── Public API ──────────────────────────────────────────────────

  enqueue(taskId: string, options: WorkerOptions): QueueEntry {
    const entry: QueueEntry = {
      taskId,
      status: 'queued',
      options,
      enqueuedAt: new Date(),
    };

    this.entries.set(taskId, entry);
    this.queue.push(entry);

    // Start immediately if no task is running
    if (!this.current) {
      this.dequeue();
    }

    return entry;
  }

  dequeue(): void {
    // Don't start new task if one is already running
    if (this.current) return;

    // Get next queued task
    const next = this.queue.shift();
    if (!next) return;

    this.current = next;
    next.status = 'running';
    next.startedAt = new Date();

    // Spawn the worker
    try {
      this.workerManager.spawnWorker(next.options);
    } catch (err: unknown) {
      next.status = 'failed';
      next.completedAt = new Date();
      process.stderr.write(`[taskQueue] Failed to spawn worker for ${next.taskId}: ${err instanceof Error ? err.message : String(err)}\n`);
      this.current = null;
      // Try next task
      this.dequeue();
    }
  }

  cancel(taskId: string): void {
    // Check if it's the currently running task
    if (this.current && this.current.taskId === taskId) {
      this.workerManager.cancelWorker(taskId);
      return;
    }

    // Check if it's in the queue
    const idx = this.queue.findIndex((entry) => entry.taskId === taskId);
    if (idx !== -1) {
      const removed = this.queue.splice(idx, 1)[0];
      removed.status = 'cancelled';
      removed.completedAt = new Date();
    }
  }

  getStatus(taskId: string): QueueEntry | undefined {
    return this.entries.get(taskId);
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getCurrentTask(): QueueEntry | null {
    return this.current;
  }

  isRunning(): boolean {
    return this.current !== null;
  }
}
