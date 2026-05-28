import { create } from 'zustand';
import type { Task, CreateTaskRequest } from '@eata/shared-types';
import { api } from '../lib/api.js';
import { connectSSE } from '../lib/sse.js';

const MAX_STEPS = 1000;

/**
 * Extract a human-readable message from an unknown thrown value.
 * Handles `Error` instances, string throws, and plain objects with
 * an `error` or `message` property (e.g. API error responses).
 */
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    if ('error' in obj && typeof obj.error === 'string') return obj.error;
    if ('message' in obj && typeof obj.message === 'string') return obj.message;
  }
  return 'An unexpected error occurred';
}

interface TaskStore {
  tasks: Task[];
  currentTask: Task | null;
  currentTaskSteps: unknown[];
  isLoading: boolean;
  error: string | null;
  fetchTasks: () => Promise<void>;
  fetchTask: (id: string) => Promise<void>;
  createTask: (data: CreateTaskRequest) => Promise<void>;
  cancelTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  subscribeToTask: (id: string) => () => void;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  currentTask: null,
  currentTaskSteps: [],
  isLoading: false,
  error: null,

  fetchTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.tasks.list();
      set({ tasks: result.data, isLoading: false });
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e), isLoading: false });
    }
  },

  fetchTask: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.tasks.get(id);
      set({ currentTask: result.task, currentTaskSteps: result.steps, isLoading: false });
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e), isLoading: false });
    }
  },

  createTask: async (data) => {
    try {
      const task = await api.tasks.create(data);
      set((state) => ({ tasks: [task, ...state.tasks] }));
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e) });
    }
  },

  cancelTask: async (id) => {
    try {
      const task = await api.tasks.cancel(id);
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === id ? task : t)),
      }));
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e) });
    }
  },

  deleteTask: async (id) => {
    try {
      await api.tasks.delete(id);
      set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
    } catch (e: unknown) {
      set({ error: extractErrorMessage(e) });
    }
  },

  subscribeToTask: (id) => {
    const es = connectSSE(id, {
      onStep: (data) => {
        set((state) => {
          const steps = [...state.currentTaskSteps, data];
          if (steps.length > MAX_STEPS) {
            return { currentTaskSteps: steps.slice(-MAX_STEPS) };
          }
          return { currentTaskSteps: steps };
        });
      },
      onComplete: () => {
        es.close();
        get().fetchTask(id);
      },
      onError: () => {
        es.close();
      },
    });
    return () => es.close();
  },
}));
