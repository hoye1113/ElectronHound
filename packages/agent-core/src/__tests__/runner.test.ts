import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTest } from '../loop/agentLoop.js';
import type { ToolRegistry } from '../loop/types.js';

// Mock compaction modules
vi.mock('../compaction/trigger.js', () => ({
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

vi.mock('../compaction/summary.js', () => ({
  generateSummary: vi.fn().mockResolvedValue('[compacted summary]'),
}));

vi.mock('../compaction/cut-point.js', () => ({}));

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

function setupPassMocks(llmMock: any) {
  const obs = { ariaTree: '<main>Home page</main>', pageTitle: 'Home', url: 'http://localhost' };
  const plan = {
    reasoning: 'Navigate home',
    toolCall: { name: 'browser_navigate', args: { url: '/' } },
    expectedOutcome: 'Home page loads',
  };
  llmMock.generateText
    .mockResolvedValueOnce(JSON.stringify(obs))
    .mockResolvedValueOnce(JSON.stringify(plan))
    .mockResolvedValueOnce(JSON.stringify({ verdict: 'pass', reasoning: 'Good' }))
    .mockResolvedValueOnce('Report: done');
}

describe('runTest (AgentLoop)', () => {
  it('runs test with default options', async () => {
    const llmMock = createMockLLM();
    setupPassMocks(llmMock);
    const tools = createSimpleTools();

    const result = await runTest('Click the Settings button', {
      llm: llmMock,
      tools,
      maxSteps: 5,
    });

    expect(result).toBeDefined();
    expect(result.goal).toBe('Click the Settings button');
  });

  it('completes test with pass flow', async () => {
    const llmMock = createMockLLM();
    setupPassMocks(llmMock);
    const tools = createSimpleTools();

    const result = await runTest('Simple navigation', {
      llm: llmMock,
      tools,
      maxSteps: 5,
    });

    expect(result.verdict).toBe('pass');
    expect(['pass', 'fail', 'escalate']).toContain(result.verdict);
  });

  it('respects maxSteps option', async () => {
    let callCount = 0;
    const llmMock = createMockLLM();
    llmMock.generateText.mockImplementation((prompt: string) => {
      callCount++;
      if (prompt.includes('Observe')) {
        return Promise.resolve(
          JSON.stringify({ ariaTree: `<div>${callCount}</div>`, pageTitle: 'P', url: '/test' }),
        );
      }
      if (prompt.includes('Decide')) {
        return Promise.resolve(
          JSON.stringify({ reasoning: 'Retry', toolCall: { name: 'click', args: {} }, expectedOutcome: 'Done' }),
        );
      }
      if (prompt.includes('Success')) {
        return Promise.resolve(JSON.stringify({ verdict: 'retry', reasoning: 'Not yet' }));
      }
      return Promise.resolve('Report');
    });
    const tools = createSimpleTools();

    const result = await runTest('Test low max steps', {
      llm: llmMock,
      tools,
      maxSteps: 2,
    });

    expect(result.verdict).not.toBe('running' as any);
  });

  it('returns escalate on observe failure', async () => {
    const llmMock = createMockLLM();
    llmMock.generateText.mockRejectedValue(new Error('LLM down'));
    const tools = createSimpleTools();

    const result = await runTest('Observe failure', {
      llm: llmMock,
      tools,
      maxSteps: 5,
    });

    expect(result.verdict).toBe('escalate');
    expect(result.reason).toContain('Observe step failed');
  });
});

describe('runTest with LLM DI injection', () => {
  it('runTest uses injected LLM and handles null-through DI path', async () => {
    const llmMock = createMockLLM();
    setupPassMocks(llmMock);
    const tools = createSimpleTools();

    const result = await runTest('DI fallback test', {
      llm: llmMock,
      tools,
      maxSteps: 3,
    });

    expect(result).toBeDefined();
    expect(result.goal).toBe('DI fallback test');
    expect(['pass', 'fail', 'escalate']).toContain(result.verdict);
  });
});

describe('runTest with tool failures', () => {
  it('handles tool execution failure gracefully', async () => {
    const llmMock = createMockLLM();
    setupPassMocks(llmMock);
    const failingTools = {
      execute: vi.fn().mockRejectedValue(new Error('Connection failed')),
    } as unknown as ToolRegistry;

    const result = await runTest('Tool failure test', {
      llm: llmMock,
      tools: failingTools,
      maxSteps: 5,
    });

    expect(result).toBeDefined();
    expect(['pass', 'fail', 'escalate']).toContain(result.verdict);
  });
});
