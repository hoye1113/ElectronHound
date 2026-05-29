import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../lib/api.js';
import { useTaskStore } from '../stores/taskStore.js';
import type { Task } from '@eata/shared-types';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock EventSource for SSE tests - must be set before modules that use it are imported
const mockEventSourceInstance = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn(),
  onerror: null,
};
const MockEventSource = vi.fn(() => mockEventSourceInstance);
vi.stubGlobal('EventSource', MockEventSource);

// Mock connectSSE to capture callbacks
let capturedCallbacks: Record<string, ((data: unknown) => void) | ((e: Event) => void)> = {};
const mockESClose = vi.fn();
vi.mock('../lib/sse.js', () => ({
  connectSSE: vi.fn((_taskId: string, callbacks: Record<string, unknown>) => {
    capturedCallbacks = callbacks as typeof capturedCallbacks;
    return { close: mockESClose };
  }),
}));

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

describe('api', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('tasks.list', () => {
    it('returns paginated task list', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: [mockTask], total: 1, page: 1, limit: 10 }),
      });

      const result = await api.tasks.list();

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tasks?'),
      );
    });

    it('passes query params correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ data: [], total: 0, page: 1, limit: 10 }),
      });

      await api.tasks.list({ status: 'running', page: 2, limit: 20 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('status=running');
      expect(url).toContain('page=2');
      expect(url).toContain('limit=20');
    });
  });

  describe('tasks.get', () => {
    it('returns task with steps', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ task: mockTask, steps: [] }),
      });

      const result = await api.tasks.get(mockTask.id);

      expect(result.task).toEqual(mockTask);
      expect(result.steps).toEqual([]);
    });
  });

  describe('tasks.create', () => {
    it('creates a task and returns it', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockTask),
      });

      const result = await api.tasks.create({
        goal: 'Test goal',
        targetAppPath: '/test',
        llmModel: 'gpt-4o',
        priority: 'medium',
      });

      expect(result).toEqual(mockTask);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tasks'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('tasks.delete', () => {
    it('deletes a task', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

      await api.tasks.delete(mockTask.id);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/tasks/${mockTask.id}`),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('feedback.getPatterns', () => {
    it('returns feedback patterns', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ patterns: [] }),
      });

      const result = await api.feedback.getPatterns();

      expect(result.patterns).toEqual([]);
    });
  });
});

describe('taskStore', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockESClose.mockReset();
    capturedCallbacks = {};
    useTaskStore.setState({
      tasks: [],
      currentTask: null,
      currentTaskSteps: [],
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchTasks updates tasks on success', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ data: [mockTask], total: 1, page: 1, limit: 10 }),
    });

    await useTaskStore.getState().fetchTasks();

    const state = useTaskStore.getState();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].id).toBe(mockTask.id);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('fetchTasks sets error on failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await useTaskStore.getState().fetchTasks();

    const state = useTaskStore.getState();
    expect(state.error).toContain('Network error');
    expect(state.isLoading).toBe(false);
  });

  it('createTask adds task to list', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(mockTask),
    });

    await useTaskStore.getState().createTask({
      goal: 'Test goal',
      targetAppPath: '/test',
      llmModel: 'gpt-4o',
      priority: 'medium',
    });

    const state = useTaskStore.getState();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].goal).toBe('Test goal');
  });

  it('deleteTask removes task from list', async () => {
    // First add a task
    useTaskStore.setState({ tasks: [mockTask] });
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    await useTaskStore.getState().deleteTask(mockTask.id);

    const state = useTaskStore.getState();
    expect(state.tasks).toHaveLength(0);
  });

  it('fetchTask sets currentTask and steps', async () => {
    const steps = [{ phase: 'observe', status: 'completed' }];
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ task: mockTask, steps }),
    });

    await useTaskStore.getState().fetchTask(mockTask.id);

    const state = useTaskStore.getState();
    expect(state.currentTask).toEqual(mockTask);
    expect(state.currentTaskSteps).toEqual(steps);
  });

  it('subscribeToTask returns cleanup function', () => {
    const cleanup = useTaskStore.getState().subscribeToTask(mockTask.id);

    expect(typeof cleanup).toBe('function');

    cleanup();
    expect(mockESClose).toHaveBeenCalled();
  });

  // --- extractErrorMessage tests ---

  describe('extractErrorMessage', () => {
    it('extracts message from Error instance', async () => {
      mockFetch.mockRejectedValueOnce(new Error('specific error'));
      await useTaskStore.getState().fetchTasks();
      expect(useTaskStore.getState().error).toBe('specific error');
    });

    it('extracts string thrown value', async () => {
      mockFetch.mockRejectedValueOnce('string error');
      await useTaskStore.getState().fetchTasks();
      expect(useTaskStore.getState().error).toBe('string error');
    });

    it('extracts error from object with error key', async () => {
      mockFetch.mockRejectedValueOnce({ error: 'API error' });
      await useTaskStore.getState().fetchTasks();
      expect(useTaskStore.getState().error).toBe('API error');
    });

    it('extracts message from object with message key', async () => {
      mockFetch.mockRejectedValueOnce({ message: 'msg error' });
      await useTaskStore.getState().fetchTasks();
      expect(useTaskStore.getState().error).toBe('msg error');
    });

    it('returns fallback for unknown error type', async () => {
      mockFetch.mockRejectedValueOnce(42);
      await useTaskStore.getState().fetchTasks();
      expect(useTaskStore.getState().error).toBe('An unexpected error occurred');
    });
  });

  // --- cancelTask tests ---

  describe('cancelTask', () => {
    it('updates task status to cancelled on success', async () => {
      useTaskStore.setState({ tasks: [mockTask] });
      const cancelledTask = { ...mockTask, status: 'cancelled' as const };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(cancelledTask),
      });

      await useTaskStore.getState().cancelTask(mockTask.id);

      expect(useTaskStore.getState().tasks[0].status).toBe('cancelled');
    });

    it('sets error on cancel failure', async () => {
      useTaskStore.setState({ tasks: [mockTask] });
      mockFetch.mockRejectedValueOnce(new Error('Cancel failed'));

      await useTaskStore.getState().cancelTask(mockTask.id);

      expect(useTaskStore.getState().error).toBe('Cancel failed');
    });
  });

  // --- subscribeToTask callback tests ---

  describe('subscribeToTask callbacks', () => {
    it('onStep appends step to currentTaskSteps', () => {
      useTaskStore.setState({ currentTaskSteps: [] });
      useTaskStore.getState().subscribeToTask(mockTask.id);

      (capturedCallbacks.onStep as (data: unknown) => void)({ phase: 'observe', index: 0 });

      expect(useTaskStore.getState().currentTaskSteps).toHaveLength(1);
      expect(useTaskStore.getState().currentTaskSteps[0]).toEqual({ phase: 'observe', index: 0 });
    });

    it('onStep slices when exceeding MAX_STEPS (1000)', () => {
      const existingSteps = Array.from({ length: 999 }, (_, i) => ({ index: i }));
      useTaskStore.setState({ currentTaskSteps: existingSteps });
      useTaskStore.getState().subscribeToTask(mockTask.id);

      // Add 2 more to reach 1001
      (capturedCallbacks.onStep as (data: unknown) => void)({ index: 999 });
      (capturedCallbacks.onStep as (data: unknown) => void)({ index: 1000 });

      const steps = useTaskStore.getState().currentTaskSteps;
      expect(steps).toHaveLength(1000);
      expect((steps[0] as Record<string, unknown>).index).toBe(1); // first item sliced off
    });

    it('onComplete closes ES and fetches task', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ task: mockTask, steps: [] }),
      });
      useTaskStore.getState().subscribeToTask(mockTask.id);

      await (capturedCallbacks.onComplete as () => void)();

      expect(mockESClose).toHaveBeenCalled();
      // fetchTask should have been called (mockFetch called for the GET)
      expect(mockFetch).toHaveBeenCalled();
    });

    it('onError closes ES without fetching', () => {
      const fetchCallsBefore = mockFetch.mock.calls.length;
      useTaskStore.getState().subscribeToTask(mockTask.id);

      (capturedCallbacks.onError as (e: Event) => void)(new Event('error'));

      expect(mockESClose).toHaveBeenCalled();
      expect(mockFetch.mock.calls.length).toBe(fetchCallsBefore);
    });
  });

  // --- Error paths for existing actions ---

  it('createTask sets error on failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Create failed'));

    await useTaskStore.getState().createTask({
      goal: 'Test',
      targetAppPath: '/test',
      llmModel: 'gpt-4o',
      priority: 'medium',
    });

    expect(useTaskStore.getState().error).toBe('Create failed');
  });

  it('deleteTask sets error on failure', async () => {
    useTaskStore.setState({ tasks: [mockTask] });
    mockFetch.mockRejectedValueOnce(new Error('Delete failed'));

    await useTaskStore.getState().deleteTask(mockTask.id);

    expect(useTaskStore.getState().error).toBe('Delete failed');
  });

  it('fetchTask sets error on failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Fetch failed'));

    await useTaskStore.getState().fetchTask('bad-id');

    expect(useTaskStore.getState().error).toBe('Fetch failed');
  });
});


