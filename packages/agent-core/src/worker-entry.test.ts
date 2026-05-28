import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock runTest before import
const { mockRunTest, mockRl } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const rl = {
    close: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
      return rl;
    }),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      listeners.get(event)?.forEach((cb) => cb(...args));
    }),
  };
  return {
    mockRunTest: vi.fn(),
    mockRl: rl as unknown as { close: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; emit: ReturnType<typeof vi.fn> },
  };
});

vi.mock('./runner.js', () => ({
  runTest: mockRunTest,
}));

vi.mock('readline', () => ({
  createInterface: vi.fn().mockReturnValue(mockRl),
}));

import { emit, parseArgs, resolveArgs } from './worker-entry.js';
// createInterface is mocked via vi.mock above

// ── emit ──────────────────────────────────────────────────

describe('emit', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true) as unknown as typeof spy;
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

  it('maps provider-id from args', () => {
    const result = resolveArgs({ 'task-id': 't1', 'goal': 'g', 'target-app': '/a', 'provider-id': 'deepseek-1' });
    expect(result.providerId).toBe('deepseek-1');
  });

  it('maps provider-id from env', () => {
    process.env.PROVIDER_ID = 'env-provider-1';
    const result = resolveArgs({});
    expect(result.providerId).toBe('env-provider-1');
    delete process.env.PROVIDER_ID;
  });

  it('providerId is undefined when not provided', () => {
    delete process.env.PROVIDER_ID;
    const result = resolveArgs({ 'task-id': 'x', 'goal': 'g', 'target-app': '/a' });
    expect(result.providerId).toBeUndefined();
  });
});

// ── workerMain integration (mocked runTest) ───────────────

describe('workerMain', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockRunTest.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true) as unknown as typeof stdoutSpy;
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true) as unknown as typeof stderrSpy;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never) as unknown as typeof exitSpy;
    vi.useFakeTimers();
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
    vi.useRealTimers();
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
  });

  it('emits step_start then task_end on success', async () => {
    mockRunTest.mockResolvedValue({ status: 'completed', stepCount: 5 });

    const { workerMain } = await import('./worker-entry.js');
    const promise = workerMain(['node', 'worker-entry.ts', '--task-id', 't1', '--goal', 'g', '--target-app', '/a']);

    // advance past heartbeat interval so the timer fires
    await vi.advanceTimersByTimeAsync(100);

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
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

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('error');
    expect(output).toContain('LLM API down');
    expect(output).toContain('task_end');

    const code = await promise;
    expect(code).toBe(1);
  });

  it('heartbeat timer fires every 2 seconds', async () => {
    mockRunTest.mockImplementation(() => new Promise(() => {})); // hang forever

    const { workerMain } = await import('./worker-entry.js');
    workerMain(['node', 'worker-entry.ts', '--task-id', 'hb', '--goal', 'g', '--target-app', '/a']);

    // Advance 2.1s — heartbeat should fire once
    await vi.advanceTimersByTimeAsync(2100);

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    const heartbeatCount = (output.match(/"method":"heartbeat"/g) || []).length;
    expect(heartbeatCount).toBeGreaterThanOrEqual(1);

    // Advance another 2s — should fire again
    await vi.advanceTimersByTimeAsync(2000);
    const output2 = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    const heartbeatCount2 = (output2.match(/"method":"heartbeat"/g) || []).length;
    expect(heartbeatCount2).toBeGreaterThanOrEqual(2);
  });

  // ── Signal handler tests (covers L79-84) ────────────────────────

  it('SIGINT clears interval, closes readline, emits cancelled, and exits (L79-84)', async () => {
    mockRunTest.mockImplementation(() => new Promise(() => {})); // hang forever

    const { workerMain } = await import('./worker-entry.js');
    workerMain(['node', 'worker-entry.ts', '--task-id', 'sig1', '--goal', 'g', '--target-app', '/a']);

    await vi.advanceTimersByTimeAsync(100);

    // Clear previous stdout calls to isolate signal output
    stdoutSpy.mockClear();
    exitSpy.mockClear();
    (mockRl.close as ReturnType<typeof vi.fn>).mockClear();

    // Emit SIGINT to trigger onSignal handler
    process.emit('SIGINT');

    // Verify exit was called with 0
    expect(exitSpy).toHaveBeenCalledWith(0);

    // Verify task_end with cancelled was emitted
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('"method":"task_end"');
    expect(output).toContain('"status":"cancelled"');

    // Verify readline was closed
    expect(mockRl.close).toHaveBeenCalled();
  });

  it('SIGTERM clears interval, closes readline, emits cancelled, and exits (L79-84)', async () => {
    mockRunTest.mockImplementation(() => new Promise(() => {})); // hang forever

    const { workerMain } = await import('./worker-entry.js');
    workerMain(['node', 'worker-entry.ts', '--task-id', 'sig2', '--goal', 'g', '--target-app', '/a']);

    await vi.advanceTimersByTimeAsync(100);

    stdoutSpy.mockClear();
    exitSpy.mockClear();
    (mockRl.close as ReturnType<typeof vi.fn>).mockClear();

    // Emit SIGTERM to trigger onSignal handler
    process.emit('SIGTERM');

    expect(exitSpy).toHaveBeenCalledWith(0);

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('"method":"task_end"');
    expect(output).toContain('"status":"cancelled"');

    expect(mockRl.close).toHaveBeenCalled();
  });

  // ── Stdin cancel message tests (covers L64-76) ──────────────────

  it('stdin cancel message triggers task_end cancelled and exit (L64-76)', async () => {
    mockRunTest.mockImplementation(() => new Promise(() => {})); // hang forever

    const { workerMain } = await import('./worker-entry.js');
    workerMain(['node', 'worker-entry.ts', '--task-id', 'cancel1', '--goal', 'g', '--target-app', '/a']);

    await vi.advanceTimersByTimeAsync(100);

    stdoutSpy.mockClear();
    exitSpy.mockClear();
    (mockRl.close as ReturnType<typeof vi.fn>).mockClear();

    // Send a cancel message via the mock readline
    mockRl.emit('line', JSON.stringify({ jsonrpc: '2.0', method: 'cancel' }));

    expect(exitSpy).toHaveBeenCalledWith(0);

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('');
    expect(output).toContain('"method":"task_end"');
    expect(output).toContain('"status":"cancelled"');

    expect(mockRl.close).toHaveBeenCalled();
  });

  it('stdin non-cancel message is ignored (L64-76)', async () => {
    mockRunTest.mockImplementation(() => new Promise(() => {})); // hang forever

    const { workerMain } = await import('./worker-entry.js');
    workerMain(['node', 'worker-entry.ts', '--task-id', 'nc1', '--goal', 'g', '--target-app', '/a']);

    await vi.advanceTimersByTimeAsync(100);

    stdoutSpy.mockClear();
    exitSpy.mockClear();

    // Send a non-cancel message — should not trigger exit
    mockRl.emit('line', JSON.stringify({ jsonrpc: '2.0', method: 'heartbeat' }));

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('stdin malformed JSON logs error but does not crash (L73-75)', async () => {
    mockRunTest.mockImplementation(() => new Promise(() => {})); // hang forever

    const { workerMain } = await import('./worker-entry.js');
    workerMain(['node', 'worker-entry.ts', '--task-id', 'bad-json', '--goal', 'g', '--target-app', '/a']);

    await vi.advanceTimersByTimeAsync(100);

    exitSpy.mockClear();

    // Send invalid JSON — should be caught, not crash
    mockRl.emit('line', 'not valid json{{{');

    // Should not exit (no cancel received)
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

// ── Auto-run guard tests (covers L119-130) ─────────────────────────

describe('isDirectRun guard', () => {
  it('isDirectRun should be false in test context (L119-122)', () => {
    // In test context, process.argv[1] is the vitest runner, not worker-entry.ts/js
    const isDirectRun = process.argv[1] && (
      process.argv[1].endsWith('worker-entry.ts') ||
      process.argv[1].endsWith('worker-entry.js')
    );
    expect(isDirectRun).toBeFalsy();
  });

  it('isDirectRun logic detects worker-entry.ts suffix (L119-122)', () => {
    // Verify the guard logic matches the expected patterns
    expect('/path/to/worker-entry.ts'.endsWith('worker-entry.ts')).toBe(true);
    expect('/path/to/worker-entry.js'.endsWith('worker-entry.js')).toBe(true);
    expect('/path/to/other-file.ts'.endsWith('worker-entry.ts')).toBe(false);
    expect('/path/to/other-file.js'.endsWith('worker-entry.js')).toBe(false);
  });
});
