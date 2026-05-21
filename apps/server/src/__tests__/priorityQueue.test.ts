import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskQueue } from '../services/workerPool/queue.js';
import { WorkerPoolManager } from '../services/workerPool/index.js';
import type { PoolTask, TaskExecutor } from '../services/workerPool/types.js';
import {
  CreateTaskRequestSchema,
  TaskSchema,
} from '@eata/shared-types';

// ── Helpers ───────────────────────────────────────────────────────────

function makeTask(overrides: Partial<PoolTask> = {}): PoolTask {
  return {
    id: overrides.id ?? 'task-1',
    goal: overrides.goal ?? 'Test goal',
    targetAppPath: overrides.targetAppPath ?? '/app',
    llmModel: overrides.llmModel ?? 'gpt-4o',
    priority: overrides.priority ?? 'medium',
    maxSteps: overrides.maxSteps,
    contextInjection: overrides.contextInjection,
    providerId: overrides.providerId,
  };
}

// ── TaskQueue unit tests ────────────────────────────────────────────

describe('TaskQueue priority ordering', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  it('dequeues high priority before medium and low', () => {
    queue.enqueue(makeTask({ id: 'low-1', priority: 'low' }));
    queue.enqueue(makeTask({ id: 'high-1', priority: 'high' }));
    queue.enqueue(makeTask({ id: 'med-1', priority: 'medium' }));

    expect(queue.dequeue()?.id).toBe('high-1');
    expect(queue.dequeue()?.id).toBe('med-1');
    expect(queue.dequeue()?.id).toBe('low-1');
  });

  it('dequeues medium priority before low', () => {
    queue.enqueue(makeTask({ id: 'low-1', priority: 'low' }));
    queue.enqueue(makeTask({ id: 'med-1', priority: 'medium' }));

    expect(queue.dequeue()?.id).toBe('med-1');
    expect(queue.dequeue()?.id).toBe('low-1');
  });

  it('preserves FIFO within the same priority bucket', () => {
    queue.enqueue(makeTask({ id: 'high-a', priority: 'high' }));
    queue.enqueue(makeTask({ id: 'high-b', priority: 'high' }));
    queue.enqueue(makeTask({ id: 'high-c', priority: 'high' }));

    expect(queue.dequeue()?.id).toBe('high-a');
    expect(queue.dequeue()?.id).toBe('high-b');
    expect(queue.dequeue()?.id).toBe('high-c');
  });

  it('handles interleaved priorities correctly', () => {
    queue.enqueue(makeTask({ id: 'm1', priority: 'medium' }));
    queue.enqueue(makeTask({ id: 'h1', priority: 'high' }));
    queue.enqueue(makeTask({ id: 'l1', priority: 'low' }));
    queue.enqueue(makeTask({ id: 'h2', priority: 'high' }));
    queue.enqueue(makeTask({ id: 'm2', priority: 'medium' }));
    queue.enqueue(makeTask({ id: 'l2', priority: 'low' }));

    expect(queue.dequeue()?.id).toBe('h1');
    expect(queue.dequeue()?.id).toBe('h2');
    expect(queue.dequeue()?.id).toBe('m1');
    expect(queue.dequeue()?.id).toBe('m2');
    expect(queue.dequeue()?.id).toBe('l1');
    expect(queue.dequeue()?.id).toBe('l2');
  });

  it('peek returns highest priority without removing', () => {
    queue.enqueue(makeTask({ id: 'low-1', priority: 'low' }));
    queue.enqueue(makeTask({ id: 'med-1', priority: 'medium' }));

    expect(queue.peek()?.id).toBe('med-1');
    expect(queue.size()).toBe(2);
  });

  it('peek returns high before medium and low', () => {
    queue.enqueue(makeTask({ id: 'low-1', priority: 'low' }));
    queue.enqueue(makeTask({ id: 'high-1', priority: 'high' }));
    queue.enqueue(makeTask({ id: 'med-1', priority: 'medium' }));

    expect(queue.peek()?.id).toBe('high-1');
  });

  it('remove works across all priority buckets', () => {
    queue.enqueue(makeTask({ id: 'low-1', priority: 'low' }));
    queue.enqueue(makeTask({ id: 'high-1', priority: 'high' }));
    queue.enqueue(makeTask({ id: 'med-1', priority: 'medium' }));

    expect(queue.remove('med-1')).toBe(true);
    expect(queue.size()).toBe(2);
    expect(queue.remove('nonexistent')).toBe(false);
  });

  it('size counts all buckets', () => {
    queue.enqueue(makeTask({ id: 'l1', priority: 'low' }));
    queue.enqueue(makeTask({ id: 'm1', priority: 'medium' }));
    queue.enqueue(makeTask({ id: 'h1', priority: 'high' }));
    expect(queue.size()).toBe(3);
  });

  it('isEmpty returns true when all buckets are empty', () => {
    expect(queue.isEmpty()).toBe(true);
    queue.enqueue(makeTask({ id: 'm1', priority: 'medium' }));
    expect(queue.isEmpty()).toBe(false);
  });

  it('dequeue returns undefined when empty', () => {
    expect(queue.dequeue()).toBeUndefined();
  });
});

// ── WorkerPoolManager priority integration ──────────────────────────

describe('WorkerPoolManager priority integration', () => {
  let executor: TaskExecutor;
  let executeCallback: Map<string, (taskId: string, result: 'completed' | 'failed', error?: string) => void>;

  beforeEach(() => {
    executeCallback = new Map();
    executor = {
      execute: vi.fn((task: PoolTask, onComplete) => {
        executeCallback.set(task.id, onComplete);
      }),
      cancel: vi.fn(),
    };
  });

  function completeTask(taskId: string, result: 'completed' | 'failed' = 'completed') {
    const cb = executeCallback.get(taskId);
    if (cb) cb(taskId, result);
  }

  it('submits tasks with their specified priority', () => {
    const pool = new WorkerPoolManager({ maxConcurrency: 1 }, executor);

    pool.submit(makeTask({ id: 't1', priority: 'high' }));
    const handle = pool.getStatus('t1');
    expect(handle?.priority).toBe('high');
  });

  it('queues excess tasks respecting priority order', () => {
    const pool = new WorkerPoolManager({ maxConcurrency: 1 }, executor);

    // Fill the single concurrency slot
    pool.submit(makeTask({ id: 'running', priority: 'medium' }));

    // Queue tasks in scrambled priority order
    pool.submit(makeTask({ id: 'low-1', priority: 'low' }));
    pool.submit(makeTask({ id: 'med-1', priority: 'medium' }));
    pool.submit(makeTask({ id: 'high-1', priority: 'high' }));

    expect(pool.getQueueLength()).toBe(3);

    // Complete the running task — next dequeued should be high priority
    completeTask('running');

    expect(executeCallback.has('high-1')).toBe(true);
  });

  it('dequeues high priority task first when slot opens', () => {
    const pool = new WorkerPoolManager({ maxConcurrency: 1 }, executor);

    pool.submit(makeTask({ id: 'slot-filler', priority: 'medium' }));
    pool.submit(makeTask({ id: 'low-q', priority: 'low' }));
    pool.submit(makeTask({ id: 'high-q', priority: 'high' }));
    pool.submit(makeTask({ id: 'med-q', priority: 'medium' }));

    completeTask('slot-filler');

    // high-q should be the one started next
    const highHandle = pool.getStatus('high-q');
    expect(highHandle?.status).toBe('running');

    const lowHandle = pool.getStatus('low-q');
    expect(lowHandle?.status).toBe('queued');
  });

  it('cancels a queued task regardless of priority', () => {
    const pool = new WorkerPoolManager({ maxConcurrency: 1 }, executor);

    pool.submit(makeTask({ id: 'running', priority: 'medium' }));
    pool.submit(makeTask({ id: 'high-q', priority: 'high' }));

    const cancelled = pool.cancel('high-q');
    expect(cancelled).toBe(true);
    expect(pool.getStatus('high-q')?.status).toBe('cancelled');
    expect(pool.getQueueLength()).toBe(0);
  });
});

// ── Shared-types schema priority validation ─────────────────────────

describe('Shared-types priority schema', () => {
  describe('CreateTaskRequestSchema priority field', () => {
    const validRequest = {
      goal: 'Test goal',
      targetAppPath: '/app',
      llmModel: 'gpt-4o' as const,
    };

    it('defaults priority to medium when not provided', () => {
      const result = CreateTaskRequestSchema.parse(validRequest);
      expect(result.priority).toBe('medium');
    });

    it('accepts high priority', () => {
      const result = CreateTaskRequestSchema.parse({ ...validRequest, priority: 'high' });
      expect(result.priority).toBe('high');
    });

    it('accepts medium priority', () => {
      const result = CreateTaskRequestSchema.parse({ ...validRequest, priority: 'medium' });
      expect(result.priority).toBe('medium');
    });

    it('accepts low priority', () => {
      const result = CreateTaskRequestSchema.parse({ ...validRequest, priority: 'low' });
      expect(result.priority).toBe('low');
    });

    it('rejects invalid priority', () => {
      expect(() =>
        CreateTaskRequestSchema.parse({ ...validRequest, priority: 'urgent' })
      ).toThrow();
    });
  });

  describe('TaskSchema priority field', () => {
    const validTask = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      goal: 'Test goal',
      targetAppPath: '/app',
      llmModel: 'gpt-4o' as const,
      status: 'queued' as const,
      maxSteps: 50,
      stepCount: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    it('includes priority field in parsed task', () => {
      const result = TaskSchema.parse({ ...validTask, priority: 'high' });
      expect(result.priority).toBe('high');
    });

    it('defaults priority to medium when absent', () => {
      const result = TaskSchema.parse(validTask);
      expect(result.priority).toBe('medium');
    });

    it('rejects invalid priority in TaskSchema', () => {
      expect(() =>
        TaskSchema.parse({ ...validTask, priority: 'critical' })
      ).toThrow();
    });
  });
});
