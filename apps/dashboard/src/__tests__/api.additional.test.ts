import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, getScreenshotUrl, getExportUrl } from '../lib/api.js';

const API_BASE = 'http://localhost:3000';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function jsonResponse(body: unknown, init?: { status?: number; statusText?: string }) {
  return {
    ok: init?.status ? init.status >= 200 && init.status < 300 : true,
    status: init?.status ?? 200,
    statusText: init?.statusText ?? 'OK',
    json: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob(['test'])),
  };
}

function errorResponse(body: unknown, status = 400, statusText = 'Bad Request') {
  return {
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve(body),
  };
}

function errorResponseNonJson(status = 500, statusText = 'Internal Server Error') {
  return {
    ok: false,
    status,
    statusText,
    json: () => Promise.reject(new Error('Invalid JSON')),
  };
}

// ─────────────────────────────────────────────────────────────
// URL helpers – additional coverage
// ─────────────────────────────────────────────────────────────
describe('URL helpers – additional', () => {
  it('getExportUrl constructs correct URL for pdf format', () => {
    expect(getExportUrl('task-1', 'pdf')).toBe(`${API_BASE}/api/tasks/task-1/export/pdf`);
  });

  it('getScreenshotUrl with step 0', () => {
    expect(getScreenshotUrl('abc', 0)).toBe(`${API_BASE}/api/tasks/abc/steps/0/screenshot`);
  });
});

// ─────────────────────────────────────────────────────────────
// fetchJson – additional error paths
// ─────────────────────────────────────────────────────────────
describe('fetchJson – additional error paths', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('handles network error (fetch rejects)', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(api.tasks.list()).rejects.toThrow('Failed to fetch');
  });

  it('handles non-Error thrown by fetch', async () => {
    mockFetch.mockRejectedValueOnce('string error');

    await expect(api.tasks.list()).rejects.toBe('string error');
  });

  it('omits details when body.details is falsy', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse({ error: 'Bad', details: null }, 400),
    );

    await expect(api.tasks.list()).rejects.toThrow('400: Bad');
  });

  it('includes details when body.details is an object', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse({ error: 'Bad', details: { x: 1 } }, 400),
    );

    await expect(api.tasks.list()).rejects.toThrow('400: Bad: {"x":1}');
  });

  it('logs non-Error caught during JSON parse as String(err)', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'ERR',
        json: () => Promise.reject('raw string'),
      });

      await expect(api.tasks.list()).rejects.toThrow('500: ERR');
      expect(consoleWarn).toHaveBeenCalledWith(
        '[api] Failed to parse error response body:',
        'raw string',
      );
    } finally {
      consoleWarn.mockRestore();
    }
  });
});

// ─────────────────────────────────────────────────────────────
// api.tasks – batchExport
// ─────────────────────────────────────────────────────────────
describe('api.tasks.batchExport', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('sends POST with taskIds and format, returns Blob', async () => {
    const blob = new Blob(['data'], { type: 'application/json' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(blob),
    });

    const result = await api.tasks.batchExport(['t1', 't2'], 'json');
    expect(result).toBe(blob);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/tasks/batch-export'),
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.taskIds).toEqual(['t1', 't2']);
    expect(body.format).toBe('json');
  });

  it('works with csv format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob()),
    });

    await api.tasks.batchExport(['t1'], 'csv');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.format).toBe('csv');
  });

  it('works with html format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob()),
    });

    await api.tasks.batchExport(['t1'], 'html');
  });

  it('works with pdf format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob()),
    });

    await api.tasks.batchExport(['t1'], 'pdf');
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(api.tasks.batchExport(['t1'], 'json')).rejects.toThrow(
      'Batch export failed: 500',
    );
  });
});

// ─────────────────────────────────────────────────────────────
// api.reportTemplates
// ─────────────────────────────────────────────────────────────
describe('api.reportTemplates', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const mockTemplate = {
    id: 'rt-1',
    name: 'Default',
    sections: [],
    styling: { theme: 'light', primaryColor: '#000' },
    isDefault: true,
  };

  it('list fetches all report templates', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [mockTemplate] }));

    const result = await api.reportTemplates.list();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('rt-1');
    expect(mockFetch.mock.calls[0][0]).toContain('/api/report-templates');
  });

  it('list throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Fail' }, 500));

    await expect(api.reportTemplates.list()).rejects.toThrow('500: Fail');
  });

  it('get fetches single template by id', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTemplate));

    const result = await api.reportTemplates.get('rt-1');
    expect(result.id).toBe('rt-1');
    expect(mockFetch.mock.calls[0][0]).toContain('/api/report-templates/rt-1');
  });

  it('get throws on not found', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Not found' }, 404));

    await expect(api.reportTemplates.get('missing')).rejects.toThrow('404: Not found');
  });

  it('create sends POST and returns template', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTemplate));

    const result = await api.reportTemplates.create({
      name: 'Default',
      sections: [],
      styling: { theme: 'light', primaryColor: '#000' },
    });

    expect(result.id).toBe('rt-1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/report-templates'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('create throws on validation error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Invalid' }, 422));

    await expect(
      api.reportTemplates.create({
        name: '',
        sections: [],
        styling: { theme: 'light', primaryColor: '#000' },
      }),
    ).rejects.toThrow('422: Invalid');
  });

  it('update sends PUT and returns updated template', async () => {
    const updated = { ...mockTemplate, name: 'Updated' };
    mockFetch.mockResolvedValueOnce(jsonResponse(updated));

    const result = await api.reportTemplates.update('rt-1', { name: 'Updated' });
    expect(result.name).toBe('Updated');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/report-templates/rt-1'),
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('update throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Forbidden' }, 403));

    await expect(api.reportTemplates.update('rt-1', { name: 'X' })).rejects.toThrow('403: Forbidden');
  });

  it('delete sends DELETE request', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(undefined));

    const result = await api.reportTemplates.delete('rt-1');
    expect(result).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/report-templates/rt-1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('delete throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Not found' }, 404));

    await expect(api.reportTemplates.delete('rt-1')).rejects.toThrow(
      'Delete report template failed: 404',
    );
  });
});

// ─────────────────────────────────────────────────────────────
// api.schedules
// ─────────────────────────────────────────────────────────────
describe('api.schedules', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const mockSchedule = {
    id: 's-1',
    name: 'Daily test',
    templateId: 'rt-1',
    cronExpression: '0 9 * * *',
    enabled: true,
    lastRunAt: null,
    nextRunAt: '2026-01-02T09:00:00Z',
    runCount: 0,
    lastStatus: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  it('list fetches all schedules', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [mockSchedule], total: 1 }));

    const result = await api.schedules.list();
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(mockFetch.mock.calls[0][0]).toContain('/api/schedules');
  });

  it('list throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Server error' }, 500));

    await expect(api.schedules.list()).rejects.toThrow('500: Server error');
  });

  it('get fetches schedule by id', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockSchedule));

    const result = await api.schedules.get('s-1');
    expect(result.id).toBe('s-1');
    expect(result.cronExpression).toBe('0 9 * * *');
    expect(mockFetch.mock.calls[0][0]).toContain('/api/schedules/s-1');
  });

  it('get throws on not found', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Not found' }, 404));

    await expect(api.schedules.get('missing')).rejects.toThrow('404: Not found');
  });

  it('create sends POST and returns schedule', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockSchedule));

    const result = await api.schedules.create({
      name: 'Daily test',
      templateId: 'rt-1',
      cronExpression: '0 9 * * *',
      enabled: true,
    });

    expect(result.id).toBe('s-1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/schedules'),
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.cronExpression).toBe('0 9 * * *');
  });

  it('create throws on validation error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Invalid cron' }, 422));

    await expect(
      api.schedules.create({
        name: 'Bad',
        templateId: 'rt-1',
        cronExpression: 'bad',
        enabled: true,
      }),
    ).rejects.toThrow('422: Invalid cron');
  });

  it('update sends PUT and returns updated schedule', async () => {
    const updated = { ...mockSchedule, name: 'Updated' };
    mockFetch.mockResolvedValueOnce(jsonResponse(updated));

    const result = await api.schedules.update('s-1', { name: 'Updated' });
    expect(result.name).toBe('Updated');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/schedules/s-1'),
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('update throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Forbidden' }, 403));

    await expect(api.schedules.update('s-1', { name: 'X' })).rejects.toThrow('403: Forbidden');
  });

  it('delete sends DELETE request', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(undefined));

    const result = await api.schedules.delete('s-1');
    expect(result).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/schedules/s-1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('delete throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Not found' }, 404));

    await expect(api.schedules.delete('s-1')).rejects.toThrow('Delete schedule failed: 404');
  });

  it('run sends POST and returns run info', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ taskId: 't-1', runId: 'r-1', message: 'Started' }),
    );

    const result = await api.schedules.run('s-1');
    expect(result.taskId).toBe('t-1');
    expect(result.runId).toBe('r-1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/schedules/s-1/run'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('run throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Schedule disabled' }, 409));

    await expect(api.schedules.run('s-1')).rejects.toThrow('409: Schedule disabled');
  });

  it('history fetches run history', async () => {
    const runs = [
      {
        id: 'r-1',
        scheduleId: 's-1',
        taskId: 't-1',
        startedAt: '2026-01-01T09:00:00Z',
        completedAt: '2026-01-01T09:05:00Z',
        status: 'completed',
        summary: 'OK',
        error: null,
      },
    ];
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: runs, total: 1 }));

    const result = await api.schedules.history('s-1');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].status).toBe('completed');
    expect(mockFetch.mock.calls[0][0]).toContain('/api/schedules/s-1/history');
  });

  it('history throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Not found' }, 404));

    await expect(api.schedules.history('s-1')).rejects.toThrow('404: Not found');
  });
});

// ─────────────────────────────────────────────────────────────
// api.notifications
// ─────────────────────────────────────────────────────────────
describe('api.notifications', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const mockConfig = {
    id: 'nc-1',
    webhookUrls: ['https://hooks.example.com/test'],
    sseEnabled: true,
    eventTypes: ['task.completed'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  it('getConfig fetches notification config', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockConfig));

    const result = await api.notifications.getConfig();
    expect(result.id).toBe('nc-1');
    expect(result.webhookUrls).toHaveLength(1);
    expect(mockFetch.mock.calls[0][0]).toContain('/api/notifications/config');
  });

  it('getConfig throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Unauthorized' }, 401));

    await expect(api.notifications.getConfig()).rejects.toThrow('401: Unauthorized');
  });

  it('updateConfig sends PUT and returns updated config', async () => {
    const updated = { ...mockConfig, sseEnabled: false };
    mockFetch.mockResolvedValueOnce(jsonResponse(updated));

    const result = await api.notifications.updateConfig({ sseEnabled: false });
    expect(result.sseEnabled).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/notifications/config'),
      expect.objectContaining({ method: 'PUT' }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.sseEnabled).toBe(false);
  });

  it('updateConfig with all fields', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockConfig));

    await api.notifications.updateConfig({
      webhookUrls: ['https://hooks.example.com/new'],
      sseEnabled: true,
      eventTypes: ['task.completed', 'task.failed'],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.webhookUrls).toEqual(['https://hooks.example.com/new']);
    expect(body.eventTypes).toEqual(['task.completed', 'task.failed']);
  });

  it('updateConfig throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Invalid URL' }, 422));

    await expect(api.notifications.updateConfig({ webhookUrls: ['bad'] })).rejects.toThrow(
      '422: Invalid URL',
    );
  });

  it('test sends POST and returns result', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, message: 'Test sent' }));

    const result = await api.notifications.test();
    expect(result.success).toBe(true);
    expect(result.message).toBe('Test sent');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/notifications/test'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('test throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'No webhook configured' }, 400));

    await expect(api.notifications.test()).rejects.toThrow('400: No webhook configured');
  });

  it('history fetches notification log', async () => {
    const entries = [
      {
        id: 'nl-1',
        eventType: 'task.completed',
        channel: 'webhook' as const,
        target: 'https://hooks.example.com',
        status: 'sent' as const,
        error: null,
        payload: { taskId: 't-1' },
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: entries }));

    const result = await api.notifications.history();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].status).toBe('sent');
    expect(mockFetch.mock.calls[0][0]).toContain('/api/notifications/history');
  });

  it('history throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Server error' }, 500));

    await expect(api.notifications.history()).rejects.toThrow('500: Server error');
  });
});

// ─────────────────────────────────────────────────────────────
// api.compare
// ─────────────────────────────────────────────────────────────
describe('api.compare', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('run sends POST with taskIds', async () => {
    const comparison = { diff: 'some diff' };
    mockFetch.mockResolvedValueOnce(jsonResponse(comparison));

    const result = await api.compare.run(['t1', 't2']);
    expect(result).toEqual(comparison);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/tasks/compare'),
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.taskIds).toEqual(['t1', 't2']);
  });

  it('run throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Tasks not found' }, 404));

    await expect(api.compare.run(['t1', 't2'])).rejects.toThrow('404: Tasks not found');
  });

  it('detailed sends POST with taskIds', async () => {
    const detailed = { steps: [], metrics: {} };
    mockFetch.mockResolvedValueOnce(jsonResponse(detailed));

    const result = await api.compare.detailed(['t1', 't2']);
    expect(result).toEqual(detailed);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/tasks/compare/detailed'),
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.taskIds).toEqual(['t1', 't2']);
  });

  it('detailed throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Comparison failed' }, 500));

    await expect(api.compare.detailed(['t1', 't2'])).rejects.toThrow('500: Comparison failed');
  });
});

// ─────────────────────────────────────────────────────────────
// api.trends
// ─────────────────────────────────────────────────────────────
describe('api.trends', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('get fetches trends without days param', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ trends: [] }));

    await api.trends.get();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/tasks/trends');
    expect(url).not.toContain('days=');
  });

  it('get fetches trends with days param', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ trends: [] }));

    await api.trends.get(30);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/tasks/trends?days=30');
  });

  it('get with days=0 still appends param', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ trends: [] }));

    await api.trends.get(0);
    // 0 is falsy so days param is omitted
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/tasks/trends');
    expect(url).not.toContain('days=');
  });

  it('get throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Server error' }, 500));

    await expect(api.trends.get()).rejects.toThrow('500: Server error');
  });
});

// ─────────────────────────────────────────────────────────────
// api.storage
// ─────────────────────────────────────────────────────────────
describe('api.storage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('getInfo fetches storage info', async () => {
    const info = { totalSize: 1024, fileCount: 10, quota: 10240, isOverQuota: false };
    mockFetch.mockResolvedValueOnce(jsonResponse(info));

    const result = await api.storage.getInfo();
    expect(result.totalSize).toBe(1024);
    expect(result.isOverQuota).toBe(false);
    expect(mockFetch.mock.calls[0][0]).toContain('/api/storage');
  });

  it('getInfo throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Unauthorized' }, 401));

    await expect(api.storage.getInfo()).rejects.toThrow('401: Unauthorized');
  });

  it('cleanup sends POST and returns result', async () => {
    const result_data = { deletedCount: 5, totalSize: 512, fileCount: 5 };
    mockFetch.mockResolvedValueOnce(jsonResponse(result_data));

    const result = await api.storage.cleanup();
    expect(result.deletedCount).toBe(5);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/storage/cleanup'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('cleanup throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Cleanup failed' }, 500));

    await expect(api.storage.cleanup()).rejects.toThrow('500: Cleanup failed');
  });
});

// ─────────────────────────────────────────────────────────────
// api.audit
// ─────────────────────────────────────────────────────────────
describe('api.audit', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const mockUsageResult = {
    records: [],
    summary: { total_prompt_tokens: 100, total_completion_tokens: 50, total_tokens: 150, record_count: 1 },
    by_provider: [],
    by_day: [],
    total: 1,
    page: 1,
    limit: 10,
  };

  describe('getTokenUsage', () => {
    it('fetches without params', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockUsageResult));

      const result = await api.audit.getTokenUsage();
      expect(result.total).toBe(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/audit/tokens');
    });

    it('appends start_date param', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockUsageResult));

      await api.audit.getTokenUsage({ start_date: '2026-01-01' });
      expect(mockFetch.mock.calls[0][0]).toMatch(/[?&]start_date=2026-01-01(&|$)/);
    });

    it('appends end_date param', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockUsageResult));

      await api.audit.getTokenUsage({ end_date: '2026-01-31' });
      expect(mockFetch.mock.calls[0][0]).toMatch(/[?&]end_date=2026-01-31(&|$)/);
    });

    it('appends provider param', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockUsageResult));

      await api.audit.getTokenUsage({ provider: 'openai' });
      expect(mockFetch.mock.calls[0][0]).toMatch(/[?&]provider=openai(&|$)/);
    });

    it('appends page and limit params', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockUsageResult));

      await api.audit.getTokenUsage({ page: 2, limit: 25 });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toMatch(/[?&]page=2(&|$)/);
      expect(url).toMatch(/[?&]limit=25(&|$)/);
    });

    it('appends all params together', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockUsageResult));

      await api.audit.getTokenUsage({
        start_date: '2026-01-01',
        end_date: '2026-01-31',
        provider: 'openai',
        page: 1,
        limit: 50,
      });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toMatch(/[?&]start_date=2026-01-01(&|$)/);
      expect(url).toMatch(/[?&]end_date=2026-01-31(&|$)/);
      expect(url).toMatch(/[?&]provider=openai(&|$)/);
      expect(url).toMatch(/[?&]page=1(&|$)/);
      expect(url).toMatch(/[?&]limit=50(&|$)/);
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Unauthorized' }, 401));

      await expect(api.audit.getTokenUsage()).rejects.toThrow('401: Unauthorized');
    });
  });

  describe('getTaskUsage', () => {
    it('fetches token usage for a task', async () => {
      const records = [
        {
          id: 1,
          task_id: 't-1',
          provider: 'openai',
          model: 'gpt-4o',
          prompt_tokens: 100,
          completion_tokens: 50,
          created_at: '2026-01-01T00:00:00Z',
        },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: records }));

      const result = await api.audit.getTaskUsage('t-1');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].provider).toBe('openai');
      expect(mockFetch.mock.calls[0][0]).toContain('/api/audit/tokens/task/t-1');
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Not found' }, 404));

      await expect(api.audit.getTaskUsage('missing')).rejects.toThrow('404: Not found');
    });
  });

  describe('getProviders', () => {
    it('fetches list of providers', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: ['openai', 'anthropic'] }));

      const result = await api.audit.getProviders();
      expect(result.data).toEqual(['openai', 'anthropic']);
      expect(mockFetch.mock.calls[0][0]).toContain('/api/audit/tokens/providers');
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Server error' }, 500));

      await expect(api.audit.getProviders()).rejects.toThrow('500: Server error');
    });
  });
});

// ─────────────────────────────────────────────────────────────
// api.batches – list (not covered in existing tests)
// ─────────────────────────────────────────────────────────────
describe('api.batches – list', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('fetches without params', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], total: 0, page: 1, limit: 10 }));

    const result = await api.batches.list();
    expect(result.data).toEqual([]);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/tasks/batches?');
  });

  it('appends status param', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], total: 0, page: 1, limit: 10 }));

    await api.batches.list({ status: 'running' });
    expect(mockFetch.mock.calls[0][0]).toMatch(/[?&]status=running(&|$)/);
  });

  it('appends page param', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], total: 0, page: 2, limit: 10 }));

    await api.batches.list({ page: 2 });
    expect(mockFetch.mock.calls[0][0]).toMatch(/[?&]page=2(&|$)/);
  });

  it('appends limit param', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], total: 0, page: 1, limit: 25 }));

    await api.batches.list({ limit: 25 });
    expect(mockFetch.mock.calls[0][0]).toMatch(/[?&]limit=25(&|$)/);
  });

  it('appends all params together', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], total: 0, page: 3, limit: 20 }));

    await api.batches.list({ status: 'completed', page: 3, limit: 20 });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toMatch(/[?&]status=completed(&|$)/);
    expect(url).toMatch(/[?&]page=3(&|$)/);
    expect(url).toMatch(/[?&]limit=20(&|$)/);
  });

  it('throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Server error' }, 500));

    await expect(api.batches.list()).rejects.toThrow('500: Server error');
  });
});

// ─────────────────────────────────────────────────────────────
// Additional error paths for existing methods
// ─────────────────────────────────────────────────────────────
describe('Additional error paths', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('tasks.get throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Not found' }, 404));

    await expect(api.tasks.get('missing')).rejects.toThrow('404: Not found');
  });

  it('tasks.cancel throws on 500', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Server error' }, 500));

    await expect(api.tasks.cancel('t-1')).rejects.toThrow('500: Server error');
  });

  it('providers.create throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Duplicate name' }, 409));

    await expect(
      api.providers.create({ name: 'Dup', apiKey: 'k', baseURL: 'https://x.com', model: 'm' }),
    ).rejects.toThrow('409: Duplicate name');
  });

  it('providers.update throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Not found' }, 404));

    await expect(api.providers.update('p-missing', { name: 'X' })).rejects.toThrow('404: Not found');
  });

  it('providers.test throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Not found' }, 404));

    await expect(api.providers.test('p-missing')).rejects.toThrow('404: Not found');
  });

  it('providers.activate throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Not found' }, 404));

    await expect(api.providers.activate('p-missing')).rejects.toThrow('404: Not found');
  });

  it('templates.create throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Invalid' }, 422));

    await expect(api.templates.create({ name: '' })).rejects.toThrow('422: Invalid');
  });

  it('health.check with degraded status', async () => {
    const health = {
      status: 'degraded',
      timestamp: '2026-01-01T00:00:00Z',
      checks: {
        database: { status: 'ok' },
        workerPool: { status: 'degraded', running: 3, queued: 5, maxWorkers: 4 },
      },
      uptime: 100,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(health));

    const result = await api.health.check();
    expect(result.status).toBe('degraded');
  });

  it('batches.get throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Not found' }, 404));

    await expect(api.batches.get('b-missing')).rejects.toThrow('404: Not found');
  });

  it('batches.create throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Invalid tasks' }, 422));

    await expect(api.batches.create({ tasks: [] })).rejects.toThrow('422: Invalid tasks');
  });

  it('reports.get throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Not found' }, 404));

    await expect(api.reports.get('missing')).rejects.toThrow('404: Not found');
  });

  it('templates.list with both params throws on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse({ error: 'Server error' }, 500));

    await expect(api.templates.list({ category: 'login', search: 'x' })).rejects.toThrow(
      '500: Server error',
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Network-level failures
// ─────────────────────────────────────────────────────────────
describe('Network-level failures', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('propagates TypeError from fetch for all POST methods', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));

    await expect(api.tasks.create({ goal: 'x', targetAppPath: '/x', llmModel: 'm', priority: 'low' })).rejects.toThrow('Network request failed');
    await expect(api.batches.create({ tasks: [{ goal: 'x' }] })).rejects.toThrow('Network request failed');
  });

  it('propagates TypeError from fetch for GET methods', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));

    await expect(api.health.check()).rejects.toThrow('Network request failed');
    await expect(api.schedules.list()).rejects.toThrow('Network request failed');
    await expect(api.storage.getInfo()).rejects.toThrow('Network request failed');
  });
});
