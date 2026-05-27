import type { PoolTask, PoolTaskHandle, PoolConfig, TaskExecutor, PoolEvent, PoolTaskStatus } from './types.js';
import { TaskQueue } from './queue.js';

const MAX_HANDLES = 1000;
const HANDLE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class WorkerPoolManager {
  private queue: TaskQueue;
  private config: PoolConfig;
  private executor: TaskExecutor;
  private running: Map<string, PoolTaskHandle> = new Map();
  private handles: Map<string, PoolTaskHandle> = new Map();
  private eventListeners: Array<(event: PoolEvent) => void> = [];

  constructor(config: PoolConfig, executor: TaskExecutor) {
    this.config = config;
    this.executor = executor;
    this.queue = new TaskQueue();
  }

  submit(task: PoolTask): string {
    const handle: PoolTaskHandle = {
      taskId: task.id,
      status: 'queued',
      priority: task.priority,
      submittedAt: new Date(),
    };
    this.handles.set(task.id, handle);

    if (this.running.size < this.config.maxConcurrency) {
      this.startTask(task);
    } else {
      this.queue.enqueue(task);
    }
    return task.id;
  }

  cancel(taskId: string): boolean {
    const handle = this.handles.get(taskId);
    if (!handle) return false;

    if (handle.status === 'running') {
      this.executor.cancel(taskId);
      this.updateStatus(taskId, 'cancelled');
    } else if (handle.status === 'queued') {
      this.queue.remove(taskId);
      this.updateStatus(taskId, 'cancelled');
    }
    return true;
  }

  getStatus(taskId: string): PoolTaskHandle | undefined {
    return this.handles.get(taskId);
  }

  getRunningCount(): number {
    return this.running.size;
  }

  getQueueLength(): number {
    return this.queue.size();
  }

  onEvent(listener: (event: PoolEvent) => void): void {
    this.eventListeners.push(listener);
  }

  shutdown(): void {
    for (const [taskId] of this.running) {
      this.executor.cancel(taskId);
      this.updateStatus(taskId, 'cancelled');
    }
    this.running.clear();
    this.queue = new TaskQueue();
  }

  private startTask(task: PoolTask): void {
    const handle = this.handles.get(task.id);
    if (!handle) return;

    handle.status = 'running';
    handle.startedAt = new Date();
    this.running.set(task.id, handle);

    this.emit({
      taskId: task.id,
      type: 'started',
    });

    this.executor.execute(task, (taskId, result, error) => {
      this.updateStatus(taskId, result, error);
      this.running.delete(taskId);
      this.evictStaleHandles();
      this.emit({
        taskId,
        type: result,
        error,
      });

      if (!this.queue.isEmpty() && this.running.size < this.config.maxConcurrency) {
        const next = this.queue.dequeue();
        if (next) this.startTask(next);
      }
    });
  }

  private updateStatus(taskId: string, status: PoolTaskStatus, error?: string): void {
    const handle = this.handles.get(taskId);
    if (!handle) return;
    handle.status = status;
    if (status === 'completed' || status === 'failed') {
      handle.completedAt = new Date();
    }
    if (error) handle.error = error;
  }

  private evictStaleHandles(): void {
    const now = Date.now();
    for (const [id, handle] of this.handles) {
      if (handle.status === 'completed' || handle.status === 'failed') {
        if (handle.completedAt && now - handle.completedAt.getTime() > HANDLE_TTL_MS) {
          this.handles.delete(id);
        }
      }
    }
    // If still over limit, evict oldest
    while (this.handles.size > MAX_HANDLES) {
      const oldest = this.handles.keys().next().value;
      if (oldest !== undefined) {
        this.handles.delete(oldest);
      } else {
        break;
      }
    }
  }

  private emit(event: PoolEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }
}
