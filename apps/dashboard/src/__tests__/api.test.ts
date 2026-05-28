import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, getScreenshotUrl, getExportUrl } from '../lib/api.js';
import type { Task } from '@eata/shared-types';

const API_BASE = 'http://localhost:3000';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

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

// Helper to build a minimal Response-like object with ok=true
function jsonResponse(body: unknown, init?: { status?: number; statusText?: string }) {
  return {
    ok: init?.status ? init.status >= 200 && init.status < 300 : true,
    status: init?.status ?? 200,
    statusText: init?.statusText ?? 'OK',
    json: () => Promise.resolve(body),
  };
}

// Helper to build a non-OK Response-like object with JSON error body
function errorResponse(body: unknown, status = 400, statusText = 'Bad Request') {
  return {
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve(body),
  };
}

// Helper to build a non-OK Response-like object that fails to parse JSON
function errorResponseNonJson(status = 500, statusText = 'Internal Server Error') {
  return {
    ok: false,
    status,
    statusText,
    json: () => Promise.reject(new Error('Invalid JSON')),
  };
}

describe('URL helpers', () => {
  it('getScreenshotUrl constructs correct URL', () => {
    const url = getScreenshotUrl('task-123', 3);
    expect(url).toBe(`${API_BASE}/api/tasks/task-123/steps/3/screenshot`);
  });

  it('getExportUrl constructs correct URL for json format', () => {
    expect(getExportUrl('task-1', 'json')).toBe(
      `${API_BASE}/api/tasks/task-1/export/json`,
    );
  });

  it('getExportUrl constructs correct URL for csv format', () => {
    expect(getExportUrl('task-1', 'csv')).toBe(
      `${API_BASE}/api/tasks/task-1/export/csv`,
    );
  });

  it('getExportUrl constructs correct URL for html format', () => {
    expect(getExportUrl('task-1', 'html')).toBe(
      `${API_BASE}/api/tasks/task-1/export/html`,
    );
  });
});

describe('fetchJson error handling', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('throws with error field from JSON body', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse({ error: 'Validation failed' }, 422, 'Unprocessable Entity'),
    );

    await expect(api.tasks.list()).rejects.toThrow('422: Validation failed');
  });

  it('throws with message field when error field is absent', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse({ message: 'Not found' }, 404, 'Not Found'),
    );

    await expect(api.tasks.get('missing-id')).rejects.toThrow('404: Not found');
  });

  it('throws with statusText when JSON body has no error or message', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse({}, 500, 'Internal Server Error'),
    );

    await expect(api.tasks.list()).rejects.toThrow('500: Internal Server Error');
  });

  it('appends details when present in error body', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(
        { error: 'Invalid input', details: { field: 'goal', reason: 'too short' } },
        400,
      ),
    );

    await expect(api.tasks.list()).rejects.toThrow(
      '400: Invalid input: {"field":"goal","reason":"too short"}',
    );
  });

  it('falls back to statusText when JSON parsing fails', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mockFetch.mockResolvedValueOnce(errorResponseNonJson(502, 'Bad Gateway'));

      await expect(api.tasks.list()).rejects.toThrow('502: Bad Gateway');
      expect(consoleWarn).toHaveBeenCalledWith(
        '[api] Failed to parse error response body:',
        'Invalid JSON',
      );
    } finally {
      consoleWarn.mockRestore();
    }
  });

  it('passes init to fetch when provided', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTask));

    await api.tasks.create({
      goal: 'test',
      targetAppPath: '/path',
      llmModel: 'gpt-4o',
      priority: 'medium',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      }),
    );
  });
});

describe('api.tasks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('list', () => {
    it('fetches without params', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], total: 0, page: 1, limit: 10 }),
      );

      const result = await api.tasks.list();
      expect(result.data).toEqual([]);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/tasks?');
    });

    it('appends status param', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], total: 0, page: 1, limit: 10 }),
      );

      await api.tasks.list({ status: 'running' });
      expect(mockFetch.mock.calls[0][0]).toMatch(/[?&]status=running(&|$)/);
    });

    it('appends page param', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], total: 0, page: 2, limit: 10 }),
      );

      await api.tasks.list({ page: 2 });
      expect(mockFetch.mock.calls[0][0]).toMatch(/[?&]page=2(&|$)/);
    });

    it('appends limit param', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], total: 0, page: 1, limit: 25 }),
      );

      await api.tasks.list({ limit: 25 });
      expect(mockFetch.mock.calls[0][0]).toMatch(/[?&]limit=25(&|$)/);
    });

    it('appends all params together', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], total: 0, page: 3, limit: 20 }),
      );

      await api.tasks.list({ status: 'completed', page: 3, limit: 20 });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toMatch(/[?&]status=completed(&|$)/);
      expect(url).toMatch(/[?&]page=3(&|$)/);
      expect(url).toMatch(/[?&]limit=20(&|$)/);
    });
  });

  describe('get', () => {
    it('fetches task by id', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ task: mockTask, steps: [] }));

      const result = await api.tasks.get(mockTask.id);
      expect(result.task).toEqual(mockTask);
      expect(mockFetch.mock.calls[0][0]).toContain(`/api/tasks/${mockTask.id}`);
    });
  });

  describe('create', () => {
    it('sends POST with correct body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockTask));

      const data = {
        goal: 'Test goal',
        targetAppPath: '/test/path',
        llmModel: 'gpt-4o',
        priority: 'medium' as const,
      };
      const result = await api.tasks.create(data);

      expect(result).toEqual(mockTask);
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain('/api/tasks');
      const body = JSON.parse(call[1].body);
      expect(body.goal).toBe('Test goal');
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Bad request' }, 400));

      await expect(
        api.tasks.create({
          goal: '',
          targetAppPath: '',
          llmModel: '',
          priority: 'medium',
        }),
      ).rejects.toThrow('400: Bad request');
    });
  });

  describe('delete', () => {
    it('sends DELETE request', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(undefined));

      await api.tasks.delete('task-1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tasks/task-1'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('returns undefined on success', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(undefined));

      const result = await api.tasks.delete('task-1');
      expect(result).toBeUndefined();
    });

    it('silently swallows non-OK response (resolves to undefined)', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Not found' }, 404));

      const result = await api.tasks.delete('task-1');
      expect(result).toBeUndefined();
    });
  });

  describe('cancel', () => {
    it('sends POST to cancel endpoint', async () => {
      const cancelled = { ...mockTask, status: 'cancelled' };
      mockFetch.mockResolvedValueOnce(jsonResponse(cancelled));

      const result = await api.tasks.cancel(mockTask.id);
      expect(result.status).toBe('cancelled');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/tasks/${mockTask.id}/cancel`),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Cannot cancel' }, 409));

      await expect(api.tasks.cancel('task-1')).rejects.toThrow('409: Cannot cancel');
    });
  });
});

describe('api.reports', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('get fetches report for task', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: 'report' }));

    const result = await api.reports.get('task-1');
    expect(result).toEqual({ data: 'report' });
    expect(mockFetch.mock.calls[0][0]).toContain('/api/tasks/task-1/report');
  });

  it('getHtmlUrl returns correct URL', () => {
    expect(api.reports.getHtmlUrl('task-1')).toBe(
      `${API_BASE}/api/tasks/task-1/report/html`,
    );
  });
});

describe('api.feedback', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('getPatterns returns patterns', async () => {
    const patterns = [{ id: 'p1', errorType: 'click' }];
    mockFetch.mockResolvedValueOnce(jsonResponse({ patterns }));

    const result = await api.feedback.getPatterns();
    expect(result.patterns).toEqual(patterns);
  });

  it('getPatterns throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Unauthorized' }, 401));

    await expect(api.feedback.getPatterns()).rejects.toThrow('401: Unauthorized');
  });
});

describe('api.providers', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('list returns providers config', async () => {
    const config = {
      version: 1,
      providers: [{ id: 'p1', name: 'OpenAI', type: 'openai-compatible' as const, apiKey: 'k', baseURL: 'https://api.openai.com', model: 'gpt-4o' }],
      activeId: 'p1',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(config));

    const result = await api.providers.list();
    expect(result.providers).toHaveLength(1);
    expect(result.activeId).toBe('p1');
  });

  it('create sends POST and returns new provider', async () => {
    const provider = {
      id: 'p2',
      name: 'Test',
      type: 'openai-compatible' as const,
      apiKey: 'key',
      baseURL: 'https://api.test.com',
      model: 'model-1',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(provider));

    const result = await api.providers.create({
      name: 'Test',
      apiKey: 'key',
      baseURL: 'https://api.test.com',
      model: 'model-1',
    });

    expect(result.id).toBe('p2');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/providers'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('update sends PUT with partial data', async () => {
    const updated = {
      id: 'p1',
      name: 'Updated',
      type: 'openai-compatible' as const,
      apiKey: 'k',
      baseURL: 'https://api.openai.com',
      model: 'gpt-4o',
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(updated));

    const result = await api.providers.update('p1', { name: 'Updated' });
    expect(result.name).toBe('Updated');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/providers/p1'),
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('delete sends DELETE', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(undefined));

    const result = await api.providers.delete('p1');
    expect(result).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/providers/p1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('delete silently swallows non-OK response (resolves to undefined)', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Forbidden' }, 403));

    const result = await api.providers.delete('p1');
    expect(result).toBeUndefined();
  });

  it('test sends POST to test endpoint', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, message: 'OK' }));

    const result = await api.providers.test('p1');
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/providers/p1/test'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('test returns error when provider fails', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: false, error: 'Invalid API key' }),
    );

    const result = await api.providers.test('p1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid API key');
  });

  it('activate sends POST to activate endpoint', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ activeId: 'p1' }));

    await api.providers.activate('p1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/providers/p1/activate'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('api.templates', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('list fetches templates without params', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await api.templates.list();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/templates?');
  });

  it('list appends category param', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await api.templates.list({ category: 'login' });
    expect(mockFetch.mock.calls[0][0]).toMatch(/[?&]category=login(&|$)/);
  });

  it('list appends search param', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await api.templates.list({ search: 'test' });
    expect(mockFetch.mock.calls[0][0]).toMatch(/[?&]search=test(&|$)/);
  });

  it('list appends both params', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await api.templates.list({ category: 'crud', search: 'create' });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toMatch(/[?&]category=crud(&|$)/);
    expect(url).toMatch(/[?&]search=create(&|$)/);
  });

  it('get fetches template by id', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 't1', name: 'Login' }));

    const result = await api.templates.get('t1');
    expect(result).toEqual({ id: 't1', name: 'Login' });
  });

  it('create sends POST with template data', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 't2' }));

    await api.templates.create({ name: 'New Template' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/templates'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('delete sends DELETE', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(undefined));

    const result = await api.templates.delete('t1');
    expect(result).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/templates/t1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('delete silently swallows non-OK response (resolves to undefined)', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Not found' }, 404));

    const result = await api.templates.delete('t1');
    expect(result).toBeUndefined();
  });
});

describe('api.health', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('check returns health response', async () => {
    const health = {
      status: 'ok',
      timestamp: '2026-01-01T00:00:00Z',
      checks: {
        database: { status: 'ok' },
        workerPool: { status: 'ok', running: 0, queued: 0, maxWorkers: 4 },
      },
      uptime: 12345,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(health));

    const result = await api.health.check();
    expect(result.status).toBe('ok');
    expect(result.uptime).toBe(12345);
    expect(mockFetch.mock.calls[0][0]).toContain('/health');
  });

  it('check throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Service unavailable' }, 503));

    await expect(api.health.check()).rejects.toThrow('503: Service unavailable');
  });
});

describe('api.batches', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('create sends POST and returns batch info', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ batchId: 'b1', taskIds: ['t1', 't2'], totalTasks: 2 }),
    );

    const result = await api.batches.create({
      tasks: [
        { goal: 'Task 1' },
        { goal: 'Task 2' },
      ],
    });

    expect(result.batchId).toBe('b1');
    expect(result.taskIds).toHaveLength(2);
    expect(result.totalTasks).toBe(2);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/tasks/batch'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('create with priority', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ batchId: 'b2', taskIds: ['t1'], totalTasks: 1 }),
    );

    await api.batches.create({
      name: 'Test batch',
      tasks: [{ goal: 'Task 1', config: { maxSteps: 100, providerId: 'p1' } }],
      priority: 'high',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.priority).toBe('high');
    expect(body.name).toBe('Test batch');
  });

  it('get fetches batch status', async () => {
    const batch = {
      id: 'b1',
      name: 'Test',
      status: 'running' as const,
      totalTasks: 5,
      completedTasks: 2,
      failedTasks: 0,
      priority: 'medium',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T01:00:00Z',
      tasks: [],
      progress: 40,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(batch));

    const result = await api.batches.get('b1');
    expect(result.status).toBe('running');
    expect(result.progress).toBe(40);
  });

  it('cancel sends POST to cancel endpoint', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, batchId: 'b1' }),
    );

    const result = await api.batches.cancel('b1');
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/tasks/batch/b1/cancel'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('cancel throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Already finished' }, 409));

    await expect(api.batches.cancel('b1')).rejects.toThrow('409: Already finished');
  });
});

describe('api.fewShot (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('list', () => {
    it('returns empty array when no data in localStorage', () => {
      expect(api.fewShot.list()).toEqual([]);
    });

    it('returns parsed data from localStorage', () => {
      const examples = [
        {
          id: 'fs-1',
          goal: 'test',
          steps: [{ action: 'click', observation: 'button' }],
          expectedResult: 'ok',
          metadata: { tags: ['login'], domain: 'web', difficulty: 'easy' },
        },
      ];
      localStorage.setItem('eata-few-shot-examples', JSON.stringify(examples));

      const result = api.fewShot.list();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('fs-1');
    });

    it('returns empty array on invalid JSON', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        localStorage.setItem('eata-few-shot-examples', '{invalid json');

        const result = api.fewShot.list();
        expect(result).toEqual([]);
        expect(consoleWarn).toHaveBeenCalledWith(
          '[api] Failed to parse few-shot examples from localStorage:',
          expect.any(String),
        );
      } finally {
        consoleWarn.mockRestore();
      }
    });
  });

  describe('add', () => {
    it('adds an example and returns it with generated id', () => {
      const data = {
        goal: 'Test login',
        steps: [{ action: 'click', observation: 'button' }],
        expectedResult: 'Logged in',
        metadata: { tags: ['auth'], domain: 'web', difficulty: 'easy' },
      };

      const result = api.fewShot.add(data);

      expect(result.id).toMatch(/^fs-/);
      expect(result.goal).toBe('Test login');

      const stored = api.fewShot.list();
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe(result.id);
    });

    it('appends to existing examples', () => {
      const existing = [
        {
          id: 'fs-existing',
          goal: 'old',
          steps: [],
          expectedResult: 'ok',
          metadata: { tags: [], domain: 'web', difficulty: 'easy' },
        },
      ];
      localStorage.setItem('eata-few-shot-examples', JSON.stringify(existing));

      api.fewShot.add({
        goal: 'new',
        steps: [],
        expectedResult: 'ok',
        metadata: { tags: [], domain: 'web', difficulty: 'easy' },
      });

      const stored = api.fewShot.list();
      expect(stored).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('updates an existing example', () => {
      const existing = [
        {
          id: 'fs-1',
          goal: 'old goal',
          steps: [],
          expectedResult: 'old',
          metadata: { tags: [], domain: 'web', difficulty: 'easy' },
        },
      ];
      localStorage.setItem('eata-few-shot-examples', JSON.stringify(existing));

      api.fewShot.update('fs-1', {
        goal: 'new goal',
        steps: [{ action: 'click', observation: 'btn' }],
        expectedResult: 'new',
        metadata: { tags: ['updated'], domain: 'web', difficulty: 'hard' },
      });

      const stored = api.fewShot.list();
      expect(stored[0].goal).toBe('new goal');
      expect(stored[0].id).toBe('fs-1');
    });

    it('does nothing when id is not found', () => {
      const existing = [
        {
          id: 'fs-1',
          goal: 'keep',
          steps: [],
          expectedResult: 'ok',
          metadata: { tags: [], domain: 'web', difficulty: 'easy' },
        },
      ];
      localStorage.setItem('eata-few-shot-examples', JSON.stringify(existing));

      api.fewShot.update('nonexistent', {
        goal: 'should not persist',
        steps: [],
        expectedResult: 'ok',
        metadata: { tags: [], domain: 'web', difficulty: 'easy' },
      });

      const stored = api.fewShot.list();
      expect(stored[0].goal).toBe('keep');
    });
  });

  describe('remove', () => {
    it('removes an example by id', () => {
      const existing = [
        {
          id: 'fs-1',
          goal: 'keep',
          steps: [],
          expectedResult: 'ok',
          metadata: { tags: [], domain: 'web', difficulty: 'easy' },
        },
        {
          id: 'fs-2',
          goal: 'remove',
          steps: [],
          expectedResult: 'ok',
          metadata: { tags: [], domain: 'web', difficulty: 'easy' },
        },
      ];
      localStorage.setItem('eata-few-shot-examples', JSON.stringify(existing));

      api.fewShot.remove('fs-2');

      const stored = api.fewShot.list();
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe('fs-1');
    });

    it('does nothing when id is not found', () => {
      const existing = [
        {
          id: 'fs-1',
          goal: 'keep',
          steps: [],
          expectedResult: 'ok',
          metadata: { tags: [], domain: 'web', difficulty: 'easy' },
        },
      ];
      localStorage.setItem('eata-few-shot-examples', JSON.stringify(existing));

      api.fewShot.remove('nonexistent');

      const stored = api.fewShot.list();
      expect(stored).toHaveLength(1);
    });
  });
});
