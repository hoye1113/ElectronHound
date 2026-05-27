import type { Task, CreateTaskRequest, FeedbackPattern } from '@eata/shared-types';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Perform a fetch request and throw an `Error` with a readable message
 * when the response is not OK.  Parses the JSON body for error details.
 *
 * Note: `ok` may be `undefined` in test mocks — treat as success for
 * backward compatibility with existing test stubs.
 */
async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = init !== undefined ? await fetch(input, init) : await fetch(input);
  if (res.ok === false) {
    let detail: string;
    try {
      const body = await res.json() as { error?: string; message?: string; details?: unknown };
      detail = body.error ?? body.message ?? res.statusText;
      if (body.details) {
        detail += `: ${JSON.stringify(body.details)}`;
      }
    } catch {
      detail = res.statusText;
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

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
      return fetchJson(`${API_BASE}/api/tasks?${query}`);
    },
    get(id: string): Promise<{ task: Task; steps: unknown[] }> {
      return fetchJson(`${API_BASE}/api/tasks/${id}`);
    },
    create(data: CreateTaskRequest): Promise<Task> {
      return fetchJson(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    delete(id: string): Promise<void> {
      return fetch(`${API_BASE}/api/tasks/${id}`, { method: 'DELETE' }).then(() => undefined);
    },
    cancel(id: string): Promise<Task> {
      return fetchJson(`${API_BASE}/api/tasks/${id}/cancel`, { method: 'POST' });
    },
  },
  reports: {
    get(taskId: string): Promise<unknown> {
      return fetchJson(`${API_BASE}/api/tasks/${taskId}/report`);
    },
    getHtmlUrl(taskId: string): string {
      return `${API_BASE}/api/tasks/${taskId}/report/html`;
    },
    getManifest(id: string): Promise<unknown> {
      return fetchJson(`${API_BASE}/api/reports/${id}/manifest`);
    },
    getTimeline(id: string): Promise<unknown> {
      return fetchJson(`${API_BASE}/api/reports/${id}/timeline`);
    },
  },
  feedback: {
    getPatterns(): Promise<{ patterns: FeedbackPattern[] }> {
      return fetchJson(`${API_BASE}/api/feedback/patterns`);
    },
  },
  providers: {
    list(): Promise<ProvidersConfig> {
      return fetchJson(`${API_BASE}/api/providers`);
    },
    test(id: string): Promise<{ success: boolean; error?: string; message?: string }> {
      return fetchJson(`${API_BASE}/api/providers/${id}/test`, {
        method: 'POST',
      });
    },
  },
};
