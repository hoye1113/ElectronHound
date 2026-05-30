import { describe, it, expect, beforeEach } from 'vitest';
import { AgentLoop } from '../../packages/agent-core/src/runtime/agentLoop.js';
import { SessionManager } from '../../packages/agent-core/src/session/sessionManager.js';
import { MCPClient } from '../../packages/agent-core/src/mcp/client.js';
import type { LLMProvider } from '../../packages/agent-core/src/llm/types.js';

/**
 * Creates a mock LLM that returns a terminal verdict from verify on the first cycle.
 * Used for pass/fail tests where the verify phase itself produces the terminal verdict.
 */
function createSingleStepLLM(
  verdict: 'pass' | 'fail' | 'retry',
  reportSummary: string,
): LLMProvider {
  let calls = 0;
  return {
    async generateText() {
      calls++;
      // First call = observation, last call = report
      if (calls === 1) return { text: 'Initial observation: app state captured' };
      return { text: reportSummary };
    },
    async generateObject() {
      return {
        object: {
          reasoning: `Verdict reasoning for ${verdict}`,
          action: 'Final action',
          toolName: 'browser_snapshot',
          toolArgs: {},
          expectedOutcome: 'Goal state',
          verdict,
        },
      };
    },
  };
}

/**
 * Creates a mock LLM that always returns the same observation (triggering built-in
 * stuck detection) and 'retry' verdicts so the loop continues until stuck kicks in.
 */
function createStuckLLM(): LLMProvider {
  let generateCalls = 0;
  return {
    async generateText() {
      generateCalls++;
      // All observe calls return the same text; report call returns a summary
      if (generateCalls <= 3) return { text: 'No change detected — same UI state' };
      return { text: 'Agent stuck: built-in stuck detection triggered after repeated identical observations' };
    },
    async generateObject() {
      return {
        object: {
          reasoning: 'Retrying, no progress yet',
          action: 'Retry',
          toolName: 'browser_snapshot',
          toolArgs: {},
          expectedOutcome: 'Some change',
          verdict: 'retry',
        },
      };
    },
  };
}

describe('AgentLoop report phase', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager(':memory:');
  });

  it('generates a valid report structure on pass verdict', async () => {
    const client = new MCPClient();
    await client.connect({});

    const llm = createSingleStepLLM('pass', 'Test passed: Settings button was clicked successfully');
    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager,
      mcpClient: client,
      maxSteps: 5,
      stuckThreshold: 3,
    });

    const result = await loop.run('Click Settings button');

    expect(result.verdict).toBe('pass');
    expect(result.report).toBeDefined();

    const report = result.report!;
    expect(report.goal).toBe('Click Settings button');
    expect(report.verdict).toBe('pass');
    expect(report.reasoning).toContain('pass');
    expect(report.stepCount).toBeGreaterThan(0);
    expect(report.summary).toBe('Test passed: Settings button was clicked successfully');
    expect(report.timestamp).toBeDefined();
    // Validate ISO 8601 timestamp
    expect(new Date(report.timestamp).toISOString()).toBe(report.timestamp);
  });

  it('generates a valid report structure on fail verdict', async () => {
    const client = new MCPClient();
    await client.connect({});

    const llm = createSingleStepLLM('fail', 'Test failed: Could not locate the Settings button');
    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager,
      mcpClient: client,
      maxSteps: 5,
      stuckThreshold: 3,
    });

    const result = await loop.run('Navigate to Settings');

    expect(result.verdict).toBe('fail');
    expect(result.report).toBeDefined();
    expect(result.report!.verdict).toBe('fail');
    expect(result.report!.summary).toContain('Could not locate');
  });

  it('generates a valid report structure on stuck verdict via built-in detection', async () => {
    const client = new MCPClient();
    // Don't connect — MCP calls will fail. The LLM returns the same observation
    // each time and 'retry' verdicts, so built-in stuck detection triggers.
    const llm = createStuckLLM();
    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager,
      mcpClient: client,
      maxSteps: 10,
      stuckThreshold: 3,
    });

    const result = await loop.run('Test stuck scenario');

    expect(result.verdict).toBe('stuck');
    expect(result.report).toBeDefined();
    expect(result.report!.verdict).toBe('stuck');
    // The reasoning comes from the built-in stuck detection in AgentLoop
    expect(result.report!.reasoning).toContain('identical observations');
  });

  it('report is persisted in session entries', async () => {
    const client = new MCPClient();
    await client.connect({});

    const llm = createSingleStepLLM('pass', 'Report persisted test');
    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager,
      mcpClient: client,
      maxSteps: 5,
      stuckThreshold: 3,
    });

    const result = await loop.run('Persist report test');
    const session = sessionManager.getSession(result.sessionId);
    expect(session).not.toBeNull();

    // Find the report entry in session
    const reportEntries = session!.entries.filter(e => {
      try {
        const parsed = JSON.parse(e.content);
        return parsed.goal && parsed.verdict && parsed.summary;
      } catch {
        return false;
      }
    });

    expect(reportEntries.length).toBeGreaterThan(0);
    const reportData = JSON.parse(reportEntries[0].content);
    expect(reportData.goal).toBe('Persist report test');
    expect(reportData.verdict).toBe('pass');
    expect(reportData.summary).toBe('Report persisted test');
  });

  it('multiple runs produce independent reports', async () => {
    const client = new MCPClient();
    await client.connect({});

    // Run 1: pass
    const llm1 = createSingleStepLLM('pass', 'Run 1 passed');
    const loop1 = new AgentLoop({
      llmProvider: llm1,
      sessionManager,
      mcpClient: client,
      maxSteps: 5,
      stuckThreshold: 3,
    });
    const result1 = await loop1.run('Goal A');

    // Run 2: fail
    const llm2 = createSingleStepLLM('fail', 'Run 2 failed');
    const loop2 = new AgentLoop({
      llmProvider: llm2,
      sessionManager,
      mcpClient: client,
      maxSteps: 5,
      stuckThreshold: 3,
    });
    const result2 = await loop2.run('Goal B');

    // Reports should be independent
    expect(result1.verdict).toBe('pass');
    expect(result2.verdict).toBe('fail');
    expect(result1.report!.goal).toBe('Goal A');
    expect(result2.report!.goal).toBe('Goal B');
    expect(result1.report!.summary).toBe('Run 1 passed');
    expect(result2.report!.summary).toBe('Run 2 failed');
    expect(result1.sessionId).not.toBe(result2.sessionId);
  });
});

describe('PatternStore integration in report flow', () => {
  // Pattern write/load/dedup tested at unit level in feedbackLoader.test.ts (savePatterns integration)
  it.skip('writes patterns from report analysis to session entries — covered by feedbackLoader.test.ts', () => {});
  it.skip('deduplicates patterns by errorType + description — covered by feedbackLoader.test.ts', () => {});
  it.skip('caps patterns at 50 for prompt injection — covered by feedbackLoader.test.ts', () => {});
});
