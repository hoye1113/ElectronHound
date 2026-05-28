import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskQueue } from '../services/taskQueue.js';
import { WorkerManager, type WorkerOptions } from '../services/workerManager.js';

// ── Helpers ─────────────────────────────────────────────────────────

const defaultOptions: WorkerOptions = {
  taskId: 'task-1',
  targetAppPath: '/path/to/app',
  goal: 'Test the login form',
  llmModel: 'gpt-4o',
};

function createQueueWithMockedManager(): {
  queue: TaskQueue;
  manager: WorkerManager;
  eventHandlers: Array<(event: { taskId: string; type: string; error?: string }) => void>;
} {
  const eventHandlers: Array<
    (event: { taskId: string; type: string; error?: string }) => void
  > = [];

  const mockManager = {
    spawnWorker: vi.fn(),
    cancelWorker: vi.fn(),
    onEvent: vi.fn((handler: (event: { taskId: string; type: string; error?: string }) => void) => {
      eventHandlers.push(handler);
    }),
    shutdown: vi.fn(),
  } as unknown as WorkerManager;

  const queue = new TaskQueue(mockManager);

  return { queue, manager: mockManager, eventHandlers };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('TaskQueue', () => {
  let queue: TaskQueue;
  let manager: WorkerManager;
  let eventHandlers: Array<
    (event: { taskId: string; type: string; error?: string }) => void
  >;

  beforeEach(() => {
    const mock = createQueueWithMockedManager();
    queue = mock.queue;
    manager = mock.manager;
    eventHandlers = mock.eventHandlers;
  });

  // ── enqueue ─────────────────────────────────────────────────────

  describe('enqueue', () => {
    it('adds entry to queue and starts immediately if no current task', () => {
      const entry = queue.enqueue('task-1', defaultOptions);

      expect(entry.status).toBe('running');
      expect(entry.enqueuedAt).toBeInstanceOf(Date);
      expect(entry.startedAt).toBeInstanceOf(Date);
      expect(manager.spawnWorker).toHaveBeenCalledWith(defaultOptions);
    });

    it('queues subsequent tasks when one is already running', () => {
      queue.enqueue('task-1', defaultOptions);
      expect(manager.spawnWorker).toHaveBeenCalledTimes(1);

      const entry2 = queue.enqueue('task-2', {
        ...defaultOptions,
        taskId: 'task-2',
      });

      expect(entry2.status).toBe('queued');
      expect(entry2.startedAt).toBeUndefined();
      expect(manager.spawnWorker).toHaveBeenCalledTimes(1);
      expect(queue.getQueueLength()).toBe(1);
    });

    it('returns a QueueEntry with correct type', () => {
      const entry = queue.enqueue('task-1', defaultOptions);
      expect(entry.taskId).toBe('task-1');
      expect(entry.status).toBe('running');
      expect(entry.enqueuedAt).toBeInstanceOf(Date);
      expect(entry.options).toEqual(defaultOptions);
    });

    it('enqueue returns queued entry when task is waiting', () => {
      queue.enqueue('task-1', defaultOptions);
      const entry = queue.enqueue('task-2', {
        ...defaultOptions,
        taskId: 'task-2',
      });
      expect(entry.status).toBe('queued');
      expect(queue.getQueueLength()).toBe(1);
    });
  });

  // ── dequeue ─────────────────────────────────────────────────────

  describe('dequeue', () => {
    it('starts the next queued task when current completes', () => {
      queue.enqueue('task-1', defaultOptions);
      queue.enqueue('task-2', { ...defaultOptions, taskId: 'task-2' });

      // Simulate task-1 completing
      const completeHandler = eventHandlers[0];
      completeHandler({ taskId: 'task-1', type: 'completed' });

      // task-2 should now be running
      expect(manager.spawnWorker).toHaveBeenCalledTimes(2);
      expect(manager.spawnWorker).toHaveBeenLastCalledWith({
        ...defaultOptions,
        taskId: 'task-2',
      });
    });

    it('does nothing when queue is empty', () => {
      queue.dequeue();
      expect(manager.spawnWorker).not.toHaveBeenCalled();
    });

    it('does nothing when a task is already running', () => {
      queue.enqueue('task-1', defaultOptions);
      expect(manager.spawnWorker).toHaveBeenCalledTimes(1);

      queue.dequeue();
      // Should NOT spawn again
      expect(manager.spawnWorker).toHaveBeenCalledTimes(1);
    });

    it('starts next task after current task fails', () => {
      queue.enqueue('task-1', defaultOptions);
      queue.enqueue('task-2', { ...defaultOptions, taskId: 'task-2' });

      // Simulate task-1 failing
      const completeHandler = eventHandlers[0];
      completeHandler({ taskId: 'task-1', type: 'failed' });

      // task-2 should now be running
      expect(manager.spawnWorker).toHaveBeenCalledTimes(2);
    });

    it('starts next task after current task is cancelled', () => {
      queue.enqueue('task-1', defaultOptions);
      queue.enqueue('task-2', { ...defaultOptions, taskId: 'task-2' });

      // Simulate task-1 being cancelled
      const completeHandler = eventHandlers[0];
      completeHandler({ taskId: 'task-1', type: 'cancelled' });

      // task-2 should now be running
      expect(manager.spawnWorker).toHaveBeenCalledTimes(2);
    });

    it('continues with next task after spawn failure', () => {
      // Make spawn throw for first task
      (manager.spawnWorker as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => {
          throw new Error('Spawn failed');
        },
      );

      queue.enqueue('task-1', defaultOptions);
      queue.enqueue('task-2', { ...defaultOptions, taskId: 'task-2' });

      // task-1 should have failed, task-2 should be running
      const task1Status = queue.getStatus('task-1');
      expect(task1Status?.status).toBe('failed');

      const task2Status = queue.getStatus('task-2');
      expect(task2Status?.status).toBe('running');
    });
  });

  // ── sequential execution guarantee ──────────────────────────────

  describe('sequential execution', () => {
    it('only runs one task at a time', () => {
      queue.enqueue('task-1', defaultOptions);
      queue.enqueue('task-2', { ...defaultOptions, taskId: 'task-2' });
      queue.enqueue('task-3', { ...defaultOptions, taskId: 'task-3' });

      // Only task-1 should be spawned
      expect(manager.spawnWorker).toHaveBeenCalledTimes(1);
      expect(queue.getQueueLength()).toBe(2);
    });

    it('processes queue in FIFO order', () => {
      const order: string[] = [];

      (manager.spawnWorker as ReturnType<typeof vi.fn>).mockImplementation(
        (options: WorkerOptions) => {
          order.push(options.taskId);
        },
      );

      queue.enqueue('alpha', { ...defaultOptions, taskId: 'alpha' });
      queue.enqueue('beta', { ...defaultOptions, taskId: 'beta' });
      queue.enqueue('gamma', { ...defaultOptions, taskId: 'gamma' });

      // alpha starts immediately
      expect(order).toEqual(['alpha']);

      // alpha completes → beta starts
      eventHandlers[0]({ taskId: 'alpha', type: 'completed' });
      expect(order).toEqual(['alpha', 'beta']);

      // beta completes → gamma starts
      eventHandlers[0]({ taskId: 'beta', type: 'completed' });
      expect(order).toEqual(['alpha', 'beta', 'gamma']);
    });
  });

  // ── cancel ──────────────────────────────────────────────────────

  describe('cancel', () => {
    it('cancels a queued task', () => {
      queue.enqueue('task-1', defaultOptions);
      queue.enqueue('task-2', { ...defaultOptions, taskId: 'task-2' });

      queue.cancel('task-2');

      const status = queue.getStatus('task-2');
      expect(status?.status).toBe('cancelled');
      expect(queue.getQueueLength()).toBe(0);
    });

    it('cancels running task via workerManager', () => {
      queue.enqueue('task-1', defaultOptions);
      expect(queue.isRunning()).toBe(true);

      queue.cancel('task-1');

      expect(manager.cancelWorker).toHaveBeenCalledWith('task-1');
    });

    it('does nothing for non-existent task', () => {
      expect(() => {
        queue.cancel('nonexistent');
      }).not.toThrow();
    });
  });

  // ── getStatus ───────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns current running task', () => {
      queue.enqueue('task-1', defaultOptions);
      const status = queue.getStatus('task-1');

      expect(status).toBeDefined();
      expect(status?.taskId).toBe('task-1');
      expect(status?.status).toBe('running');
    });

    it('returns queued task', () => {
      queue.enqueue('task-1', defaultOptions);
      queue.enqueue('task-2', { ...defaultOptions, taskId: 'task-2' });

      const status = queue.getStatus('task-2');
      expect(status?.status).toBe('queued');
    });

    it('returns undefined for unknown task', () => {
      expect(queue.getStatus('unknown')).toBeUndefined();
    });
  });

  // ── getQueueLength ──────────────────────────────────────────────

  describe('getQueueLength', () => {
    it('returns 0 when queue is empty', () => {
      expect(queue.getQueueLength()).toBe(0);
    });

    it('returns correct count of waiting tasks', () => {
      queue.enqueue('task-1', defaultOptions);
      queue.enqueue('task-2', { ...defaultOptions, taskId: 'task-2' });
      queue.enqueue('task-3', { ...defaultOptions, taskId: 'task-3' });

      // One running, two waiting
      expect(queue.getQueueLength()).toBe(2);
    });
  });

  // ── getCurrentTask ──────────────────────────────────────────────

  describe('getCurrentTask', () => {
    it('returns current task when one is running', () => {
      queue.enqueue('task-1', defaultOptions);
      const current = queue.getCurrentTask();

      expect(current).toBeDefined();
      expect(current?.taskId).toBe('task-1');
      expect(current?.status).toBe('running');
    });

    it('returns null when no task is running', () => {
      expect(queue.getCurrentTask()).toBeNull();
    });

    it('returns null after current task completes and queue is empty', () => {
      queue.enqueue('task-1', defaultOptions);
      eventHandlers[0]({ taskId: 'task-1', type: 'completed' });

      expect(queue.getCurrentTask()).toBeNull();
    });
  });

  // ── isRunning ───────────────────────────────────────────────────

  describe('isRunning', () => {
    it('returns true when a task is running', () => {
      queue.enqueue('task-1', defaultOptions);
      expect(queue.isRunning()).toBe(true);
    });

    it('returns false when no task is running', () => {
      expect(queue.isRunning()).toBe(false);
    });

    it('returns false after all tasks complete', () => {
      queue.enqueue('task-1', defaultOptions);
      eventHandlers[0]({ taskId: 'task-1', type: 'completed' });
      expect(queue.isRunning()).toBe(false);
    });
  });
});
