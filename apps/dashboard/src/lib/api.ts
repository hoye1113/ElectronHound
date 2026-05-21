import type { Task, CreateTaskRequest, FeedbackPattern } from '@eata/shared-types';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function getScreenshotUrl(taskId: string, stepIndex: number): string {
  return `${API_BASE}/api/tasks/${taskId}/steps/${stepIndex}/screenshot`;
}

export interface LLMProviderConfig {
  id: string;
  name: string;
  type: 'openai-compatible';
  apiKey: string;
  baseURL: string;
  model: string;
  enabled?: boolean;
}

export interface ProvidersConfig {
  version: number;
  providers: LLMProviderConfig[];
  activeId: string;
}

export interface FewShotStep {
  action: string;
  observation: string;
}

export interface FewShotExample {
  id: string;
  goal: string;
  steps: FewShotStep[];
  expectedResult: string;
  metadata: {
    tags?: string[];
    domain?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
  };
}

const FEW_SHOT_STORAGE_KEY = 'eata-few-shot-examples';

function loadFewShotExamples(): FewShotExample[] {
  try {
    const raw = localStorage.getItem(FEW_SHOT_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as FewShotExample[];
  } catch {
    // ignore parse errors
  }
  return [];
}

function saveFewShotExamples(examples: FewShotExample[]): void {
  localStorage.setItem(FEW_SHOT_STORAGE_KEY, JSON.stringify(examples));
}

export const api = {
  tasks: {
    list(params?: { status?: string; page?: number; limit?: number }): Promise<{
      data: Task[];
      total: number;
      page: number;
      limit: number;
    }> {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.page) query.set('page', String(params.page));
      if (params?.limit) query.set('limit', String(params.limit));
      return fetch(`${API_BASE}/api/tasks?${query}`).then((r) => r.json());
    },
    get(id: string): Promise<{ task: Task; steps: unknown[] }> {
      return fetch(`${API_BASE}/api/tasks/${id}`).then((r) => r.json());
    },
    create(data: CreateTaskRequest): Promise<Task> {
      return fetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json());
    },
    delete(id: string): Promise<void> {
      return fetch(`${API_BASE}/api/tasks/${id}`, { method: 'DELETE' }).then(() => undefined);
    },
    cancel(id: string): Promise<Task> {
      return fetch(`${API_BASE}/api/tasks/${id}/cancel`, { method: 'POST' }).then((r) => r.json());
    },
  },
  reports: {
    get(taskId: string): Promise<unknown> {
      return fetch(`${API_BASE}/api/tasks/${taskId}/report`).then((r) => r.json());
    },
    getHtmlUrl(taskId: string): string {
      return `${API_BASE}/api/tasks/${taskId}/report/html`;
    },
    getManifest(id: string): Promise<unknown> {
      return fetch(`${API_BASE}/api/reports/${id}/manifest`).then((r) => r.json());
    },
    getTimeline(id: string): Promise<unknown> {
      return fetch(`${API_BASE}/api/reports/${id}/timeline`).then((r) => r.json());
    },
  },
  feedback: {
    getPatterns(): Promise<{ patterns: FeedbackPattern[] }> {
      return fetch(`${API_BASE}/api/feedback/patterns`).then((r) => r.json());
    },
  },
  providers: {
    list(): Promise<ProvidersConfig> {
      return fetch(`${API_BASE}/api/providers`).then((r) => r.json());
    },
    test(id: string): Promise<{ success: boolean; error?: string; message?: string }> {
      return fetch(`${API_BASE}/api/providers/${id}/test`, {
        method: 'POST',
      }).then((r) => r.json());
    },
  },
  fewShot: {
    list(): FewShotExample[] {
      return loadFewShotExamples();
    },
    add(example: Omit<FewShotExample, 'id'>): FewShotExample {
      const id = `fs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const newItem: FewShotExample = { ...example, id };
      const examples = loadFewShotExamples();
      examples.push(newItem);
      saveFewShotExamples(examples);
      return newItem;
    },
    update(id: string, patch: Partial<Omit<FewShotExample, 'id'>>): FewShotExample | null {
      const examples = loadFewShotExamples();
      const index = examples.findIndex((e) => e.id === id);
      if (index === -1) return null;
      const updated = { ...examples[index], ...patch, id };
      examples[index] = updated;
      saveFewShotExamples(examples);
      return updated;
    },
    remove(id: string): boolean {
      const examples = loadFewShotExamples();
      const next = examples.filter((e) => e.id !== id);
      if (next.length === examples.length) return false;
      saveFewShotExamples(next);
      return true;
    },
  },
};
