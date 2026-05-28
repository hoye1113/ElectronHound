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
    } catch (err) {
      console.warn('[api] Failed to parse error response body:', err instanceof Error ? err.message : String(err));
      detail = res.statusText;
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export function getScreenshotUrl(taskId: string, stepIndex: number): string {
  return `${API_BASE}/api/tasks/${taskId}/steps/${stepIndex}/screenshot`;
}

export function getExportUrl(taskId: string, format: 'json' | 'csv' | 'html'): string {
  return `${API_BASE}/api/tasks/${taskId}/export/${format}`;
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

export type TemplateCategory = 'login' | 'crud' | 'form' | 'navigation' | 'file' | 'settings' | 'custom';

export interface FewShotStep {
  action: string;
  observation: string;
}

export interface FewShotExample {
  id: string;
  goal: string;
  steps: FewShotStep[];
  expectedResult: string;
  metadata: { tags: string[]; domain: string; difficulty: string };
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  variables: string[];
  builtin: boolean;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  checks: {
    database: { status: string; message?: string };
    workerPool: { status: string; running: number; queued: number; maxWorkers: number };
  };
  uptime: number;
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
    create(data: { name: string; apiKey: string; baseURL: string; model: string }): Promise<LLMProviderConfig> {
      return fetchJson(`${API_BASE}/api/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    update(id: string, data: Partial<LLMProviderConfig>): Promise<LLMProviderConfig> {
      return fetchJson(`${API_BASE}/api/providers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    delete(id: string): Promise<void> {
      return fetch(`${API_BASE}/api/providers/${id}`, { method: 'DELETE' }).then(() => undefined);
    },
    test(id: string): Promise<{ success: boolean; error?: string; message?: string }> {
      return fetchJson(`${API_BASE}/api/providers/${id}/test`, {
        method: 'POST',
      });
    },
    activate(id: string): Promise<unknown> {
      return fetchJson(`${API_BASE}/api/providers/${id}/activate`, {
        method: 'POST',
      });
    },
  },
  templates: {
    list(params?: { category?: string; search?: string }): Promise<{ data: Template[] }> {
      const query = new URLSearchParams();
      if (params?.category) query.set('category', params.category);
      if (params?.search) query.set('search', params.search);
      return fetchJson(`${API_BASE}/api/templates?${query}`);
    },
    get(id: string): Promise<unknown> {
      return fetchJson(`${API_BASE}/api/templates/${id}`);
    },
    create(data: unknown): Promise<unknown> {
      return fetchJson(`${API_BASE}/api/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    delete(id: string): Promise<void> {
      return fetch(`${API_BASE}/api/templates/${id}`, { method: 'DELETE' }).then(() => undefined);
    },
  },
  health: {
    check(): Promise<HealthResponse> {
      return fetchJson(`${API_BASE}/health`);
    },
  },
  batches: {
    create(data: {
      name?: string;
      tasks: Array<{ goal: string; config?: { targetAppPath?: string; llmModel?: string; maxSteps?: number; providerId?: string } }>;
      priority?: 'low' | 'medium' | 'high';
    }): Promise<{ batchId: string; taskIds: string[]; totalTasks: number }> {
      return fetchJson(`${API_BASE}/api/tasks/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    get(batchId: string): Promise<{
      id: string;
      name: string | null;
      status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
      totalTasks: number;
      completedTasks: number;
      failedTasks: number;
      priority: string;
      createdAt: string;
      updatedAt: string;
      tasks: Array<{ id: string; goal: string; status: string; createdAt: string; updatedAt: string }>;
      progress: number;
    }> {
      return fetchJson(`${API_BASE}/api/tasks/batch/${batchId}`);
    },
    cancel(batchId: string): Promise<{ success: boolean; batchId: string }> {
      return fetchJson(`${API_BASE}/api/tasks/batch/${batchId}/cancel`, { method: 'POST' });
    },
  },
  fewShot: {
    _key: 'eata-few-shot-examples',
    list(): FewShotExample[] {
      try {
        return JSON.parse(localStorage.getItem('eata-few-shot-examples') ?? '[]');
      } catch (err) {
        console.warn('[api] Failed to parse few-shot examples from localStorage:', err instanceof Error ? err.message : String(err));
        return [];
      }
    },
    add(data: Omit<FewShotExample, 'id'>): FewShotExample {
      const examples = api.fewShot.list();
      const example: FewShotExample = { ...data, id: `fs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
      examples.push(example);
      localStorage.setItem('eata-few-shot-examples', JSON.stringify(examples));
      return example;
    },
    update(id: string, data: Omit<FewShotExample, 'id'>): void {
      const examples = api.fewShot.list();
      const idx = examples.findIndex(e => e.id === id);
      if (idx >= 0) {
        examples[idx] = { ...data, id };
        localStorage.setItem('eata-few-shot-examples', JSON.stringify(examples));
      }
    },
    remove(id: string): void {
      const examples = api.fewShot.list().filter(e => e.id !== id);
      localStorage.setItem('eata-few-shot-examples', JSON.stringify(examples));
    },
  },
};
