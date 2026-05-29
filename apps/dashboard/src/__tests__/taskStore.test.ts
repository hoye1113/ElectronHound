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

const mockTask: Task = {
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
};

function resetStore() {
  useTaskStore.setState({
    tasks: [],
    currentTask: null,
    currentTaskSteps: [],
    isLoading: false,
    error: null,
  });
}

describe('taskStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockESClose.mockReset();
    capturedSSECbs = null;
    resetStore();
  });

  describe('initial state', () => {
    it('has correct default values', () => {
      const state = useTaskStore.getState();
      expect(state.tasks).toEqual([]);
      expect(state.currentTask).toBeNull();
      expect(state.currentTaskSteps).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('fetchTasks', () => {
    it('sets loading true and clears error on start', async () => {
      mockTasksList.mockReturnValue(new Promise(() => {})); // never resolves

      useTaskStore.getState().fetchTasks();

      const state = useTaskStore.getState();
      expect(state.isLoading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('sets tasks on success', async () => {
      mockTasksList.mockResolvedValue({
        data: [mockTask],
        total: 1,
        page: 1,
        limit: 10,
      });

      await useTaskStore.getState().fetchTasks();

      const state = useTaskStore.getState();
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0]).toEqual(mockTask);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets error message on thrown Error', async () => {
      mockTasksList.mockRejectedValue(new Error('Network timeout'));

      await useTaskStore.getState().fetchTasks();

      const state = useTaskStore.getState();
      expect(state.error).toBe('Network timeout');
      expect(state.isLoading).toBe(false);
      expect(state.tasks).toEqual([]);
    });

    it('sets error message on thrown string', async () => {
      mockTasksList.mockRejectedValue('string error');

      await useTaskStore.getState().fetchTasks();

      expect(useTaskStore.getState().error).toBe('string error');
    });

    it('sets error message on thrown object with error field', async () => {
      mockTasksList.mockRejectedValue({ error: 'API error' });

      await useTaskStore.getState().fetchTasks();

      expect(useTaskStore.getState().error).toBe('API error');
    });

    it('sets error message on thrown object with message field', async () => {
      mockTasksList.mockRejectedValue({ message: 'Object message' });

      await useTaskStore.getState().fetchTasks();

      expect(useTaskStore.getState().error).toBe('Object message');
    });

    it('sets default error on unknown thrown value', async () => {
      mockTasksList.mockRejectedValue(42);

      await useTaskStore.getState().fetchTasks();

      expect(useTaskStore.getState().error).toBe('An unexpected error occurred');
    });

    it('sets default error on null throw', async () => {
      mockTasksList.mockRejectedValue(null);

      await useTaskStore.getState().fetchTasks();

      expect(useTaskStore.getState().error).toBe('An unexpected error occurred');
    });
  });

  describe('fetchTask', () => {
    it('sets loading true and clears error on start', async () => {
      mockTasksGet.mockReturnValue(new Promise(() => {}));

      useTaskStore.getState().fetchTask('task-1');

      const state = useTaskStore.getState();
      expect(state.isLoading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('sets currentTask and steps on success', async () => {
      const steps = [{ phase: 'observe', status: 'completed' }];
      mockTasksGet.mockResolvedValue({ task: mockTask, steps });

      await useTaskStore.getState().fetchTask(mockTask.id);

      const state = useTaskStore.getState();
      expect(state.currentTask).toEqual(mockTask);
      expect(state.currentTaskSteps).toEqual(steps);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets error on failure', async () => {
      mockTasksGet.mockRejectedValue(new Error('Not found'));

      await useTaskStore.getState().fetchTask('bad-id');

      const state = useTaskStore.getState();
      expect(state.error).toBe('Not found');
      expect(state.isLoading).toBe(false);
      expect(state.currentTask).toBeNull();
    });
  });

  describe('createTask', () => {
    it('prepends new task to tasks list', async () => {
      const existing: Task = {
        ...mockTask,
        id: '550e8400-e29b-41d4-a716-446655440001',
        goal: 'Existing',
      };
      useTaskStore.setState({ tasks: [existing] });

      const newTask: Task = {
        ...mockTask,
        id: '550e8400-e29b-41d4-a716-446655440002',
        goal: 'New task',
      };
      mockTasksCreate.mockResolvedValue(newTask);

      await useTaskStore.getState().createTask({
        goal: 'New task',
        targetAppPath: '/path',
        llmModel: 'gpt-4o',
        priority: 'medium',
      });

      const state = useTaskStore.getState();
      expect(state.tasks).toHaveLength(2);
      expect(state.tasks[0].goal).toBe('New task');
      expect(state.tasks[1].goal).toBe('Existing');
    });

    it('sets error on failure', async () => {
      mockTasksCreate.mockRejectedValue(new Error('Validation failed'));

      await useTaskStore.getState().createTask({
        goal: '',
        targetAppPath: '',
        llmModel: '',
        priority: 'medium',
      });

      expect(useTaskStore.getState().error).toBe('Validation failed');
    });

    it('does not change tasks list on failure', async () => {
      useTaskStore.setState({ tasks: [mockTask] });
      mockTasksCreate.mockRejectedValue(new Error('fail'));

      await useTaskStore.getState().createTask({
        goal: 'x',
        targetAppPath: 'x',
        llmModel: 'x',
        priority: 'medium',
      });

      expect(useTaskStore.getState().tasks).toHaveLength(1);
    });
  });

  describe('cancelTask', () => {
    it('replaces the matching task with the cancelled version', async () => {
      const running: Task = { ...mockTask, status: 'running' };
      useTaskStore.setState({ tasks: [running] });

      const cancelled: Task = { ...mockTask, status: 'cancelled' };
      mockTasksCancel.mockResolvedValue(cancelled);

      await useTaskStore.getState().cancelTask(mockTask.id);

      expect(useTaskStore.getState().tasks[0].status).toBe('cancelled');
    });

    it('does not modify other tasks', async () => {
      const task1: Task = { ...mockTask, id: '550e8400-e29b-41d4-a716-446655440001' };
      const task2: Task = { ...mockTask, id: '550e8400-e29b-41d4-a716-446655440002', status: 'running' };
      useTaskStore.setState({ tasks: [task1, task2] });

      const cancelled: Task = { ...task2, status: 'cancelled' };
      mockTasksCancel.mockResolvedValue(cancelled);

      await useTaskStore.getState().cancelTask(task2.id);

      const state = useTaskStore.getState();
      expect(state.tasks[0].status).toBe('queued'); // unchanged
      expect(state.tasks[1].status).toBe('cancelled');
    });

    it('sets error on failure', async () => {
      useTaskStore.setState({ tasks: [mockTask] });
      mockTasksCancel.mockRejectedValue(new Error('Cannot cancel'));

      await useTaskStore.getState().cancelTask(mockTask.id);

      expect(useTaskStore.getState().error).toBe('Cannot cancel');
    });
  });

  describe('deleteTask', () => {
    it('removes the task from the list', async () => {
      useTaskStore.setState({ tasks: [mockTask] });
      mockTasksDelete.mockResolvedValue(undefined);

      await useTaskStore.getState().deleteTask(mockTask.id);

      expect(useTaskStore.getState().tasks).toHaveLength(0);
    });

    it('only removes the matching task', async () => {
      const task1: Task = { ...mockTask, id: '550e8400-e29b-41d4-a716-446655440001' };
      const task2: Task = { ...mockTask, id: '550e8400-e29b-41d4-a716-446655440002' };
      useTaskStore.setState({ tasks: [task1, task2] });
      mockTasksDelete.mockResolvedValue(undefined);

      await useTaskStore.getState().deleteTask(task1.id);

      const state = useTaskStore.getState();
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0].id).toBe(task2.id);
    });

    it('sets error on failure', async () => {
      useTaskStore.setState({ tasks: [mockTask] });
      mockTasksDelete.mockRejectedValue(new Error('Forbidden'));

      await useTaskStore.getState().deleteTask(mockTask.id);

      expect(useTaskStore.getState().error).toBe('Forbidden');
      // Task should still be in the list
      expect(useTaskStore.getState().tasks).toHaveLength(1);
    });
  });

  describe('subscribeToTask', () => {
    it('returns a cleanup function', () => {
      const cleanup = useTaskStore.getState().subscribeToTask('task-1');
      expect(typeof cleanup).toBe('function');
      expect(connectSSE).toHaveBeenCalledWith('task-1', expect.objectContaining({
        onStep: expect.any(Function),
        onComplete: expect.any(Function),
        onError: expect.any(Function),
      }));
    });

    it('calls cleanup (close) on unsubscribe', () => {
      const cleanup = useTaskStore.getState().subscribeToTask('task-1');
      cleanup();
      expect(mockESClose).toHaveBeenCalled();
    });

    it('onStep appends data to currentTaskSteps', () => {
      useTaskStore.getState().subscribeToTask('task-1');

      const step1 = { phase: 'observe', data: 'first' };
      capturedSSECbs!.onStep?.(step1);
      expect(useTaskStore.getState().currentTaskSteps).toEqual([step1]);

      const step2 = { phase: 'act', data: 'second' };
      capturedSSECbs!.onStep?.(step2);
      expect(useTaskStore.getState().currentTaskSteps).toEqual([step1, step2]);
    });

    it('onStep trims steps beyond MAX_STEPS (1000)', () => {
      // Pre-populate with 999 steps
      const existingSteps = Array.from({ length: 999 }, (_, i) => ({ step: i }));
      useTaskStore.setState({ currentTaskSteps: existingSteps });

      useTaskStore.getState().subscribeToTask('task-1');

      // Add 2 more steps to reach 1001
      capturedSSECbs!.onStep?.({ step: 999 });
      capturedSSECbs!.onStep?.({ step: 1000 });

      const steps = useTaskStore.getState().currentTaskSteps;
      expect(steps).toHaveLength(1000);
      // The first step (step:0) should be trimmed, so step[0] is step:1
      expect((steps[0] as { step: number }).step).toBe(1);
      // The last step should be step:1000
      expect((steps[999] as { step: number }).step).toBe(1000);
    });

    it('onStep does not trim when exactly MAX_STEPS', () => {
      const existingSteps = Array.from({ length: 999 }, (_, i) => ({ step: i }));
      useTaskStore.setState({ currentTaskSteps: existingSteps });

      useTaskStore.getState().subscribeToTask('task-1');

      // Add 1 more to reach exactly 1000
      capturedSSECbs!.onStep?.({ step: 999 });

      expect(useTaskStore.getState().currentTaskSteps).toHaveLength(1000);
    });

    it('onComplete closes EventSource and refetches task', async () => {
      mockTasksGet.mockResolvedValue({
        task: { ...mockTask, status: 'completed' },
        steps: [{ phase: 'done' }],
      });

      useTaskStore.getState().subscribeToTask(mockTask.id);

      await capturedSSECbs!.onComplete?.({ status: 'completed' });

      expect(mockESClose).toHaveBeenCalled();
      expect(mockTasksGet).toHaveBeenCalledWith(mockTask.id);
      expect(useTaskStore.getState().currentTask?.status).toBe('completed');
    });

    it('onComplete sets error when fetchTask fails', async () => {
      mockTasksGet.mockRejectedValue(new Error('Not found'));

      useTaskStore.getState().subscribeToTask(mockTask.id);

      await capturedSSECbs!.onComplete?.({ status: 'completed' });

      expect(mockESClose).toHaveBeenCalled();
      expect(mockTasksGet).toHaveBeenCalledWith(mockTask.id);
      expect(useTaskStore.getState().error).toBe('Not found');
    });

    it('onError closes EventSource', () => {
      useTaskStore.getState().subscribeToTask('task-1');

      capturedSSECbs!.onError?.(new Error('SSE connection failed'));

      expect(mockESClose).toHaveBeenCalled();
    });
  });

  describe('extractErrorMessage edge cases', () => {
    it('handles object with error field taking precedence over message', async () => {
      mockTasksList.mockRejectedValue({ error: 'error-field', message: 'message-field' });

      await useTaskStore.getState().fetchTasks();

      expect(useTaskStore.getState().error).toBe('error-field');
    });

    it('handles object with message field but no error field', async () => {
      mockTasksList.mockRejectedValue({ message: 'only-message' });

      await useTaskStore.getState().fetchTasks();

      expect(useTaskStore.getState().error).toBe('only-message');
    });

    it('handles object with non-string error field', async () => {
      // Object has 'error' but it's not a string, and no 'message'
      mockTasksList.mockRejectedValue({ error: 123 });

      await useTaskStore.getState().fetchTasks();

      expect(useTaskStore.getState().error).toBe('An unexpected error occurred');
    });

    it('handles boolean throw', async () => {
      mockTasksList.mockRejectedValue(true);

      await useTaskStore.getState().fetchTasks();

      expect(useTaskStore.getState().error).toBe('An unexpected error occurred');
    });

    it('handles undefined throw', async () => {
      mockTasksList.mockRejectedValue(undefined);

      await useTaskStore.getState().fetchTasks();

      expect(useTaskStore.getState().error).toBe('An unexpected error occurred');
    });
  });
});
