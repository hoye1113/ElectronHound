import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLoop, runTest } from '../agentLoop.js';
import type { AgentLoopOptions, ToolRegistry } from '../types.js';

// Mock compaction modules used by agentLoop
vi.mock('../../compaction/trigger.js', () => ({
  shouldTriggerCompaction: vi.fn(() => false),
  estimateTokens: vi.fn(() => 0),
  createCompactionTrigger: vi.fn(),
  COMPACTION_DEFAULTS: {
    contextWindow: 128000,
    reserveTokens: 16384,
    keepRecentTokens: 20000,
    thresholdPercentage: 0.8,
    toolResultMaxChars: 2000,
  },
}));

vi.mock('../../compaction/summary.js', () => ({
  generateSummary: vi.fn().mockResolvedValue('[compacted summary]'),
}));

vi.mock('../../compaction/cut-point.js', () => ({}));

// ── Test helpers ───────────────────────────────────────────────────────

function createMockLLM() {
  return {
    name: 'test-llm',
    model: 'test-model',
    generateText: vi.fn(),
    generateObject: vi.fn(),
    streamText: vi.fn(),
  } as any;
}

function createSimpleTools(): ToolRegistry {
  return {
    execute: vi.fn().mockResolvedValue({ clicked: true }),
  } as unknown as ToolRegistry;
}

function createLoop(llmMock: any, tools: ToolRegistry, opts?: Partial<AgentLoopOptions>) {
  return new AgentLoop({
    llm: llmMock,
    tools,
    maxSteps: 10,
    ...opts,
  });
}

// ── LLM mock builder ──────────────────────────────────────────────────

function setupPassMocks(llmMock: any, obs: any, plan: any, report?: string) {
  llmMock.generateText
    .mockResolvedValueOnce(JSON.stringify(obs))
    .mockResolvedValueOnce(JSON.stringify(plan))
    .mockResolvedValueOnce(JSON.stringify({ verdict: 'pass', reasoning: 'Success' }))
    .mockResolvedValueOnce(report ?? 'Report: done');
}

function setupFailMocks(llmMock: any, obs: any, plan: any, reasoning: string) {
  llmMock.generateText
    .mockResolvedValueOnce(JSON.stringify(obs))
    .mockResolvedValueOnce(JSON.stringify(plan))
    .mockResolvedValueOnce(JSON.stringify({ verdict: 'fail', reasoning }))
    .mockResolvedValueOnce('Report: failed');
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('AgentLoop', () => {
  let llmMock: ReturnType<typeof createMockLLM>;
  let tools: ToolRegistry;

  beforeEach(() => {
    llmMock = createMockLLM();
    tools = createSimpleTools();
    vi.clearAllMocks();
  });

  // ── Full cycle tests ─────────────────────────────────────────────────

  describe('complete observe → plan → execute → verify → report cycle', () => {
    const obs = { ariaTree: '<div>Home</div>', pageTitle: 'Home', url: 'http://test.local' };
    const plan = {
      reasoning: 'Click login',
      toolCall: { name: 'click', args: { selector: '#login' } },
      expectedOutcome: 'Login page opens',
    };

    it('runs full cycle and returns pass verdict', async () => {
      setupPassMocks(llmMock, obs, plan, 'Test passed: login clicked');

      const loop = createLoop(llmMock, tools);
      const result = await loop.run('Test login flow');

      expect(result.goal).toBe('Test login flow');
      expect(result.verdict).toBe('pass');
      expect(result.reason).toContain('Success');
      expect(result.steps).toHaveLength(4); // observe, plan, execute, verify
    });

    it('runs full cycle and returns fail verdict', async () => {
      setupFailMocks(llmMock, obs, plan, 'An error occurred');

      const loop = createLoop(llmMock, tools);
      const result = await loop.run('Test error handling');

      expect(result.verdict).toBe('fail');
      expect(result.reason).toContain('error occurred');
      expect(result.steps).toHaveLength(4);
    });

    it('returns escalate verdict when verify requests escalation', async () => {
      llmMock.generateText
        .mockResolvedValueOnce(JSON.stringify(obs))
        .mockResolvedValueOnce(JSON.stringify(plan))
        .mockResolvedValueOnce(
          JSON.stringify({ verdict: 'escalate', reasoning: 'Needs human intervention' }),
        )
        .mockResolvedValueOnce('Report: escalated');

      const loop = createLoop(llmMock, tools);
      const result = await loop.run('Complex test');

      expect(result.verdict).toBe('escalate');
      expect(result.reason).toContain('human intervention');
      expect(result.steps).toHaveLength(4);
    });
  });

  // ── Stuck detection ──────────────────────────────────────────────────

  describe('stuck detection (3 identical observations)', () => {
    it('escalates after 3 identical observations', async () => {
      const sameObs = JSON.stringify({
        ariaTree: '<div>stuck</div>',
        pageTitle: 'Stuck',
        url: 'http://test.local',
      });
      const planResponse = JSON.stringify({
        reasoning: 'Retry',
        toolCall: { name: 'click', args: { selector: '#btn' } },
        expectedOutcome: 'Changes',
      });
      const retryResponse = JSON.stringify({ verdict: 'retry', reasoning: 'Keep trying' });

      llmMock.generateText.mockImplementation((prompt: string) => {
        if (prompt.includes('Observe the current state')) return Promise.resolve(sameObs);
        if (prompt.includes('Decide the next action')) return Promise.resolve(planResponse);
        if (prompt.includes('Success:')) return Promise.resolve(retryResponse);
        return Promise.resolve('Report: stuck');
      });

      const loop = createLoop(llmMock, tools, { maxSteps: 10 });
      const result = await loop.run('Stuck test');

      expect(result.verdict).toBe('escalate');
      expect(result.reason).toContain('Stuck detected');
      // 3 iterations × 4 phases (observe + plan + execute + verify) = 12 steps
      expect(result.steps).toHaveLength(12);
    });

    it('does not escalate with varied observations', async () => {
      setupPassMocks(
        llmMock,
        { ariaTree: '<div>1</div>', pageTitle: 'P1', url: '/1' },
        { reasoning: 'Go', toolCall: { name: 'click', args: {} }, expectedOutcome: 'Done' },
      );

      const loop = createLoop(llmMock, tools, { maxSteps: 10 });
      const result = await loop.run('Varied observations');

      expect(result.verdict).toBe('pass');
    });
  });

  // ── Compaction integration ───────────────────────────────────────────

  describe('compaction integration', () => {
    it('triggers compaction when context exceeds threshold', async () => {
      const { shouldTriggerCompaction } = await import('../../compaction/trigger.js');
      const { generateSummary } = await import('../../compaction/summary.js');

      // Make compaction trigger on first check
      (shouldTriggerCompaction as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);

      setupPassMocks(
        llmMock,
        { ariaTree: '<div>App</div>', pageTitle: 'App', url: '/app' },
        { reasoning: 'Action', toolCall: { name: 'click', args: {} }, expectedOutcome: 'Done' },
      );

      const loop = createLoop(llmMock, tools, {
        compaction: { contextWindow: 1000, reserveTokens: 100, enabled: true },
      });
      const result = await loop.run('Compaction test');

      expect(generateSummary).toHaveBeenCalled();
      expect(result.verdict).toBe('pass');
    });

    it('skips compaction when disabled', async () => {
      const { shouldTriggerCompaction } = await import('../../compaction/trigger.js');
      const { generateSummary } = await import('../../compaction/summary.js');

      setupPassMocks(
        llmMock,
        { ariaTree: '<div>X</div>', pageTitle: 'X', url: '/x' },
        { reasoning: 'Do', toolCall: { name: 'click', args: {} }, expectedOutcome: 'OK' },
      );

      const loop = createLoop(llmMock, tools, {
        compaction: { contextWindow: 100, enabled: false },
      });
      const result = await loop.run('No compaction');

      // shouldTriggerCompaction should NOT have been called (disabled check runs first)
      expect(shouldTriggerCompaction).not.toHaveBeenCalled();
      expect(result.verdict).toBe('pass');
    });
  });

  // ── Error handling ───────────────────────────────────────────────────

  describe('error handling (tool execution failure)', () => {
    it('handles tool execution failure gracefully', async () => {
      const failingTools = {
        execute: vi.fn().mockRejectedValue(new Error('Tool crashed')),
      } as unknown as ToolRegistry;

      setupPassMocks(
        llmMock,
        { ariaTree: '<div>App</div>', pageTitle: 'App', url: '/app' },
        { reasoning: 'Click it', toolCall: { name: 'click', args: {} }, expectedOutcome: 'Works' },
      );

      const loop = createLoop(llmMock, failingTools);
      const result = await loop.run('Tool failure test');

      // Tool failure → execute returns {success:false} → verify still runs → 4 steps
      expect(result.steps).toHaveLength(4);
    });

    it('records failed tool execution in steps', async () => {
      const failingTools = {
        execute: vi.fn().mockRejectedValue(new Error('Connection timeout')),
      } as unknown as ToolRegistry;

      setupPassMocks(
        llmMock,
        { ariaTree: '<div>X</div>', pageTitle: 'X', url: '/x' },
        { reasoning: 'Try', toolCall: { name: 'type', args: { text: 'hello' } }, expectedOutcome: 'Typed' },
      );

      const loop = createLoop(llmMock, failingTools, { maxSteps: 5 });
      const result = await loop.run('Timeout test');

      // Steps: observe, plan, execute (failed), verify = 4 total
      expect(result.steps).toHaveLength(4);
      // Check that the execute step recorded the failure
      const executeStep = result.steps.find((s) => s.phase === 'execute');
      expect(executeStep).toBeDefined();
      expect(executeStep?.status).toBe('failed');
    });
  });

  // ── Max steps limit ──────────────────────────────────────────────────

  describe('maxSteps limit', () => {
    it('fails when maxSteps exceeded with continuing retry verdicts', async () => {
      let callCount = 0;
      llmMock.generateText.mockImplementation((prompt: string) => {
        callCount++;
        if (prompt.includes('Observe the current state')) {
          return Promise.resolve(
            JSON.stringify({ ariaTree: `<div>iter${callCount}</div>`, pageTitle: `P${callCount}`, url: '/test' }),
          );
        }
        if (prompt.includes('Decide the next action')) {
          return Promise.resolve(
            JSON.stringify({ reasoning: 'Retry', toolCall: { name: 'click', args: {} }, expectedOutcome: 'Done' }),
          );
        }
        if (prompt.includes('Success:')) {
          return Promise.resolve(
            JSON.stringify({ verdict: 'retry', reasoning: 'Not yet' }),
          );
        }
        return Promise.resolve('Report: maxSteps exceeded');
      });

      const loop = createLoop(llmMock, tools, { maxSteps: 3 });
      const result = await loop.run('Max steps test');

      expect(result.verdict).toBe('fail');
      expect(result.reason).toContain('maxSteps');
    });

    it('respects custom maxSteps option', async () => {
      let callCount = 0;
      llmMock.generateText.mockImplementation((prompt: string) => {
        callCount++;
        if (prompt.includes('Observe the current state')) {
          return Promise.resolve(
            JSON.stringify({ ariaTree: `<div>${callCount}</div>`, pageTitle: 'T', url: '/t' }),
          );
        }
        if (prompt.includes('Decide the next action')) {
          return Promise.resolve(
            JSON.stringify({ reasoning: 'Act', toolCall: { name: 'click', args: {} }, expectedOutcome: 'OK' }),
          );
        }
        if (prompt.includes('Success:')) {
          return Promise.resolve(
            JSON.stringify({ verdict: 'retry', reasoning: 'Retry' }),
          );
        }
        return Promise.resolve('Report: done');
      });

      const loop = createLoop(llmMock, tools, { maxSteps: 2 });
      const result = await loop.run('Small maxSteps');

      expect(result.verdict).toBe('fail');
      expect(result.reason).toContain('maxSteps');
    });
  });

  // ── JSON parsing resilience ──────────────────────────────────────────

  describe('JSON parsing resilience', () => {
    it('handles invalid JSON in plan response', async () => {
      llmMock.generateText
        .mockResolvedValueOnce(
          JSON.stringify({ ariaTree: '<div>A</div>', pageTitle: 'A', url: '/a' }),
        )
        .mockResolvedValueOnce('This is NOT valid JSON at all');

      const loop = createLoop(llmMock, tools);
      const result = await loop.run('Bad plan JSON');

      // Plan fails → escalate immediately
      expect(result.verdict).toBe('escalate');
      expect(result.reason).toContain('Plan step failed');
      // observe step recorded before plan fails
      expect(result.steps).toHaveLength(1);
    });

    it('handles invalid JSON in verify response', async () => {
      llmMock.generateText
        .mockResolvedValueOnce(
          JSON.stringify({ ariaTree: '<div>B</div>', pageTitle: 'B', url: '/b' }),
        )
        .mockResolvedValueOnce(
          JSON.stringify({ reasoning: 'Go', toolCall: { name: 'click', args: {} }, expectedOutcome: 'OK' }),
        )
        .mockResolvedValueOnce('INVALID VERDICT JSON');

      const loop = createLoop(llmMock, tools);
      const result = await loop.run('Bad verify JSON');

      expect(result.verdict).toBe('escalate');
      expect(result.reason).toContain('Verify step failed');
      // observe + plan + execute = 3 steps before verify fails
      expect(result.steps).toHaveLength(3);
    });
  });
});

// ── runTest entry function ─────────────────────────────────────────────

describe('runTest', () => {
  it('creates AgentLoop and runs it', async () => {
    const llmMock = createMockLLM();
    setupPassMocks(
      llmMock,
      { ariaTree: '<div>R</div>', pageTitle: 'R', url: '/r' },
      { reasoning: 'Run', toolCall: { name: 'click', args: {} }, expectedOutcome: 'Done' },
    );

    const tools = createSimpleTools();
    const result = await runTest('runTest goal', {
      llm: llmMock,
      tools,
      maxSteps: 10,
    });

    expect(result.goal).toBe('runTest goal');
    expect(result.verdict).toBe('pass');
    expect(result.steps).toHaveLength(4);
  });
});
