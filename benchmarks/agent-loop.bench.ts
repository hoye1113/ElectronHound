/**
 * AgentLoop Phase Latency Benchmarks
 *
 * Measures the latency of each individual phase in the AgentLoop
 * observe → plan → execute → verify cycle.
 *
 * Uses mocked LLM provider and MCP client for consistent measurements.
 * Results are output to benchmarks/agent-loop-results.json for CI comparison.
 */

import { bench, describe, beforeAll } from 'vitest';
import { AgentLoop } from '../packages/agent-core/src/runtime/agentLoop.js';
import type { LLMProvider } from '../packages/agent-core/src/llm/types.js';
import type { SessionManager } from '../packages/agent-core/src/session/sessionManager.js';
import type { MCPClient } from '../packages/agent-core/src/mcp/client.js';
import type {
  AgentLoopState,
  Observation,
  Plan,
  ExecutionResult,
} from '../packages/agent-core/src/runtime/types.js';

// ── Mock Factories ──────────────────────────────────────────────────────────

function createMockLLM(): LLMProvider {
  return {
    generateText: async () => {
      // Simulate minimal LLM latency
      return { text: '{"summary":"Page loaded with login form","details":{"elements":3}}' };
    },
    generateObject: async (opts) => {
      // Simulate minimal LLM latency with structured output
      if (opts.prompt.includes('Evaluate whether')) {
        return {
          object: {
            verdict: 'retry',
            reasoning: 'Progress being made, continue testing',
          },
        };
      }
      return {
        object: {
          reasoning: 'Need to interact with the submit button',
          action: 'Click the submit button',
          toolName: 'browser_click',
          toolArgs: { ref: 'submit-btn' },
          expectedOutcome: 'Form submits successfully',
        },
      };
    },
  };
}

function createMockSession(): SessionManager {
  return {
    createSession: () => 'bench-session-001',
    addEntry: () => 'entry-id',
    getSession: () => null,
    compactSession: () => {},
    deleteSession: () => {},
    close: () => {},
  } as unknown as SessionManager;
}

function createMockMCP(): MCPClient {
  return {
    callTool: async () => ({
      success: true,
      result: { content: [{ text: 'Element clicked successfully' }] },
    }),
    disconnect: async () => {},
    isConnected: () => true,
    isMockMode: () => false,
  } as unknown as MCPClient;
}

// ── Test Fixtures ───────────────────────────────────────────────────────────

const mockState: AgentLoopState = {
  sessionId: 'bench-session-001',
  taskPrompt: 'Test the login flow of the application',
  stepCount: 1,
  currentObservation: null,
  lastPlan: null,
  lastExecution: null,
  stuckCount: 0,
};

const mockObservation: Observation = {
  summary: 'Login form is visible with username and password fields',
  details: { elements: ['input#username', 'input#password', 'button#submit'] },
  timestamp: new Date().toISOString(),
};

const mockPlan: Plan = {
  reasoning: 'The login form is visible, need to fill in credentials',
  action: 'Type username into the username field',
  toolName: 'browser_type',
  toolArgs: { ref: 'username-input', text: 'testuser' },
  expectedOutcome: 'Username field contains testuser',
};

const mockExecution: ExecutionResult = {
  success: true,
  result: { content: [{ text: 'Typed successfully' }] },
};

// ── AgentLoop Instance ──────────────────────────────────────────────────────

let agentLoop: AgentLoop;

beforeAll(() => {
  agentLoop = new AgentLoop({
    llmProvider: createMockLLM(),
    sessionManager: createMockSession(),
    mcpClient: createMockMCP(),
    maxSteps: 20,
    stuckThreshold: 3,
  });
});

// ── Benchmark: Observe Phase ────────────────────────────────────────────────

describe('AgentLoop Phase Latencies', () => {
  describe('Observe Phase', () => {
    bench('observeLatency', async () => {
      await agentLoop.observe(mockState);
    });
  });

  // ── Benchmark: Plan Phase ─────────────────────────────────────────────────

  describe('Plan Phase', () => {
    bench('planLatency', async () => {
      await agentLoop.plan(mockObservation, mockState);
    });
  });

  // ── Benchmark: Execute Phase ──────────────────────────────────────────────

  describe('Execute Phase', () => {
    bench('executeLatency', async () => {
      await agentLoop.execute(mockPlan);
    });
  });

  // ── Benchmark: Verify Phase ───────────────────────────────────────────────

  describe('Verify Phase', () => {
    bench('verifyLatency', async () => {
      await agentLoop.verify(mockExecution, mockPlan, mockState);
    });
  });
});

// ── Benchmark: Total Steps Stability ────────────────────────────────────────

describe('AgentLoop Step Stability', () => {
  bench('totalSteps', async () => {
    // Create a fresh loop for each iteration to measure step counting
    const loop = new AgentLoop({
      llmProvider: createMockLLM(),
      sessionManager: createMockSession(),
      mcpClient: createMockMCP(),
      maxSteps: 5,
      stuckThreshold: 3,
    });

    // Run a single step cycle (observe → plan → execute → verify)
    const observation = await loop.observe(mockState);
    const plan = await loop.plan(observation, mockState);
    const execution = await loop.execute(plan);
    await loop.verify(execution, plan, {
      ...mockState,
      stepCount: mockState.stepCount + 1,
    });
  });
});

// ── Benchmark: Plan Phase Token Consumption ─────────────────────────────────

describe('Plan Phase Token Tracking', () => {
  bench('planTokenConsumption', async () => {
    // Simulate token counting for plan phase
    // In a real implementation, this would track actual token usage
    const promptParts = [
      `Task: ${mockState.taskPrompt}`,
      `Current step: ${mockState.stepCount + 1}`,
      `Current observation: ${mockObservation.summary}`,
      `Details: ${JSON.stringify(mockObservation.details)}`,
      'Decide the next action to make progress toward the goal.',
    ];
    const prompt = promptParts.join('\n');

    // Simulate token counting (rough estimate: ~4 chars per token)
    const estimatedTokens = Math.ceil(prompt.length / 4);

    // Call the plan method
    await agentLoop.plan(mockObservation, mockState);

    // Return token count for tracking
    return estimatedTokens;
  });
});

// ── Benchmark: Full Cycle Latency ───────────────────────────────────────────

describe('Full AgentLoop Cycle', () => {
  bench('fullCycleLatency', async () => {
    const loop = new AgentLoop({
      llmProvider: createMockLLM(),
      sessionManager: createMockSession(),
      mcpClient: createMockMCP(),
      maxSteps: 20,
      stuckThreshold: 3,
    });

    // Execute one complete observe → plan → execute → verify cycle
    const observation = await loop.observe(mockState);
    const plan = await loop.plan(observation, mockState);
    const execution = await loop.execute(plan);
    await loop.verify(execution, plan, {
      ...mockState,
      stepCount: mockState.stepCount + 1,
    });
  });
});
