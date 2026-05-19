import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock runTest before import
const { mockRunTest } = vi.hoisted(() => ({
  mockRunTest: vi.fn(),
}));

vi.mock('./runner.js', () => ({
  runTest: mockRunTest,
}));

import { emit, parseArgs, resolveArgs } from './worker-entry.js';

// ── emit ──────────────────────────────────────────────────

describe('emit', () => {
  let spy: any;

  beforeEach(() => {
    spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('writes valid JSON-RPC notification', () => {
    emit('heartbeat', {});
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.method).toBe('heartbeat');
    expect(parsed.params).toEqual({});
  });

  it('includes params in output', () => {
    emit('step_start', { taskId: 'test-1', phase: 'init' });
    const output = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.params.taskId).toBe('test-1');
    expect(parsed.params.phase).toBe('init');
  });

  it('ends with newline', () => {
    emit('heartbeat');
    const output = spy.mock.calls[0][0] as string;
    expect(output.endsWith('\n')).toBe(true);
  });
});

// ── parseArgs ─────────────────────────────────────────────

describe('parseArgs', () => {
  it('parses --key value pairs', () => {
    const result = parseArgs(['node', 'worker-entry.ts', '--task-id', 'abc', '--goal', 'test goal']);
    expect(result['task-id']).toBe('abc');
    expect(result['goal']).toBe('test goal');
  });

  it('handles empty argv', () => {
    const result = parseArgs(['node', 'worker-entry.ts']);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('strips leading -- from keys', () => {
    const result = parseArgs(['node', 'worker-entry.ts', '--max-steps', '10']);
    expect(result['max-steps']).toBe('10');
  });
});

// ── resolveArgs ───────────────────────────────────────────

describe('resolveArgs', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('maps target-app correctly (matches workerManager buildArgs)', () => {
    const result = resolveArgs({ 'task-id': 't1', 'goal': 'g1', 'target-app': '/my/app' });
    expect(result.targetAppPath).toBe('/my/app');
  });

  it('maps task-id, goal, llm-model', () => {
    const result = resolveArgs({
      'task-id': 'task-123',
      'goal': 'click button',
      'target-app': '/app',
      'llm-model': 'gpt-4o-mini',
      'max-steps': '20',
    });
    expect(result.taskId).toBe('task-123');
    expect(result.goal).toBe('click button');
    expect(result.llmModel).toBe('gpt-4o-mini');
    expect(result.maxSteps).toBe(20);
  });

  it('falls back to env vars', () => {
    process.env.TASK_ID = 'env-task';
    process.env.GOAL = 'env-goal';
    process.env.TARGET_APP = '/env/app';
    process.env.LLM_MODEL = 'claude-3.5-sonnet';
    const result = resolveArgs({});
    expect(result.taskId).toBe('env-task');
    expect(result.goal).toBe('env-goal');
    expect(result.targetAppPath).toBe('/env/app');
    expect(result.llmModel).toBe('claude-3.5-sonnet');
  });

  it('uses hardcoded defaults when nothing provided', () => {
    delete process.env.TASK_ID;
    delete process.env.GOAL;
    delete process.env.TARGET_APP;
    delete process.env.LLM_MODEL;
    const result = resolveArgs({});
    expect(result.taskId).toBe('default');
    expect(result.goal).toBe('test');
    expect(result.targetAppPath).toBe('./fixtures/test-electron-app');
  });

  it('sets OPENAI_BASE_URL and OPENAI_API_KEY from llm-base-url and llm-api-key', () => {
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_API_KEY;
    resolveArgs({ 'task-id': 'x', 'goal': 'g', 'target-app': '/a', 'llm-base-url': 'https://api.example.com', 'llm-api-key': 'sk-test' });
    expect(process.env.OPENAI_BASE_URL).toBe('https://api.example.com');
    expect(process.env.OPENAI_API_KEY).toBe('sk-test');
  });
});

// ── workerMain integration (mocked runTest) ───────────────

describe('workerMain', () => {
  let stdoutSpy: any;
  let stderrSpy: any;
  let exitSpy: any;

  beforeEach(() => {
    mockRunTest.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.useFakeTimers();
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
    vi.useRealTimers();
  });

  it('emits step_start then task_end on success', async () => {
    mockRunTest.mockResolvedValue({ status: 'completed', stepCount: 5 });

    const { workerMain } = await import('./worker-entry.js');
    const promise = workerMain(['node', 'worker-entry.ts', '--task-id', 't1', '--goal', 'g', '--target-app', '/a']);

    // advance past heartbeat interval so the timer fires
    await vi.advanceTimersByTimeAsync(100);

    const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('');
    expect(output).toContain('step_start');
    expect(output).toContain('task_end');

    const code = await promise;
    expect(code).toBe(0);
  });

  it('emits error and task_end on runTest failure', async () => {
    mockRunTest.mockRejectedValue(new Error('LLM API down'));

    const { workerMain } = await import('./worker-entry.js');
    const promise = workerMain(['node', 'worker-entry.ts', '--task-id', 't2', '--goal', 'g', '--target-app', '/a']);

    await vi.advanceTimersByTimeAsync(100);

    const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('');
    expect(output).toContain('error');
    expect(output).toContain('LLM API down');
    expect(output).toContain('task_end');

    const code = await promise;
    expect(code).toBe(1);
  });

  it('heartbeat timer fires every 2 seconds', async () => {
    mockRunTest.mockImplementation(() => new Promise(() => {})); // hang forever

    const { workerMain } = await import('./worker-entry.js');
    const _promise = workerMain(['node', 'worker-entry.ts', '--task-id', 'hb', '--goal', 'g', '--target-app', '/a']);

    // Advance 2.1s — heartbeat should fire once
    await vi.advanceTimersByTimeAsync(2100);

    const output = stdoutSpy.mock.calls.map((c: any) => c[0]).join('');
    const heartbeatCount = (output.match(/"method":"heartbeat"/g) || []).length;
    expect(heartbeatCount).toBeGreaterThanOrEqual(1);

    // Advance another 2s — should fire again
    await vi.advanceTimersByTimeAsync(2000);
    const output2 = stdoutSpy.mock.calls.map((c: any) => c[0]).join('');
    const heartbeatCount2 = (output2.match(/"method":"heartbeat"/g) || []).length;
    expect(heartbeatCount2).toBeGreaterThanOrEqual(2);
  });
});
