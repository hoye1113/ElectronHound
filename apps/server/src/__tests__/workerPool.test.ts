import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskQueue } from '../services/workerPool/queue.js';
import { WorkerPoolManager } from '../services/workerPool/manager.js';
import type { PoolTask, TaskExecutor, PoolEvent } from '../services/workerPool/types.js';

function makeTask(overrides: Partial<PoolTask> = {}): PoolTask {
  return {
    id: 'task-1',
    goal: 'Test goal',
    targetAppPath: '/test/app',
    llmModel: 'gpt-4o',
    priority: 'medium',
    ...overrides,
  };
}

describe('WorkerPool TaskQueue', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  it('starts empty', () => {
    expect(queue.isEmpty()).toBe(true);
    expect(queue.size()).toBe(0);
    expect(queue.peek()).toBeUndefined();
    expect(queue.dequeue()).toBeUndefined();
  });

  it('enqueues and dequeues in FIFO within same priority', () => {
    queue.enqueue(makeTask({ id: 't1', priority: 'medium' }));
    queue.enqueue(makeTask({ id: 't2', priority: 'medium' }));

    expect(queue.size()).toBe(2);
    expect(queue.dequeue()!.id).toBe('t1');
    expect(queue.dequeue()!.id).toBe('t2');
    expect(queue.isEmpty()).toBe(true);
  });

  it('prioritizes high over medium and low', () => {
    queue.enqueue(makeTask({ id: 'low-1', priority: 'low' }));
    queue.enqueue(makeTask({ id: 'high-1', priority: 'high' }));
    queue.enqueue(makeTask({ id: 'med-1', priority: 'medium' }));

    expect(queue.dequeue()!.id).toBe('high-1');
    expect(queue.dequeue()!.id).toBe('med-1');
    expect(queue.dequeue()!.id).toBe('low-1');
  });

  it('peek returns highest priority without removing', () => {
    queue.enqueue(makeTask({ id: 'low-1', priority: 'low' }));
    queue.enqueue(makeTask({ id: 'high-1', priority: 'high' }));

    expect(queue.peek()!.id).toBe('high-1');
    expect(queue.size()).toBe(2);
  });

  it('remove removes a specific task', () => {
    queue.enqueue(makeTask({ id: 't1', priority: 'medium' }));
    queue.enqueue(makeTask({ id: 't2', priority: 'medium' }));

    expect(queue.remove('t1')).toBe(true);
    expect(queue.size()).toBe(1);
    expect(queue.dequeue()!.id).toBe('t2');
  });

  it('remove returns false for non-existent task', () => {
    queue.enqueue(makeTask({ id: 't1' }));
    expect(queue.remove('nonexistent')).toBe(false);
  });

  it('handles mixed priorities correctly', () => {
    queue.enqueue(makeTask({ id: 'm1', priority: 'medium' }));
    queue.enqueue(makeTask({ id: 'h1', priority: 'high' }));
    queue.enqueue(makeTask({ id: 'l1', priority: 'low' }));
    queue.enqueue(makeTask({ id: 'h2', priority: 'high' }));
    queue.enqueue(makeTask({ id: 'm2', priority: 'medium' }));

    expect(queue.dequeue()!.id).toBe('h1');
    expect(queue.dequeue()!.id).toBe('h2');
    expect(queue.dequeue()!.id).toBe('m1');
    expect(queue.dequeue()!.id).toBe('m2');
    expect(queue.dequeue()!.id).toBe('l1');
  });
});

describe('WorkerPoolManager', () => {
  let mockExecutor: TaskExecutor;
  let completionCallbacks: Map<string, (taskId: string, result: 'completed' | 'failed', error?: string) => void>;

  beforeEach(() => {
    completionCallbacks = new Map();
    mockExecutor = {
      execute: vi.fn((task, onComplete) => {
        // Store callback for manual completion
        completionCallbacks.set(task.id, onComplete);
      }),
      cancel: vi.fn(),
    };
  });

  function completeTask(taskId: string, result: 'completed' | 'failed' = 'completed') {
    const cb = completionCallbacks.get(taskId);
    if (cb) cb(taskId, result);
  }

  it('submits and starts task immediately when under concurrency limit', () => {
    const manager = new WorkerPoolManager({ maxConcurrency: 2 }, mockExecutor);
    const id = manager.submit(makeTask());

    expect(id).toBe('task-1');
    expect(manager.getRunningCount()).toBe(1);
    expect(mockExecutor.execute).toHaveBeenCalled();
  });

  it('queues task when at concurrency limit', () => {
    const manager = new WorkerPoolManager({ maxConcurrency: 1 }, mockExecutor);
    manager.submit(makeTask({ id: 't1' }));
    manager.submit(makeTask({ id: 't2' }));

    expect(manager.getRunningCount()).toBe(1);
    expect(manager.getQueueLength()).toBe(1);
  });

  it('starts next task when current completes', () => {
    const manager = new WorkerPoolManager({ maxConcurrency: 1 }, mockExecutor);
    manager.submit(makeTask({ id: 't1' }));
    manager.submit(makeTask({ id: 't2' }));

    expect(manager.getRunningCount()).toBe(1);
    expect(manager.getQueueLength()).toBe(1);

    // Complete t1 → t2 should start
    completeTask('t1');
    expect(manager.getRunningCount()).toBe(1);
    expect(manager.getQueueLength()).toBe(0);
    expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
  });

  it('cancels a running task', () => {
    const manager = new WorkerPoolManager({ maxConcurrency: 2 }, mockExecutor);
    manager.submit(makeTask({ id: 't1' }));

    const result = manager.cancel('t1');
    expect(result).toBe(true);
    expect(mockExecutor.cancel).toHaveBeenCalledWith('t1');
  });

  it('cancels a queued task', () => {
    const neverCompleteExecutor: TaskExecutor = {
      execute: vi.fn(), // never calls onComplete
      cancel: vi.fn(),
    };
    const manager = new WorkerPoolManager({ maxConcurrency: 1 }, neverCompleteExecutor);
    manager.submit(makeTask({ id: 't1' }));
    manager.submit(makeTask({ id: 't2' }));

    const result = manager.cancel('t2');
    expect(result).toBe(true);
    expect(manager.getQueueLength()).toBe(0);
  });

  it('cancel returns false for unknown task', () => {
    const manager = new WorkerPoolManager({ maxConcurrency: 2 }, mockExecutor);
    expect(manager.cancel('nonexistent')).toBe(false);
  });

  it('getStatus returns handle for submitted task', () => {
    const manager = new WorkerPoolManager({ maxConcurrency: 2 }, mockExecutor);
    manager.submit(makeTask({ id: 't1' }));

    const handle = manager.getStatus('t1');
    expect(handle).toBeDefined();
    expect(handle!.taskId).toBe('t1');
    expect(handle!.status).toBe('running');
  });

  it('getStatus returns undefined for unknown task', () => {
    const manager = new WorkerPoolManager({ maxConcurrency: 2 }, mockExecutor);
    expect(manager.getStatus('unknown')).toBeUndefined();
  });

  it('emits started event', () => {
    const events: PoolEvent[] = [];
    const manager = new WorkerPoolManager({ maxConcurrency: 2 }, mockExecutor);
    manager.onEvent((e) => events.push(e));

    manager.submit(makeTask());

    expect(events.some((e) => e.type === 'started')).toBe(true);
  });

  it('emits completed event', () => {
    const events: PoolEvent[] = [];
    const manager = new WorkerPoolManager({ maxConcurrency: 2 }, mockExecutor);
    manager.onEvent((e) => events.push(e));

    manager.submit(makeTask({ id: 't1' }));
    completeTask('t1');

    expect(events.some((e) => e.type === 'completed')).toBe(true);
  });

  it('shutdown cancels all running tasks', () => {
    const manager = new WorkerPoolManager({ maxConcurrency: 3 }, mockExecutor);
    manager.submit(makeTask({ id: 't1' }));
    manager.submit(makeTask({ id: 't2' }));

    manager.shutdown();

    expect(mockExecutor.cancel).toHaveBeenCalledWith('t1');
    expect(mockExecutor.cancel).toHaveBeenCalledWith('t2');
    expect(manager.getRunningCount()).toBe(0);
  });
});
