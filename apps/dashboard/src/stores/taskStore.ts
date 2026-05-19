import { create } from 'zustand';
import type { Task, CreateTaskRequest } from '@eata/shared-types';
import { api } from '../lib/api.js';
import { connectSSE } from '../lib/sse.js';

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
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  fetchTask: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.tasks.get(id);
      set({ currentTask: result.task, currentTaskSteps: result.steps, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  createTask: async (data) => {
    try {
      const task = await api.tasks.create(data);
      set((state) => ({ tasks: [task, ...state.tasks] }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  cancelTask: async (id) => {
    try {
      const task = await api.tasks.cancel(id);
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === id ? task : t)),
      }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteTask: async (id) => {
    try {
      await api.tasks.delete(id);
      set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  subscribeToTask: (id) => {
    const es = connectSSE(id, {
      onStep: (data) => {
        set((state) => ({ currentTaskSteps: [...state.currentTaskSteps, data] }));
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
