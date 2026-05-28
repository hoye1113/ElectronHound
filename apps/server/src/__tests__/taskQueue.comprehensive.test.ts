import { describe, it, expect, beforeEach } from 'vitest';
import { TaskQueue } from '../services/workerPool/queue.js';
import type { PoolTask, TaskPriority } from '../services/workerPool/types.js';

// ── Helpers ─────────────────────────────────────────────────────────

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

function makeTasks(count: number, priority: TaskPriority = 'medium'): PoolTask[] {
  return Array.from({ length: count }, (_, i) =>
    makeTask({ id: `t-${priority}-${i + 1}`, priority }),
  );
}

// ── Tests ───────────────────────────────────────────────────────────

describe('TaskQueue (comprehensive)', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  // ── Initial state ───────────────────────────────────────────────

  describe('initial state', () => {
    it('isEmpty returns true', () => {
      expect(queue.isEmpty()).toBe(true);
    });

    it('size returns 0', () => {
      expect(queue.size()).toBe(0);
    });

    it('peek returns undefined', () => {
      expect(queue.peek()).toBeUndefined();
    });

    it('dequeue returns undefined', () => {
      expect(queue.dequeue()).toBeUndefined();
    });

    it('remove returns false', () => {
      expect(queue.remove('anything')).toBe(false);
    });
  });

  // ── FIFO order ─────────────────────────────────────────────────

  describe('FIFO order within same priority', () => {
    it('preserves insertion order for medium tasks', () => {
      queue.enqueue(makeTask({ id: 'a', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 'b', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 'c', priority: 'medium' }));

      expect(queue.dequeue()!.id).toBe('a');
      expect(queue.dequeue()!.id).toBe('b');
      expect(queue.dequeue()!.id).toBe('c');
    });

    it('preserves insertion order for high tasks', () => {
      queue.enqueue(makeTask({ id: 'x', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'y', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'z', priority: 'high' }));

      expect(queue.dequeue()!.id).toBe('x');
      expect(queue.dequeue()!.id).toBe('y');
      expect(queue.dequeue()!.id).toBe('z');
    });

    it('preserves insertion order for low tasks', () => {
      queue.enqueue(makeTask({ id: 'l1', priority: 'low' }));
      queue.enqueue(makeTask({ id: 'l2', priority: 'low' }));

      expect(queue.dequeue()!.id).toBe('l1');
      expect(queue.dequeue()!.id).toBe('l2');
    });

    it('preserves FIFO across enqueue-dequeue-enqueue cycles', () => {
      queue.enqueue(makeTask({ id: 'a', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 'b', priority: 'medium' }));
      expect(queue.dequeue()!.id).toBe('a');

      queue.enqueue(makeTask({ id: 'c', priority: 'medium' }));
      expect(queue.dequeue()!.id).toBe('b');
      expect(queue.dequeue()!.id).toBe('c');
    });
  });

  // ── Priority ordering ─────────────────────────────────────────

  describe('priority ordering', () => {
    it('high beats medium beats low regardless of insertion order', () => {
      queue.enqueue(makeTask({ id: 'low', priority: 'low' }));
      queue.enqueue(makeTask({ id: 'medium', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 'high', priority: 'high' }));

      expect(queue.dequeue()!.id).toBe('high');
      expect(queue.dequeue()!.id).toBe('medium');
      expect(queue.dequeue()!.id).toBe('low');
    });

    it('exhausts high before moving to medium', () => {
      queue.enqueue(makeTask({ id: 'm1', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 'h1', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'h2', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'm2', priority: 'medium' }));

      expect(queue.dequeue()!.id).toBe('h1');
      expect(queue.dequeue()!.id).toBe('h2');
      expect(queue.dequeue()!.id).toBe('m1');
      expect(queue.dequeue()!.id).toBe('m2');
    });

    it('exhausts medium before moving to low', () => {
      queue.enqueue(makeTask({ id: 'l1', priority: 'low' }));
      queue.enqueue(makeTask({ id: 'm1', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 'l2', priority: 'low' }));
      queue.enqueue(makeTask({ id: 'm2', priority: 'medium' }));

      expect(queue.dequeue()!.id).toBe('m1');
      expect(queue.dequeue()!.id).toBe('m2');
      expect(queue.dequeue()!.id).toBe('l1');
      expect(queue.dequeue()!.id).toBe('l2');
    });

    it('correctly interleaves enqueue and dequeue across priorities', () => {
      queue.enqueue(makeTask({ id: 'l1', priority: 'low' }));
      queue.enqueue(makeTask({ id: 'h1', priority: 'high' }));

      expect(queue.dequeue()!.id).toBe('h1');

      queue.enqueue(makeTask({ id: 'h2', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'm1', priority: 'medium' }));

      // h2 should come next (high), then m1, then l1
      expect(queue.dequeue()!.id).toBe('h2');
      expect(queue.dequeue()!.id).toBe('m1');
      expect(queue.dequeue()!.id).toBe('l1');
    });

    it('handles only one priority level populated', () => {
      queue.enqueue(makeTask({ id: 'h1', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'h2', priority: 'high' }));

      expect(queue.dequeue()!.id).toBe('h1');
      expect(queue.dequeue()!.id).toBe('h2');
      expect(queue.dequeue()).toBeUndefined();
    });
  });

  // ── Peek ──────────────────────────────────────────────────────

  describe('peek', () => {
    it('returns the highest priority task without removing it', () => {
      queue.enqueue(makeTask({ id: 'low', priority: 'low' }));
      queue.enqueue(makeTask({ id: 'high', priority: 'high' }));

      expect(queue.peek()!.id).toBe('high');
      expect(queue.size()).toBe(2);
    });

    it('returns the same element on repeated peeks', () => {
      queue.enqueue(makeTask({ id: 'a' }));
      expect(queue.peek()!.id).toBe('a');
      expect(queue.peek()!.id).toBe('a');
    });

    it('updates after dequeue', () => {
      queue.enqueue(makeTask({ id: 'a', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'b', priority: 'medium' }));

      queue.dequeue();
      expect(queue.peek()!.id).toBe('b');
    });

    it('returns undefined when all items dequeued', () => {
      queue.enqueue(makeTask({ id: 'a' }));
      queue.dequeue();
      expect(queue.peek()).toBeUndefined();
    });
  });

  // ── Size tracking ─────────────────────────────────────────────

  describe('size tracking', () => {
    it('increments on enqueue', () => {
      queue.enqueue(makeTask({ id: 'a' }));
      expect(queue.size()).toBe(1);
      queue.enqueue(makeTask({ id: 'b' }));
      expect(queue.size()).toBe(2);
    });

    it('decrements on dequeue', () => {
      queue.enqueue(makeTask({ id: 'a' }));
      queue.enqueue(makeTask({ id: 'b' }));
      queue.dequeue();
      expect(queue.size()).toBe(1);
    });

    it('decrements on remove', () => {
      queue.enqueue(makeTask({ id: 'a' }));
      queue.enqueue(makeTask({ id: 'b' }));
      queue.remove('a');
      expect(queue.size()).toBe(1);
    });

    it('accurately counts across all priority buckets', () => {
      queue.enqueue(makeTask({ id: 'h1', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'm1', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 'l1', priority: 'low' }));
      queue.enqueue(makeTask({ id: 'h2', priority: 'high' }));

      expect(queue.size()).toBe(4);

      queue.dequeue(); // h1
      expect(queue.size()).toBe(3);

      queue.dequeue(); // h2
      expect(queue.size()).toBe(2);
    });

    it('returns 0 after all items removed', () => {
      queue.enqueue(makeTask({ id: 'a' }));
      queue.enqueue(makeTask({ id: 'b' }));
      queue.dequeue();
      queue.dequeue();
      expect(queue.size()).toBe(0);
    });
  });

  // ── isEmpty ───────────────────────────────────────────────────

  describe('isEmpty', () => {
    it('returns true on fresh queue', () => {
      expect(queue.isEmpty()).toBe(true);
    });

    it('returns false after enqueue', () => {
      queue.enqueue(makeTask());
      expect(queue.isEmpty()).toBe(false);
    });

    it('returns true after single enqueue then dequeue', () => {
      queue.enqueue(makeTask());
      queue.dequeue();
      expect(queue.isEmpty()).toBe(true);
    });

    it('returns true after all items dequeued', () => {
      queue.enqueue(makeTask({ id: 'a', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'b', priority: 'low' }));
      queue.dequeue();
      queue.dequeue();
      expect(queue.isEmpty()).toBe(true);
    });

    it('returns true after removing all items', () => {
      queue.enqueue(makeTask({ id: 'a' }));
      queue.enqueue(makeTask({ id: 'b' }));
      queue.remove('a');
      queue.remove('b');
      expect(queue.isEmpty()).toBe(true);
    });
  });

  // ── Remove ────────────────────────────────────────────────────

  describe('remove', () => {
    it('removes task from the queue', () => {
      queue.enqueue(makeTask({ id: 'a' }));
      queue.enqueue(makeTask({ id: 'b' }));

      expect(queue.remove('a')).toBe(true);
      expect(queue.size()).toBe(1);
      expect(queue.dequeue()!.id).toBe('b');
    });

    it('returns false for non-existent task', () => {
      queue.enqueue(makeTask({ id: 'a' }));
      expect(queue.remove('nonexistent')).toBe(false);
    });

    it('returns false on empty queue', () => {
      expect(queue.remove('a')).toBe(false);
    });

    it('can remove all tasks one by one', () => {
      queue.enqueue(makeTask({ id: 'a' }));
      queue.enqueue(makeTask({ id: 'b' }));
      queue.enqueue(makeTask({ id: 'c' }));

      expect(queue.remove('a')).toBe(true);
      expect(queue.remove('b')).toBe(true);
      expect(queue.remove('c')).toBe(true);
      expect(queue.isEmpty()).toBe(true);
    });

    it('remove from high bucket does not affect medium/low', () => {
      queue.enqueue(makeTask({ id: 'h1', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'm1', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 'l1', priority: 'low' }));

      queue.remove('h1');

      expect(queue.dequeue()!.id).toBe('m1');
      expect(queue.dequeue()!.id).toBe('l1');
    });

    it('remove from low bucket does not affect high/medium', () => {
      queue.enqueue(makeTask({ id: 'h1', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'm1', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 'l1', priority: 'low' }));

      queue.remove('l1');

      expect(queue.dequeue()!.id).toBe('h1');
      expect(queue.dequeue()!.id).toBe('m1');
      expect(queue.isEmpty()).toBe(true);
    });

    it('remove adjusts index correctly when removing before current index', () => {
      // Enqueue 3 medium tasks: [t1, t2, t3], index=0
      queue.enqueue(makeTask({ id: 't1', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 't2', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 't3', priority: 'medium' }));

      // Dequeue t1: bucket=[t1,t2,t3], index=1
      expect(queue.dequeue()!.id).toBe('t1');

      // Remove t2 (at index 1, which equals current index, so index should decrement)
      // After remove: bucket=[t1,t3], and since idx (1) < indices.medium (1) is false, index stays 1
      // But wait - after splice, bucket becomes [t1, t3], index is 1, so next dequeue gives t3
      queue.remove('t2');
      expect(queue.dequeue()!.id).toBe('t3');
      expect(queue.isEmpty()).toBe(true);
    });

    it('remove adjusts index when removing item before dequeued position', () => {
      // Enqueue 4 medium tasks
      queue.enqueue(makeTask({ id: 't1', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 't2', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 't3', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 't4', priority: 'medium' }));

      // Dequeue t1 and t2: bucket=[t1,t2,t3,t4], index=2
      queue.dequeue(); // t1
      queue.dequeue(); // t2

      // Remove t3 (at index 2, current index is 2, idx < index is false, no decrement)
      // After splice: bucket=[t1,t2,t4], index=2, next dequeue = t4
      queue.remove('t3');
      expect(queue.dequeue()!.id).toBe('t4');
      expect(queue.isEmpty()).toBe(true);
    });

    it('can remove the task that peek would return', () => {
      queue.enqueue(makeTask({ id: 'a', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'b', priority: 'medium' }));

      queue.remove('a');
      expect(queue.peek()!.id).toBe('b');
    });
  });

  // ── Memory cleanup (bucket reset) ─────────────────────────────

  describe('memory cleanup on bucket consumption', () => {
    it('resets high bucket after full consumption', () => {
      queue.enqueue(makeTask({ id: 'h1', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'h2', priority: 'high' }));

      queue.dequeue(); // h1
      queue.dequeue(); // h2 - triggers bucket reset

      // Enqueue new high tasks to confirm bucket is clean
      queue.enqueue(makeTask({ id: 'h3', priority: 'high' }));
      expect(queue.dequeue()!.id).toBe('h3');
      expect(queue.size()).toBe(0);
    });

    it('resets medium bucket after full consumption', () => {
      queue.enqueue(makeTask({ id: 'm1', priority: 'medium' }));

      queue.dequeue(); // m1 - triggers reset

      queue.enqueue(makeTask({ id: 'm2', priority: 'medium' }));
      expect(queue.dequeue()!.id).toBe('m2');
    });

    it('resets low bucket after full consumption', () => {
      queue.enqueue(makeTask({ id: 'l1', priority: 'low' }));

      queue.dequeue(); // l1 - triggers reset

      queue.enqueue(makeTask({ id: 'l2', priority: 'low' }));
      expect(queue.dequeue()!.id).toBe('l2');
    });

    it('does not reset bucket if partially consumed', () => {
      queue.enqueue(makeTask({ id: 'h1', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'h2', priority: 'high' }));

      queue.dequeue(); // h1 - partial consumption, no reset

      // h2 should still be available
      expect(queue.dequeue()!.id).toBe('h2');
    });

    it('allows re-enqueue after bucket reset', () => {
      // Fully consume high bucket
      queue.enqueue(makeTask({ id: 'h1', priority: 'high' }));
      queue.dequeue();

      // Re-enqueue into high
      queue.enqueue(makeTask({ id: 'h2', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'h3', priority: 'high' }));

      expect(queue.dequeue()!.id).toBe('h2');
      expect(queue.dequeue()!.id).toBe('h3');
    });
  });

  // ── Single item edge cases ────────────────────────────────────

  describe('single item operations', () => {
    it('enqueue and dequeue single item', () => {
      queue.enqueue(makeTask({ id: 'solo' }));
      expect(queue.dequeue()!.id).toBe('solo');
      expect(queue.isEmpty()).toBe(true);
    });

    it('peek single item', () => {
      queue.enqueue(makeTask({ id: 'solo' }));
      expect(queue.peek()!.id).toBe('solo');
      expect(queue.size()).toBe(1);
    });

    it('remove single item', () => {
      queue.enqueue(makeTask({ id: 'solo' }));
      expect(queue.remove('solo')).toBe(true);
      expect(queue.isEmpty()).toBe(true);
    });
  });

  // ── Concurrent-like enqueue/dequeue patterns ──────────────────

  describe('interleaved enqueue and dequeue', () => {
    it('handles rapid enqueue-dequeue alternation', () => {
      queue.enqueue(makeTask({ id: 'a' }));
      expect(queue.dequeue()!.id).toBe('a');

      queue.enqueue(makeTask({ id: 'b' }));
      expect(queue.dequeue()!.id).toBe('b');

      queue.enqueue(makeTask({ id: 'c' }));
      expect(queue.dequeue()!.id).toBe('c');

      expect(queue.isEmpty()).toBe(true);
    });

    it('handles batch enqueue followed by batch dequeue', () => {
      for (let i = 1; i <= 100; i++) {
        queue.enqueue(makeTask({ id: `t${i}`, priority: 'medium' }));
      }
      expect(queue.size()).toBe(100);

      for (let i = 1; i <= 100; i++) {
        expect(queue.dequeue()!.id).toBe(`t${i}`);
      }
      expect(queue.isEmpty()).toBe(true);
    });

    it('handles dequeue on empty queue after consuming all', () => {
      queue.enqueue(makeTask({ id: 'a' }));
      queue.dequeue();
      expect(queue.dequeue()).toBeUndefined();
      expect(queue.dequeue()).toBeUndefined();
    });

    it('maintains correct state through complex interleaving', () => {
      queue.enqueue(makeTask({ id: 'h1', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'l1', priority: 'low' }));

      expect(queue.dequeue()!.id).toBe('h1'); // high consumed

      queue.enqueue(makeTask({ id: 'm1', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 'h2', priority: 'high' }));

      expect(queue.dequeue()!.id).toBe('h2'); // new high
      expect(queue.dequeue()!.id).toBe('m1'); // medium
      expect(queue.dequeue()!.id).toBe('l1'); // low (original)
      expect(queue.isEmpty()).toBe(true);
    });
  });

  // ── Large scale operations ────────────────────────────────────

  describe('large scale', () => {
    it('handles 1000 items across all priorities', () => {
      const high = makeTasks(300, 'high');
      const medium = makeTasks(400, 'medium');
      const low = makeTasks(300, 'low');

      // Shuffle insertion
      const all = [...low, ...high, ...medium];
      for (const task of all) {
        queue.enqueue(task);
      }

      expect(queue.size()).toBe(1000);

      // Should dequeue all high first, then medium, then low
      for (let i = 0; i < 300; i++) {
        expect(queue.dequeue()!.priority).toBe('high');
      }
      for (let i = 0; i < 400; i++) {
        expect(queue.dequeue()!.priority).toBe('medium');
      }
      for (let i = 0; i < 300; i++) {
        expect(queue.dequeue()!.priority).toBe('low');
      }
      expect(queue.isEmpty()).toBe(true);
    });

    it('handles many remove operations', () => {
      const tasks = makeTasks(50, 'medium');
      for (const task of tasks) {
        queue.enqueue(task);
      }

      // Remove every other task
      for (let i = 0; i < 50; i += 2) {
        expect(queue.remove(`t-medium-${i + 1}`)).toBe(true);
      }
      expect(queue.size()).toBe(25);

      // Dequeue remaining in order
      for (let i = 1; i < 50; i += 2) {
        expect(queue.dequeue()!.id).toBe(`t-medium-${i + 1}`);
      }
      expect(queue.isEmpty()).toBe(true);
    });
  });

  // ── Task with optional fields ─────────────────────────────────

  describe('task field preservation', () => {
    it('preserves all task fields through enqueue/dequeue', () => {
      const task = makeTask({
        id: 'full-task',
        goal: 'Specific goal',
        targetAppPath: '/specific/path',
        llmModel: 'claude-3-opus',
        priority: 'high',
        maxSteps: 10,
        contextInjection: 'some context',
        providerId: 'provider-1',
      });

      queue.enqueue(task);
      const dequeued = queue.dequeue()!;

      expect(dequeued.id).toBe('full-task');
      expect(dequeued.goal).toBe('Specific goal');
      expect(dequeued.targetAppPath).toBe('/specific/path');
      expect(dequeued.llmModel).toBe('claude-3-opus');
      expect(dequeued.priority).toBe('high');
      expect(dequeued.maxSteps).toBe(10);
      expect(dequeued.contextInjection).toBe('some context');
      expect(dequeued.providerId).toBe('provider-1');
    });

    it('preserves tasks without optional fields', () => {
      const task: PoolTask = {
        id: 'minimal',
        goal: 'goal',
        targetAppPath: '/path',
        llmModel: 'model',
        priority: 'low',
      };

      queue.enqueue(task);
      const dequeued = queue.dequeue()!;

      expect(dequeued.maxSteps).toBeUndefined();
      expect(dequeued.contextInjection).toBeUndefined();
      expect(dequeued.providerId).toBeUndefined();
    });
  });

  // ── Remove + size + isEmpty consistency ───────────────────────

  describe('remove consistency with size and isEmpty', () => {
    it('size and isEmpty stay consistent after multiple removes', () => {
      queue.enqueue(makeTask({ id: 'a' }));
      queue.enqueue(makeTask({ id: 'b' }));
      queue.enqueue(makeTask({ id: 'c' }));

      queue.remove('b');
      expect(queue.size()).toBe(2);
      expect(queue.isEmpty()).toBe(false);

      queue.remove('a');
      expect(queue.size()).toBe(1);
      expect(queue.isEmpty()).toBe(false);

      queue.remove('c');
      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });

    it('remove non-existent does not change size', () => {
      queue.enqueue(makeTask({ id: 'a' }));
      const sizeBefore = queue.size();

      queue.remove('nonexistent');
      expect(queue.size()).toBe(sizeBefore);
    });

    it('remove already-dequeued id returns false', () => {
      queue.enqueue(makeTask({ id: 'a' }));
      queue.dequeue();

      // Task 'a' was already consumed; bucket was reset, so findIndex won't find it
      expect(queue.remove('a')).toBe(false);
    });
  });

  // ── Peek + dequeue consistency ────────────────────────────────

  describe('peek and dequeue consistency', () => {
    it('peek always returns what dequeue would return', () => {
      queue.enqueue(makeTask({ id: 'h1', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'm1', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 'l1', priority: 'low' }));
      queue.enqueue(makeTask({ id: 'h2', priority: 'high' }));

      while (!queue.isEmpty()) {
        const peeked = queue.peek();
        const dequeued = queue.dequeue();
        expect(peeked!.id).toBe(dequeued!.id);
        expect(peeked!.priority).toBe(dequeued!.priority);
      }
    });

    it('peek returns undefined after queue fully drained', () => {
      queue.enqueue(makeTask({ id: 'a' }));
      queue.dequeue();
      expect(queue.peek()).toBeUndefined();
    });
  });

  // ── Stress test: full lifecycle ───────────────────────────────

  describe('full lifecycle stress test', () => {
    it('handles complex mix of enqueue, dequeue, remove, and peek', () => {
      // Phase 1: Populate
      queue.enqueue(makeTask({ id: 'h1', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'm1', priority: 'medium' }));
      queue.enqueue(makeTask({ id: 'l1', priority: 'low' }));
      queue.enqueue(makeTask({ id: 'h2', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'm2', priority: 'medium' }));
      expect(queue.size()).toBe(5);

      // Phase 2: Partial drain
      expect(queue.dequeue()!.id).toBe('h1');
      expect(queue.dequeue()!.id).toBe('h2');
      expect(queue.size()).toBe(3);

      // Phase 3: Remove from middle
      queue.remove('m1');
      expect(queue.size()).toBe(2);

      // Phase 4: Add more
      queue.enqueue(makeTask({ id: 'h3', priority: 'high' }));
      queue.enqueue(makeTask({ id: 'l2', priority: 'low' }));
      expect(queue.size()).toBe(4);

      // Phase 5: Drain respecting priority
      expect(queue.dequeue()!.id).toBe('h3');
      expect(queue.dequeue()!.id).toBe('m2');
      expect(queue.dequeue()!.id).toBe('l1');
      expect(queue.dequeue()!.id).toBe('l2');
      expect(queue.isEmpty()).toBe(true);
    });
  });
});
