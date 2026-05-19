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
};
