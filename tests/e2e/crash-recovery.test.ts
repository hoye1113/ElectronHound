import { describe, it, expect, beforeEach } from 'vitest';
import { AgentLoop } from '../../packages/agent-core/src/runtime/agentLoop.js';
import { SessionManager } from '../../packages/agent-core/src/session/sessionManager.js';
import { MCPClient } from '../../packages/agent-core/src/mcp/client.js';
import type { LLMProvider } from '../../packages/agent-core/src/llm/types.js';

/**
 * Creates a mock LLM provider that always returns the given observation.
 * Useful for simulating a stuck agent (e.g., MCP disconnected -> same observation each cycle).
 */
function createStaticLLM(observationText: string): LLMProvider {
  return {
    async generateText() {
      return { text: observationText };
    },
    async generateObject() {
      return {
        object: {
          reasoning: 'Test reasoning',
          action: 'Test action',
          toolName: 'browser_snapshot',
          toolArgs: {},
          expectedOutcome: 'See the page',
        },
      };
    },
  };
}

/**
 * Creates a mock LLM provider that returns different observations on each call,
 * cycling through the provided list.
 */
function createCyclingLLM(observations: string[], verifyVerdict: 'retry' | 'pass' | 'fail' = 'retry'): LLMProvider {
  let callCount = 0;
  return {
    async generateText() {
      const idx = callCount % observations.length;
      callCount++;
      return { text: observations[idx] };
    },
    async generateObject() {
      return {
        object: {
          reasoning: 'Test reasoning',
          action: 'Test action',
          toolName: 'browser_snapshot',
          toolArgs: {},
          expectedOutcome: 'See the page',
          verdict: verifyVerdict,
        },
      };
    },
  };
}

describe('Crash recovery and abort scenarios (AgentLoop)', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager(':memory:');
  });

  it('aborts with stuck verdict when MCP client is disconnected (simulating crash)', async () => {
    // When MCP is disconnected, execute() returns { success: false } every time.
    // The LLM keeps reporting "MCP disconnected, no UI state available" — same observation.
    // After stuckThreshold consecutive identical observations, AgentLoop aborts with 'stuck'.
    const disconnectedClient = new MCPClient();
    // Do NOT call connect() — isConnected() returns false

    const llm = createStaticLLM('MCP disconnected, no UI state available');
    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager,
      mcpClient: disconnectedClient,
      maxSteps: 10,
      stuckThreshold: 3,
    });

    const result = await loop.run('Test crash recovery');

    expect(result.verdict).toBe('stuck');
    expect(result.report).toBeDefined();
    expect(result.report!.verdict).toBe('stuck');
    expect(result.report!.reasoning).toContain('identical observations');
    expect(result.sessionId).toBeDefined();
  });

  it('enforces maxSteps limit and terminates with fail verdict', async () => {
    // The LLM returns different observations each cycle (so not stuck),
    // but always returns 'retry' verdict. After maxSteps, AgentLoop terminates.
    const client = new MCPClient();
    await client.connect({});

    const observations = [
      'Step 1: App is loading',
      'Step 2: App loaded, seeing login form',
      'Step 3: Entered credentials',
      'Step 4: Dashboard visible',
      'Step 5: Clicking settings',
    ];
    const llm = createCyclingLLM(observations, 'retry');

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager,
      mcpClient: client,
      maxSteps: 3,
      stuckThreshold: 5, // high threshold so we hit maxSteps first
    });

    const result = await loop.run('Test maxSteps enforcement');

    expect(result.verdict).toBe('fail');
    expect(result.report).toBeDefined();
    expect(result.report!.reasoning).toContain('maximum steps');
    expect(result.report!.stepCount).toBe(3);
  });

  it('terminates on repeated failures without infinite looping', async () => {
    // Simulate repeated tool failures: MCP calls always fail, but LLM sees
    // different error messages each time (so not stuck). Should still stop at maxSteps.
    const client = new MCPClient();
    await client.connect({});

    const failClient = new MCPClient();
    // Monkey-patch to always fail (simulating broken tool chain)
    failClient.callTool = async () => ({ success: false, result: 'tool crash' });

    const observations = [
      'Error: Tool call failed with timeout',
      'Error: Connection reset by peer',
      'Error: Tool returned unexpected format',
      'Error: Process exited with code 1',
      'Error: Segmentation fault',
    ];
    const llm = createCyclingLLM(observations, 'retry');

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager,
      mcpClient: failClient,
      maxSteps: 5,
      stuckThreshold: 10, // high threshold — shouldn't trigger
    });

    const result = await loop.run('Test termination guarantees');

    // Should terminate with fail (exhausted maxSteps), not loop forever
    expect(result.verdict).toBe('fail');
    expect(result.report).toBeDefined();
    expect(result.report!.stepCount).toBe(5);
  });

  it('detects stuck state when MCP failures produce identical observations', async () => {
    // Even with maxSteps=10, if the agent sees the same thing 3 times in a row
    // due to repeated failures, stuck detection kicks in early.
    const failClient = new MCPClient();
    failClient.callTool = async () => ({ success: false, result: 'connection refused' });

    const llm = createStaticLLM('Cannot reach the application — all tool calls failing');
    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager,
      mcpClient: failClient,
      maxSteps: 20,
      stuckThreshold: 3,
    });

    const result = await loop.run('Test early stuck detection');

    expect(result.verdict).toBe('stuck');
    expect(result.report).toBeDefined();
    // Should have stopped well before maxSteps=20
    expect(result.report!.stepCount).toBeLessThan(20);
  });

  it('reaches pass verdict when tools succeed after initial failures', async () => {
    // Simulate recovery: first call fails, subsequent calls succeed.
    // The LLM sees different observations (failure -> success), avoids stuck detection,
    // and eventually returns 'pass'.
    let callIndex = 0;
    const recoverableClient = new MCPClient();
    recoverableClient.callTool = async () => {
      callIndex++;
      if (callIndex <= 1) {
        return { success: false, result: 'ECONNREFUSED' };
      }
      return { success: true, result: 'page loaded' };
    };

    let generateTextCalls = 0;
    const llm: LLMProvider = {
      async generateText() {
        generateTextCalls++;
        if (generateTextCalls <= 1) {
          return { text: 'App not responding, connection refused' };
        }
        return { text: 'App loaded successfully, login form visible' };
      },
      async generateObject() {
        if (generateTextCalls <= 1) {
          return {
            object: {
              reasoning: 'App crashed, need to retry',
              action: 'Retry launching',
              toolName: 'electron_launch',
              toolArgs: { targetAppPath: '/test/app' },
              expectedOutcome: 'App launches',
              verdict: 'retry',
            },
          };
        }
        return {
          object: {
            reasoning: 'App is running and login form is visible',
            action: 'Goal achieved',
            toolName: 'browser_snapshot',
            toolArgs: {},
            expectedOutcome: 'Confirmed',
            verdict: 'pass',
          },
        };
      },
    };

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager,
      mcpClient: recoverableClient,
      maxSteps: 10,
      stuckThreshold: 5,
    });

    const result = await loop.run('Test recovery after reconnection');

    expect(result.verdict).toBe('pass');
    expect(result.report).toBeDefined();
    expect(result.report!.verdict).toBe('pass');
  });
});
