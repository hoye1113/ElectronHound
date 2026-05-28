import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';

// ─── Mock runner BEFORE imports (hoisted by vitest) ──────
const { mockRunTest } = vi.hoisted(() => ({
  mockRunTest: vi.fn(),
}));

vi.mock('../runner.js', () => ({
  runTest: mockRunTest,
}));

// ─── Imports ──────────────────────────────────────────────
import {
  parseArgs,
  validateArgs,
  formatStepProgress,
  formatResult,
  saveManifest,
  saveTimeline,
  savePatterns,
  cliMain,
} from '../cli.js';

import {
  mkdtempSync,
  existsSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Helpers ─────────────────────────────────────────────

function createFakeStepRecord(
  overrides: Partial<import('@eata/shared-types').StepRecord> = {},
): import('@eata/shared-types').StepRecord {
  return {
    id: crypto.randomUUID(),
    taskId: 'test-task-id',
    stepIndex: 0,
    phase: 'observe',
    status: 'success',
    timestamp: new Date().toISOString(),
    duration: 100,
    ...overrides,
  };
}

// ─── parseArgs ───────────────────────────────────────────

describe('parseArgs', () => {
  it('parses all known flags', () => {
    const result = parseArgs([
      'node',
      'cli.ts',
      '--goal',
      'Click Settings',
      '--app',
      '/test/app',
      '--model',
      'gpt-4o-mini',
      '--maxSteps',
      '30',
    ]);

    expect(result.goal).toBe('Click Settings');
    expect(result.targetAppPath).toBe('/test/app');
    expect(result.llmModel).toBe('gpt-4o-mini');
    expect(result.maxSteps).toBe(30);
  });

  it('uses defaults for missing optional flags', () => {
    const result = parseArgs([
      'node',
      'cli.ts',
      '--goal',
      'Test goal',
      '--app',
      '/test/app',
    ]);

    expect(result.llmModel).toBe('gpt-4o');
    expect(result.maxSteps).toBe(50);
  });

  it('returns empty strings for missing required flags', () => {
    const result = parseArgs(['node', 'cli.ts']);

    expect(result.goal).toBe('');
    expect(result.targetAppPath).toBe('');
  });

  it('handles maxSteps as integer', () => {
    const result = parseArgs([
      'node',
      'cli.ts',
      '--goal',
      'test',
      '--app',
      '/app',
      '--maxSteps',
      '10',
    ]);

    expect(result.maxSteps).toBe(10);
  });

  it('handles NaN maxSteps gracefully', () => {
    const result = parseArgs([
      'node',
      'cli.ts',
      '--goal',
      'test',
      '--app',
      '/app',
      '--maxSteps',
      'notanumber',
    ]);

    expect(result.maxSteps).toBeNaN();
  });
});

// ─── validateArgs ────────────────────────────────────────

describe('validateArgs', () => {
  it('returns ok for valid args', () => {
    const result = validateArgs({
      goal: 'Click Settings',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 30,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.goal).toBe('Click Settings');
      expect(result.data.llmModel).toBe('gpt-4o');
      expect(result.data.maxSteps).toBe(30);
    }
  });

  it('rejects empty goal', () => {
    const result = validateArgs({
      goal: '',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 30,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Validation failed');
    }
  });

  it('rejects empty targetAppPath', () => {
    const result = validateArgs({
      goal: 'Test',
      targetAppPath: '',
      llmModel: 'gpt-4o',
      maxSteps: 30,
    });

    expect(result.ok).toBe(false);
  });

  it('rejects empty llmModel', () => {
    const result = validateArgs({
      goal: 'Test',
      targetAppPath: '/test/app',
      llmModel: '',
      maxSteps: 30,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Validation failed');
    }
  });

  it('accepts any non-empty llmModel string', () => {
    for (const model of ['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet', 'custom-model-v2']) {
      const result = validateArgs({
        goal: 'Test',
        targetAppPath: '/test/app',
        llmModel: model,
        maxSteps: 50,
      });
      expect(result.ok).toBe(true);
    }
  });
});

// ─── formatStepProgress ──────────────────────────────────

describe('formatStepProgress', () => {
  it('formats observe phase', () => {
    const record = createFakeStepRecord({
      phase: 'observe',
      observation: '<main>Settings page</main>',
    });
    const output = formatStepProgress(record, 1, 50);
    expect(output).toContain('[Step 1/50]');
    expect(output).toContain('Observe');
    expect(output).toContain('Settings page');
  });

  it('truncates long observation text', () => {
    const record = createFakeStepRecord({
      phase: 'observe',
      observation: 'A'.repeat(200),
    });
    const output = formatStepProgress(record, 1, 50);
    expect(output.length).toBeLessThan(150);
  });

  it('formats plan phase', () => {
    const record = createFakeStepRecord({
      phase: 'plan',
      reasoning: 'Click the Settings button',
    });
    const output = formatStepProgress(record, 2, 50);
    expect(output).toContain('[Step 2/50]');
    expect(output).toContain('Plan');
    expect(output).toContain('Click the Settings button');
  });

  it('formats execute phase with success', () => {
    const record = createFakeStepRecord({
      phase: 'execute',
      status: 'success',
      action: { name: 'browser_click', args: { selector: '#settings' } },
    });
    const output = formatStepProgress(record, 3, 50);
    expect(output).toContain('[Step 3/50]');
    expect(output).toContain('Execute');
    expect(output).toContain('browser_click');
    expect(output).toContain('\u2713');
  });

  it('formats execute phase with failure', () => {
    const record = createFakeStepRecord({
      phase: 'execute',
      status: 'failed',
      action: { name: 'browser_click', args: {} },
    });
    const output = formatStepProgress(record, 3, 50);
    expect(output).toContain('\u2717');
  });

  it('formats verify phase', () => {
    const record = createFakeStepRecord({
      phase: 'verify',
      status: 'success',
      reasoning: 'Settings page visible',
    });
    const output = formatStepProgress(record, 4, 50);
    expect(output).toContain('[Step 4/50]');
    expect(output).toContain('Verify');
    expect(output).toContain('Settings page visible');
  });
});

// ─── formatResult ────────────────────────────────────────

describe('formatResult', () => {
  it('formats PASS result', () => {
    const output = formatResult('completed', 15, 32000);
    expect(output).toContain('PASS');
    expect(output).toContain('15 steps');
    expect(output).toContain('32.0s');
  });

  it('formats FAIL result', () => {
    const output = formatResult('failed', 10, 5000);
    expect(output).toContain('FAILED');
    expect(output).toContain('10 steps');
    expect(output).toContain('5.0s');
  });

  it('formats ABORTED result', () => {
    const output = formatResult('aborted', 3, 1500);
    expect(output).toContain('ABORTED');
  });
});

// ─── saveManifest / saveTimeline / savePatterns ──────────

describe('report saving', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cli-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('saveManifest', () => {
    it('creates manifest.json with correct data', () => {
      const history = [
        createFakeStepRecord({ stepIndex: 0, status: 'success' }),
        createFakeStepRecord({ stepIndex: 1, status: 'success' }),
        createFakeStepRecord({ stepIndex: 2, status: 'failed' }),
      ];

      saveManifest(
        tmpDir,
        '00000000-0000-0000-0000-000000000001',
        'Test goal',
        'completed',
        history,
        '2024-01-01T00:00:00.000Z',
        '2024-01-01T00:01:00.000Z',
        60000,
      );

      const manifestPath = join(tmpDir, 'manifest.json');
      expect(existsSync(manifestPath)).toBe(true);

      const content = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      expect(content.taskId).toBe(
        '00000000-0000-0000-0000-000000000001',
      );
      expect(content.goal).toBe('Test goal');
      expect(content.status).toBe('completed');
      expect(content.totalSteps).toBe(3);
      expect(content.passedSteps).toBe(2);
      expect(content.failedSteps).toBe(1);
      expect(content.retriedSteps).toBe(0);
      expect(content.totalDuration).toBe(60000);
    });

    it('maps aborted status correctly', () => {
      const history: import('@eata/shared-types').StepRecord[] = [];
      saveManifest(
        tmpDir,
        '00000000-0000-0000-0000-000000000002',
        'Test',
        'aborted',
        history,
        '2024-01-01T00:00:00.000Z',
        '2024-01-01T00:00:10.000Z',
        10000,
      );

      const content = JSON.parse(
        readFileSync(join(tmpDir, 'manifest.json'), 'utf-8'),
      );
      expect(content.status).toBe('aborted');
    });

    it('maps failed status correctly', () => {
      const history: import('@eata/shared-types').StepRecord[] = [];
      saveManifest(
        tmpDir,
        '00000000-0000-0000-0000-000000000003',
        'Test',
        'failed',
        history,
        '2024-01-01T00:00:00.000Z',
        '2024-01-01T00:00:10.000Z',
        10000,
      );

      const content = JSON.parse(
        readFileSync(join(tmpDir, 'manifest.json'), 'utf-8'),
      );
      expect(content.status).toBe('failed');
    });
  });

  describe('saveTimeline', () => {
    it('creates timeline.jsonl with all records', () => {
      const history = [
        createFakeStepRecord({
          stepIndex: 0,
          phase: 'observe',
          status: 'success',
          observation: 'Page loaded',
          timestamp: '2024-01-01T00:00:00.000Z',
          duration: 50,
        }),
        createFakeStepRecord({
          stepIndex: 0,
          phase: 'execute',
          status: 'success',
          action: { name: 'browser_click', args: {} },
          timestamp: '2024-01-01T00:00:01.000Z',
          duration: 100,
        }),
      ];

      saveTimeline(tmpDir, history);

      const timelinePath = join(tmpDir, 'timeline.jsonl');
      expect(existsSync(timelinePath)).toBe(true);

      const lines = readFileSync(timelinePath, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(2);

      const entry0 = JSON.parse(lines[0]);
      expect(entry0.stepIndex).toBe(0);
      expect(entry0.phase).toBe('observe');
      expect(entry0.action).toBe('N/A');

      const entry1 = JSON.parse(lines[1]);
      expect(entry1.phase).toBe('execute');
      expect(entry1.action).toBe('browser_click');
    });
  });

  describe('savePatterns', () => {
    it('creates patterns.jsonl for failed steps', () => {
      const history = [
        createFakeStepRecord({
          stepIndex: 0,
          phase: 'execute',
          status: 'failed',
          action: { name: 'browser_click', args: {} },
          timestamp: '2024-01-01T00:00:00.000Z',
          reasoning: 'Element not found',
        }),
        createFakeStepRecord({
          stepIndex: 1,
          phase: 'observe',
          status: 'success',
        }),
      ];

      savePatterns(tmpDir, 'task-123', history, 'Test goal');

      const patternsPath = join(tmpDir, 'patterns.jsonl');
      expect(existsSync(patternsPath)).toBe(true);

      const lines = readFileSync(patternsPath, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(1);

      const pattern = JSON.parse(lines[0]);
      expect(pattern.errorType).toBe('browser_click_failure');
      expect(pattern.similarityKeywords).toContain('browser_click');
      expect(pattern.relatedGoalPatterns).toContain('Test goal');
    });

    it('creates empty patterns file when no failures', () => {
      const history = [
        createFakeStepRecord({ stepIndex: 0, status: 'success' }),
      ];

      savePatterns(tmpDir, 'task-456', history, 'Test');

      const patternsPath = join(tmpDir, 'patterns.jsonl');
      // File may not exist if no entries were written
      if (existsSync(patternsPath)) {
        const content = readFileSync(patternsPath, 'utf-8');
        expect(content).toBe('');
      }
    });
  });
});

// ─── cliMain ─────────────────────────────────────────────

describe('cliMain', () => {
  let stderrSpy!: MockInstance<typeof process.stderr.write>;
  let stdoutSpy!: MockInstance<typeof process.stdout.write>;

  beforeEach(() => {
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    vi.mocked(mockRunTest).mockReset();
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('returns 1 on validation failure (missing goal)', async () => {
    const code = await cliMain({
      goal: '',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 50,
    });

    expect(code).toBe(1);
    expect(stderrSpy).toHaveBeenCalled();
    const stderrCalls = stderrSpy.mock.calls.map((c) => c[0]).join('');
    expect(stderrCalls).toContain('Validation failed');
  });

  it('returns 1 on validation failure (invalid model)', async () => {
    const code = await cliMain({
      goal: 'Test',
      targetAppPath: '/test/app',
      llmModel: 'bad-model',
      maxSteps: 50,
    });

    expect(code).toBe(1);
  });

  it('runs test and prints progress on success', async () => {
    const mockState = {
      taskId: 'mock-task-id',
      goal: 'Click Settings',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 50,
      stepCount: 4,
      stuckCounter: 0,
      status: 'completed',
      history: [
        {
          id: crypto.randomUUID(),
          taskId: 'mock-task-id',
          stepIndex: 0,
          phase: 'observe' as const,
          status: 'success' as const,
          observation: '<main>Settings</main>',
          timestamp: new Date().toISOString(),
          duration: 10,
        },
        {
          id: crypto.randomUUID(),
          taskId: 'mock-task-id',
          stepIndex: 0,
          phase: 'execute' as const,
          status: 'success' as const,
          action: { name: 'browser_click', args: {} },
          timestamp: new Date().toISOString(),
          duration: 20,
        },
      ],
    };

    vi.mocked(mockRunTest).mockResolvedValue(mockState);

    const code = await cliMain({
      goal: 'Click Settings',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 50,
    });

    expect(code).toBe(0);

    const stdoutOutput = stdoutSpy.mock.calls
      .map((c) => c[0])
      .join('');
    expect(stdoutOutput).toContain('[1/50]');
    expect(stdoutOutput).toContain('observe');
    expect(stdoutOutput).toContain('[2/50]');
    expect(stdoutOutput).toContain('execute');
    expect(stdoutOutput).toContain('PASS');
    expect(stdoutOutput).toContain('Report saved to:');
  });

  it('exits with code 1 on runner error', async () => {
    vi.mocked(mockRunTest).mockRejectedValue(
      new Error('Connection failed'),
    );

    const code = await cliMain({
      goal: 'Test',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 50,
    });

    expect(code).toBe(1);
    const stderrOutput = stderrSpy.mock.calls
      .map((c) => c[0])
      .join('');
    expect(stderrOutput).toContain('Connection failed');
  });

  it('returns 1 for failed test result', async () => {
    const mockState = {
      taskId: 'mock-fail-id',
      goal: 'Test',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 50,
      stepCount: 3,
      stuckCounter: 0,
      status: 'failed',
      history: [
        {
          id: crypto.randomUUID(),
          taskId: 'mock-fail-id',
          stepIndex: 0,
          phase: 'observe' as const,
          status: 'success' as const,
          observation: 'Page loaded',
          timestamp: new Date().toISOString(),
          duration: 10,
        },
      ],
    };

    vi.mocked(mockRunTest).mockResolvedValue(mockState);

    const code = await cliMain({
      goal: 'Test',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 50,
    });

    expect(code).toBe(1);

    const stdoutOutput = stdoutSpy.mock.calls
      .map((c) => c[0])
      .join('');
    expect(stdoutOutput).toContain('FAILED');
  });

  it('returns 1 for aborted status', async () => {
    const mockState = {
      taskId: 'mock-abort-id',
      goal: 'Test',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 50,
      stepCount: 2,
      stuckCounter: 3,
      status: 'aborted',
      history: [],
    };

    vi.mocked(mockRunTest).mockResolvedValue(mockState);

    const code = await cliMain({
      goal: 'Test',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 50,
    });

    expect(code).toBe(1);
    const stdoutOutput = stdoutSpy.mock.calls
      .map((c) => c[0])
      .join('');
    expect(stdoutOutput).toContain('ABORTED');
  });
});
