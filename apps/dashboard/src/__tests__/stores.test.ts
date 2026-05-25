import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
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
      mockFetch.mockResolvedValueOnce({ json: () => Promise.resolve({}) });

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
    mockFetch.mockResolvedValueOnce({ json: () => Promise.resolve({}) });

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
    expect(MockEventSource).toHaveBeenCalled();

    cleanup();
    const esInstance = (MockEventSource as unknown as Mock).mock.results[0].value;
    expect(esInstance.close).toHaveBeenCalled();
  });
});


