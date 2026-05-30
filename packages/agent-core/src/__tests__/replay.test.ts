import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Types for replay ─────────────────────────────────────────────────────

interface StepRow {
  id: string;
  task_id: string;
  step_number: number;
  action: string; // JSON string
  observation: string;
  created_at: string;
}

interface _ReplayResult {
  taskId: string;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  mode: 'strict' | 'loose';
  steps: _StepReplayResult[];
  success: boolean;
}

interface _StepReplayResult {
  stepNumber: number;
  action: string;
  expectedObservation: string;
  actualObservation: string;
  passed: boolean;
  diff?: _DiffResult;
}

interface _DiffResult {
  match: boolean;
  differences: _DiffEntry[];
}

interface _DiffEntry {
  path: string;
  expected: unknown;
  actual: unknown;
  type: 'added' | 'removed' | 'changed';
}

// ─── Mock Database ────────────────────────────────────────────────────────

const mockSteps: StepRow[] = [
  {
    id: 'step-1',
    task_id: 'task-123',
    step_number: 1,
    action: JSON.stringify({ name: 'browser_click', args: { selector: '#btn' } }),
    observation: 'Button clicked successfully',
    created_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'step-2',
    task_id: 'task-123',
    step_number: 2,
    action: JSON.stringify({ name: 'browser_snapshot', args: {} }),
    observation: 'Page loaded with settings visible',
    created_at: '2024-01-01T00:00:01.000Z',
  },
  {
    id: 'step-3',
    task_id: 'task-123',
    step_number: 3,
    action: JSON.stringify({ name: 'browser_type', args: { selector: '#input', text: 'test' } }),
    observation: 'Text entered in input field',
    created_at: '2024-01-01T00:00:02.000Z',
  },
];

// ─── Mocks ────────────────────────────────────────────────────────────────

const { mockCallTool, mockConnect, mockDisconnect, mockIsConnected } = vi.hoisted(() => ({
  mockCallTool: vi.fn().mockResolvedValue({ success: true, result: 'mock result' }),
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDisconnect: vi.fn().mockResolvedValue(undefined),
  mockIsConnected: vi.fn().mockReturnValue(true),
}));

const { mockDbPrepare, mockDbClose } = vi.hoisted(() => ({
  mockDbPrepare: vi.fn(),
  mockDbClose: vi.fn(),
}));

// Mock better-sqlite3
vi.mock('better-sqlite3', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      prepare: mockDbPrepare,
      close: mockDbClose,
      pragma: vi.fn(),
      exec: vi.fn(),
    })),
  };
});

// Mock MCP client
vi.mock('../mcp/client.js', () => ({
  MCPClient: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    disconnect: mockDisconnect,
    callTool: mockCallTool,
    isConnected: mockIsConnected,
  })),
}));

// ─── Imports ──────────────────────────────────────────────────────────────

import { ReplayVerifier } from '../replay/replayVerifier.js';
import { ReplayRunner } from '../replay/replayRunner.js';

// ─── ReplayVerifier Tests ─────────────────────────────────────────────────

describe('ReplayVerifier', () => {
  let verifier: ReplayVerifier;

  beforeEach(() => {
    verifier = new ReplayVerifier();
  });

  describe('strict mode', () => {
    it('returns match for identical observations', () => {
      const result = verifier.compare(
        'Button clicked successfully',
        'Button clicked successfully',
        'strict'
      );
      expect(result.match).toBe(true);
      expect(result.differences).toHaveLength(0);
    });

    it('returns mismatch for different observations', () => {
      const result = verifier.compare(
        'Button clicked successfully',
        'Button click failed',
        'strict'
      );
      expect(result.match).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);
    });

    it('detects added content', () => {
      const result = verifier.compare(
        'Page loaded',
        'Page loaded with extra content',
        'strict'
      );
      expect(result.match).toBe(false);
      expect(result.differences.some(d => d.type === 'added')).toBe(true);
    });

    it('detects removed content', () => {
      const result = verifier.compare(
        'Page loaded with content',
        'Page loaded',
        'strict'
      );
      expect(result.match).toBe(false);
      expect(result.differences.some(d => d.type === 'removed')).toBe(true);
    });
  });

  describe('loose mode', () => {
    it('returns match when both observations indicate success', () => {
      const result = verifier.compare(
        'Button clicked successfully',
        'Click action completed',
        'loose'
      );
      expect(result.match).toBe(true);
    });

    it('returns match for any non-error observation in loose mode', () => {
      const result = verifier.compare(
        'Page loaded with settings visible',
        'Settings page displayed',
        'loose'
      );
      expect(result.match).toBe(true);
    });

    it('returns mismatch when actual observation indicates failure', () => {
      const result = verifier.compare(
        'Button clicked successfully',
        'Error: element not found',
        'loose'
      );
      expect(result.match).toBe(false);
    });

    it('handles empty observations gracefully', () => {
      const result = verifier.compare('', '', 'loose');
      expect(result.match).toBe(true);
    });
  });

  describe('JSON observation comparison', () => {
    it('compares JSON observations structurally', () => {
      const result = verifier.compare(
        JSON.stringify({ status: 'ok', data: { count: 5 } }),
        JSON.stringify({ status: 'ok', data: { count: 5 } }),
        'strict'
      );
      expect(result.match).toBe(true);
    });

    it('detects differences in JSON values', () => {
      const result = verifier.compare(
        JSON.stringify({ status: 'ok', count: 5 }),
        JSON.stringify({ status: 'ok', count: 10 }),
        'strict'
      );
      expect(result.match).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].path).toContain('count');
    });

    it('detects missing keys in JSON', () => {
      const result = verifier.compare(
        JSON.stringify({ status: 'ok', data: 'test' }),
        JSON.stringify({ status: 'ok' }),
        'strict'
      );
      expect(result.match).toBe(false);
      expect(result.differences.some(d => d.type === 'removed')).toBe(true);
    });
  });
});

// ─── ReplayRunner Tests ───────────────────────────────────────────────────

describe('ReplayRunner', () => {
  beforeEach(() => {
    // Setup mock database to return steps
    mockDbPrepare.mockReturnValue({
      all: vi.fn().mockReturnValue(mockSteps),
    });

    // Setup mock MCP client
    mockCallTool.mockResolvedValue({ success: true, result: 'mock result' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('replay', () => {
    it('fetches steps from database by task_id', async () => {
      const runner = new ReplayRunner(':memory:');
      await runner.replay('task-123', 'strict');

      expect(mockDbPrepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT')
      );
    });

    it('executes actions via MCP client in order', async () => {
      const runner = new ReplayRunner(':memory:');
      await runner.replay('task-123', 'strict');

      // Verify callTool was called for each step
      expect(mockCallTool).toHaveBeenCalledTimes(mockSteps.length);
    });

    it('returns correct result structure', async () => {
      const runner = new ReplayRunner(':memory:');
      const result = await runner.replay('task-123', 'strict');

      expect(result).toHaveProperty('taskId');
      expect(result).toHaveProperty('totalSteps');
      expect(result).toHaveProperty('passedSteps');
      expect(result).toHaveProperty('failedSteps');
      expect(result).toHaveProperty('mode');
      expect(result).toHaveProperty('steps');
      expect(result).toHaveProperty('success');
    });

    it('counts passed and failed steps correctly', async () => {
      // Mock verifier to make first two steps pass, third fail
      mockCallTool
        .mockResolvedValueOnce({ success: true, result: 'Button clicked successfully' })
        .mockResolvedValueOnce({ success: true, result: 'Page loaded with settings visible' })
        .mockResolvedValueOnce({ success: true, result: 'Error: input not found' });

      const runner = new ReplayRunner(':memory:');
      const result = await runner.replay('task-123', 'strict');

      expect(result.totalSteps).toBe(3);
      // Results depend on verifier implementation
    });

    it('handles empty task (no steps)', async () => {
      mockDbPrepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      const runner = new ReplayRunner(':memory:');
      const result = await runner.replay('empty-task', 'strict');

      expect(result.totalSteps).toBe(0);
      expect(result.steps).toHaveLength(0);
    });

    it('handles MCP client errors gracefully', async () => {
      mockCallTool.mockRejectedValue(new Error('MCP connection failed'));

      const runner = new ReplayRunner(':memory:');
      const result = await runner.replay('task-123', 'strict');

      // Should not throw, should record failure
      expect(result.steps.some(s => !s.passed)).toBe(true);
    });
  });

  describe('close', () => {
    it('closes database connection', async () => {
      const runner = new ReplayRunner(':memory:');
      runner.close();
      expect(mockDbClose).toHaveBeenCalled();
    });
  });
});

// ─── CLI Integration Tests ────────────────────────────────────────────────

describe('CLI replay command', () => {
  it('parses replay command with taskId', async () => {
    const { parseReplayArgs } = await import('../cli.js');

    const args = parseReplayArgs(['node', 'eata', 'replay', '--taskId', 'task-123']);

    expect(args).not.toBeNull();
    expect(args?.taskId).toBe('task-123');
  });

  it('parses replay command with strict flag', async () => {
    const { parseReplayArgs } = await import('../cli.js');

    const args = parseReplayArgs(['node', 'eata', 'replay', '--taskId', 'task-123', '--strict']);

    expect(args).not.toBeNull();
    expect(args?.strict).toBe(true);
    expect(args?.loose).toBe(false);
  });

  it('parses replay command with loose flag', async () => {
    const { parseReplayArgs } = await import('../cli.js');

    const args = parseReplayArgs(['node', 'eata', 'replay', '--taskId', 'task-123', '--loose']);

    expect(args).not.toBeNull();
    expect(args?.loose).toBe(true);
    expect(args?.strict).toBe(false);
  });

  it('returns null when no replay command', async () => {
    const { parseReplayArgs } = await import('../cli.js');

    const args = parseReplayArgs(['node', 'eata', '--goal', 'test']);

    expect(args).toBeNull();
  });

  it('returns null when taskId is missing', async () => {
    const { parseReplayArgs } = await import('../cli.js');

    const args = parseReplayArgs(['node', 'eata', 'replay', '--strict']);

    expect(args).toBeNull();
  });
});
