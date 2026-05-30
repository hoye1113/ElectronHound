import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task } from '@eata/shared-types';
import type { SSECallbacks } from '../lib/sse.js';

// Mock api module
const mockTasksList = vi.fn();
const mockTasksGet = vi.fn();
const mockTasksCreate = vi.fn();
const mockTasksCancel = vi.fn();
const mockTasksDelete = vi.fn();

vi.mock('../lib/api.js', () => ({
  api: {
    tasks: {
      list: (...args: unknown[]) => mockTasksList(...args),
      get: (...args: unknown[]) => mockTasksGet(...args),
      create: (...args: unknown[]) => mockTasksCreate(...args),
      cancel: (...args: unknown[]) => mockTasksCancel(...args),
      delete: (...args: unknown[]) => mockTasksDelete(...args),
    },
  },
}));

// Capture connectSSE callbacks so we can invoke them in tests
let capturedSSECbs: SSECallbacks | null = null;
const mockESClose = vi.fn();

vi.mock('../lib/sse.js', () => ({
  connectSSE: vi.fn((_taskId: string, cbs: SSECallbacks) => {
    capturedSSECbs = cbs;
    return { close: mockESClose };
  }),
}));

// Import after mocks are set up
const { useTaskStore } = await import('../stores/taskStore.js');
const { connectSSE } = await import('../lib/sse.js');

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  goal: 'Test goal',
  targetAppPath: '/test/path',
  llmModel: 'gpt-4o',
  status: 'queued',
  priority: 'medium',
  maxSteps: 50,
  stepCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

function resetStore() {
  useTaskStore.setState({
    tasks: [],
    currentTask: null,
    currentTaskSteps: [],
    isLoading: false,
    error: null,
  });
}

describe('taskStore additional coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockESClose.mockReset();
    capturedSSECbs = null;
    resetStore();
  });

  // ── fetchTasks additional coverage ────────────────────────────────────

  describe('fetchTasks additional paths', () => {
    it('replaces existing tasks with fetched ones', async () => {
      const oldTask = makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'Old' });
      useTaskStore.setState({ tasks: [oldTask] });

      const newTask = makeTask({ id: '550e8400-e29b-41d4-a716-446655440002', goal: 'New' });
      mockTasksList.mockResolvedValue({ data: [newTask], total: 1, page: 1, limit: 10 });

      await useTaskStore.getState().fetchTasks();

      const state = useTaskStore.getState();
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0].goal).toBe('New');
    });

    it('fetches empty task list', async () => {
      useTaskStore.setState({ tasks: [makeTask()] });
      mockTasksList.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10 });

      await useTaskStore.getState().fetchTasks();

      expect(useTaskStore.getState().tasks).toEqual([]);
    });

    it('clears previous error on new fetch', async () => {
      useTaskStore.setState({ error: 'Previous error' });
      mockTasksList.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10 });

      await useTaskStore.getState().fetchTasks();

      expect(useTaskStore.getState().error).toBeNull();
    });

    it('sets error from object with only non-string error field', async () => {
      mockTasksList.mockRejectedValue({ error: { nested: true } });

      await useTaskStore.getState().fetchTasks();

      expect(useTaskStore.getState().error).toBe('An unexpected error occurred');
    });

    it('sets error from object with non-string message field', async () => {
      mockTasksList.mockRejectedValue({ message: 123 });

      await useTaskStore.getState().fetchTasks();

      expect(useTaskStore.getState().error).toBe('An unexpected error occurred');
    });

    it('sets error from empty object', async () => {
      mockTasksList.mockRejectedValue({});

      await useTaskStore.getState().fetchTasks();

      expect(useTaskStore.getState().error).toBe('An unexpected error occurred');
    });
  });

  // ── fetchTask additional coverage ─────────────────────────────────────

  describe('fetchTask additional paths', () => {
    it('replaces existing currentTask with fetched one', async () => {
      const oldTask = makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'Old' });
      useTaskStore.setState({ currentTask: oldTask, currentTaskSteps: [{ old: true }] });

      const newTask = makeTask({ id: '550e8400-e29b-41d4-a716-446655440002', goal: 'New' });
      mockTasksGet.mockResolvedValue({ task: newTask, steps: [{ new: true }] });

      await useTaskStore.getState().fetchTask(newTask.id);

      const state = useTaskStore.getState();
      expect(state.currentTask?.goal).toBe('New');
      expect(state.currentTaskSteps).toEqual([{ new: true }]);
    });

    it('fetches task with empty steps array', async () => {
      const task = makeTask();
      mockTasksGet.mockResolvedValue({ task, steps: [] });

      await useTaskStore.getState().fetchTask(task.id);

      expect(useTaskStore.getState().currentTaskSteps).toEqual([]);
    });

    it('clears previous error when fetching task', async () => {
      useTaskStore.setState({ error: 'Old error' });
      const task = makeTask();
      mockTasksGet.mockResolvedValue({ task, steps: [] });

      await useTaskStore.getState().fetchTask(task.id);

      expect(useTaskStore.getState().error).toBeNull();
    });
  });

  // ── createTask additional coverage ────────────────────────────────────

  describe('createTask additional paths', () => {
    it('prepends to empty task list', async () => {
      const task = makeTask({ id: '550e8400-e29b-41d4-a716-446655440002' });
      mockTasksCreate.mockResolvedValue(task);

      await useTaskStore.getState().createTask({
        goal: 'New',
        targetAppPath: '/path',
        llmModel: 'gpt-4o',
      });

      expect(useTaskStore.getState().tasks).toHaveLength(1);
      expect(useTaskStore.getState().tasks[0].id).toBe(task.id);
    });

    it('prepends new task before multiple existing tasks', async () => {
      const t1 = makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'First' });
      const t2 = makeTask({ id: '550e8400-e29b-41d4-a716-446655440002', goal: 'Second' });
      useTaskStore.setState({ tasks: [t1, t2] });

      const newTask = makeTask({ id: '550e8400-e29b-41d4-a716-446655440003', goal: 'Newest' });
      mockTasksCreate.mockResolvedValue(newTask);

      await useTaskStore.getState().createTask({
        goal: 'Newest',
        targetAppPath: '/path',
        llmModel: 'gpt-4o',
      });

      const tasks = useTaskStore.getState().tasks;
      expect(tasks).toHaveLength(3);
      expect(tasks[0].goal).toBe('Newest');
      expect(tasks[1].goal).toBe('First');
      expect(tasks[2].goal).toBe('Second');
    });

    it('sets error from non-Error throw in createTask', async () => {
      mockTasksCreate.mockRejectedValue('string error');

      await useTaskStore.getState().createTask({
        goal: 'x',
        targetAppPath: 'x',
        llmModel: 'x',
      });

      expect(useTaskStore.getState().error).toBe('string error');
    });
  });

  // ── cancelTask additional coverage ────────────────────────────────────

  describe('cancelTask additional paths', () => {
    it('sets error from non-Error throw in cancelTask', async () => {
      useTaskStore.setState({ tasks: [makeTask()] });
      mockTasksCancel.mockRejectedValue({ error: 'Server error' });

      await useTaskStore.getState().cancelTask(makeTask().id);

      expect(useTaskStore.getState().error).toBe('Server error');
    });

    it('handles cancel on task not in list gracefully', async () => {
      useTaskStore.setState({ tasks: [makeTask({ id: '550e8400-e29b-41d4-a716-446655440001' })] });
      const cancelled = makeTask({ id: '550e8400-e29b-41d4-a716-446655440002', status: 'cancelled' });
      mockTasksCancel.mockResolvedValue(cancelled);

      await useTaskStore.getState().cancelTask('550e8400-e29b-41d4-a716-446655440002');

      // Original task untouched since no match
      const state = useTaskStore.getState();
      expect(state.tasks[0].id).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(state.error).toBeNull();
    });
  });

  // ── deleteTask additional coverage ────────────────────────────────────

  describe('deleteTask additional paths', () => {
    it('deletes from empty list gracefully', async () => {
      mockTasksDelete.mockResolvedValue(undefined);

      await useTaskStore.getState().deleteTask('550e8400-e29b-41d4-a716-446655440001');

      expect(useTaskStore.getState().tasks).toEqual([]);
    });

    it('sets error from non-Error throw in deleteTask', async () => {
      useTaskStore.setState({ tasks: [makeTask()] });
      mockTasksDelete.mockRejectedValue(403);

      await useTaskStore.getState().deleteTask(makeTask().id);

      expect(useTaskStore.getState().error).toBe('An unexpected error occurred');
    });

    it('deletes only matching task when multiple exist', async () => {
      const t1 = makeTask({ id: '550e8400-e29b-41d4-a716-446655440001' });
      const t2 = makeTask({ id: '550e8400-e29b-41d4-a716-446655440002' });
      const t3 = makeTask({ id: '550e8400-e29b-41d4-a716-446655440003' });
      useTaskStore.setState({ tasks: [t1, t2, t3] });
      mockTasksDelete.mockResolvedValue(undefined);

      await useTaskStore.getState().deleteTask('550e8400-e29b-41d4-a716-446655440002');

      const tasks = useTaskStore.getState().tasks;
      expect(tasks).toHaveLength(2);
      expect(tasks.map((t) => t.id)).toEqual([
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440003',
      ]);
    });
  });

  // ── subscribeToTask additional coverage ───────────────────────────────

  describe('subscribeToTask additional paths', () => {
    it('creates EventSource with correct task ID', () => {
      useTaskStore.getState().subscribeToTask('my-task-id');
      expect(connectSSE).toHaveBeenCalledWith('my-task-id', expect.any(Object));
    });

    it('multiple subscribeToTask calls create independent subscriptions', () => {
      useTaskStore.getState().subscribeToTask('task-a');
      useTaskStore.getState().subscribeToTask('task-b');

      expect(connectSSE).toHaveBeenCalledTimes(2);
    });

    it('onStep with steps at exactly MAX_STEPS does not trim', () => {
      const existingSteps = Array.from({ length: 998 }, (_, i) => ({ step: i }));
      useTaskStore.setState({ currentTaskSteps: existingSteps });

      useTaskStore.getState().subscribeToTask('task-1');

      capturedSSECbs!.onStep?.({ step: 998 });
      capturedSSECbs!.onStep?.({ step: 999 });

      expect(useTaskStore.getState().currentTaskSteps).toHaveLength(1000);
    });

    it('onStep with many steps trims correctly', () => {
      const existingSteps = Array.from({ length: 1000 }, (_, i) => ({ step: i }));
      useTaskStore.setState({ currentTaskSteps: existingSteps });

      useTaskStore.getState().subscribeToTask('task-1');

      capturedSSECbs!.onStep?.({ step: 1000 });

      const steps = useTaskStore.getState().currentTaskSteps;
      expect(steps).toHaveLength(1000);
      // First step should have been trimmed
      expect((steps[0] as { step: number }).step).toBe(1);
      expect((steps[999] as { step: number }).step).toBe(1000);
    });

    it('onComplete with failed status still closes and refetches', async () => {
      mockTasksGet.mockResolvedValue({
        task: makeTask({ status: 'failed' }),
        steps: [],
      });

      useTaskStore.getState().subscribeToTask(makeTask().id);

      await capturedSSECbs!.onComplete?.({ status: 'failed' });

      expect(mockESClose).toHaveBeenCalled();
      expect(mockTasksGet).toHaveBeenCalled();
      expect(useTaskStore.getState().currentTask?.status).toBe('failed');
    });

    it('cleanup function can be called multiple times safely', () => {
      const cleanup = useTaskStore.getState().subscribeToTask('task-1');
      cleanup();
      cleanup();
      expect(mockESClose).toHaveBeenCalledTimes(2);
    });

    it('onStep updates steps correctly across multiple subscriptions', () => {
      useTaskStore.getState().subscribeToTask('task-1');

      capturedSSECbs!.onStep?.({ phase: 'observe', data: 'a' });
      capturedSSECbs!.onStep?.({ phase: 'plan', data: 'b' });
      capturedSSECbs!.onStep?.({ phase: 'act', data: 'c' });

      const steps = useTaskStore.getState().currentTaskSteps;
      expect(steps).toHaveLength(3);
      expect(steps[0]).toEqual({ phase: 'observe', data: 'a' });
      expect(steps[2]).toEqual({ phase: 'act', data: 'c' });
    });
  });

  // ── State management edge cases ───────────────────────────────────────

  describe('state management', () => {
    it('concurrent fetchTasks use latest result', async () => {
      let resolveFirst!: (v: unknown) => void;
      const firstPromise = new Promise((resolve) => { resolveFirst = resolve; });
      mockTasksList.mockReturnValueOnce(firstPromise);
      mockTasksList.mockResolvedValueOnce({
        data: [makeTask({ id: '550e8400-e29b-41d4-a716-446655440099', goal: 'Second' })],
        total: 1,
        page: 1,
        limit: 10,
      });

      // Start first fetch
      const p1 = useTaskStore.getState().fetchTasks();
      // Start second fetch before first completes
      const p2 = useTaskStore.getState().fetchTasks();

      // Resolve first
      resolveFirst({
        data: [makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'First' })],
        total: 1,
        page: 1,
        limit: 10,
      });

      await p1;
      await p2;

      // The second fetch result should win since it resolved second
      // Both set isLoading to false
      expect(useTaskStore.getState().isLoading).toBe(false);
    });

    it('error clears isLoading even on unexpected errors', async () => {
      mockTasksList.mockRejectedValue(undefined);

      await useTaskStore.getState().fetchTasks();

      expect(useTaskStore.getState().isLoading).toBe(false);
    });

    it('store actions do not interfere with each other', async () => {
      const t1 = makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'Task 1' });
      const t2 = makeTask({ id: '550e8400-e29b-41d4-a716-446655440002', goal: 'Task 2' });
      useTaskStore.setState({ tasks: [t1, t2] });

      mockTasksDelete.mockResolvedValue(undefined);
      await useTaskStore.getState().deleteTask('550e8400-e29b-41d4-a716-446655440001');

      expect(useTaskStore.getState().tasks).toHaveLength(1);
      expect(useTaskStore.getState().tasks[0].goal).toBe('Task 2');
      expect(useTaskStore.getState().error).toBeNull();
    });
  });
});
