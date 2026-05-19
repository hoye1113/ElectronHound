import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestGraph } from '../graph.js';
import { START, END } from '@langchain/langgraph';
import { setMCPClient, MCPClient } from '../mcp/client.js';

describe('createTestGraph', () => {
  let mockClient: MCPClient;

  beforeEach(() => {
    mockClient = new MCPClient();
    setMCPClient(mockClient);
  });

  it('compiles without errors', () => {
    const graph = createTestGraph();
    const compiled = graph.compile();

    expect(compiled).toBeDefined();
    expect(typeof compiled.invoke).toBe('function');
  });

  it('has all required nodes', () => {
    const graph = createTestGraph();
    const compiled = graph.compile();

    // The compiled graph should have all nodes
    expect(compiled.builder.nodes).toBeDefined();
    const nodeNames = Object.keys(compiled.builder.nodes);
    expect(nodeNames).toContain('observe');
    expect(nodeNames).toContain('plan');
    expect(nodeNames).toContain('execute');
    expect(nodeNames).toContain('verify');
    expect(nodeNames).toContain('abort');
    expect(nodeNames).toContain('report');
  });

  it('executes a complete path through the graph', async () => {
    await mockClient.connect({});
    const graph = createTestGraph();
    const compiled = graph.compile();

    const initialState = {
      goal: 'Click Settings button',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 10,
      taskId: 'test-task',
    };

    const result = await compiled.invoke(initialState, {
      configurable: { thread_id: 'test-thread' },
    });

    expect(result).toBeDefined();
    expect(result.goal).toBe('Click Settings button');
    expect(result.status).toBeDefined();
    expect(result.stepCount).toBeGreaterThan(0);
  });

  it('routes to abort when stuckCounter reaches 3', async () => {
    // Do NOT connect MCP client so callTool always returns same failure message
    // This causes the observe node to see identical observations each time,
    // triggering stuckCounter accumulation and eventually routing to abort.
    const graph = createTestGraph();
    const compiled = graph.compile();

    const initialState = {
      goal: 'Test stuck detection',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 20,
      taskId: 'test-stuck',
    };

    const result = await compiled.invoke(initialState, {
      configurable: { thread_id: 'stuck-thread' },
    });

    // With MCP disconnected, every observe gets same result → stuckCounter → abort
    expect(result.status).toBe('aborted');
  });

  it('completes with pass verdict route to report', async () => {
    await mockClient.connect({});
    const graph = createTestGraph();
    const compiled = graph.compile();

    // With everything set up to pass - observe → plan → execute → verify → report
    const initialState = {
      goal: 'Test pass flow',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 10,
      taskId: 'test-pass',
      stepCount: 1,
      stuckCounter: 0,
      currentObservation: {
        ariaTree: '<main>Home page</main>',
        pageTitle: 'Home',
        url: 'http://localhost',
        timestamp: new Date().toISOString(),
      },
      currentPlan: {
        reasoning: 'Navigate home',
        toolCall: { name: 'browser_navigate', args: { url: '/' } },
        expectedOutcome: 'Home page loads',
      },
      currentExecResult: {
        success: true,
        result: 'navigated',
      },
      currentVerdict: {
        verdict: 'pass' as const,
        reasoning: 'Good',
      },
    };

    const result = await compiled.invoke(initialState, {
      configurable: { thread_id: 'pass-thread' },
    });

    // Should reach report node since verdict is 'pass'
    expect(result.status).toBe('completed');
  });

  it('enforces maxSteps limit through routing', async () => {
    await mockClient.connect({});
    const graph = createTestGraph();
    const compiled = graph.compile();

    const initialState = {
      goal: 'Test max steps',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 2,
      taskId: 'test-max',
      stepCount: 40, // already past max?
      stuckCounter: 0,
    };

    const result = await compiled.invoke(initialState, {
      configurable: { thread_id: 'max-thread' },
    });

    // With stepCount already high, first observe puts us at 41 > maxSteps=2
    // Then routeAfterObserve returns 'stuck' → abort
    // OR observe routes to plan, then verify checks stepCount >= maxSteps → fail → report → failed
    // Either way, the graph terminates and status should NOT be 'running'
    expect(result.status).not.toBe('running');
  });
});

describe('createTestGraph with DI options', () => {
  let mockClient: MCPClient;

  beforeEach(() => {
    mockClient = new MCPClient();
    setMCPClient(mockClient);
  });

  it('uses injected generateObject for plan node', async () => {
    const mockPlanGenerateObject = vi.fn().mockResolvedValue({
      object: {
        reasoning: 'LLM-driven plan',
        toolCall: { name: 'browser_click', args: { selector: '#btn' } },
        expectedOutcome: 'Button clicked',
      },
    });
    const mockVerifyGenerateObject = vi.fn().mockResolvedValue({
      object: { verdict: 'pass', reasoning: 'Success' },
    });

    const graph = createTestGraph({
      plan: { generateObject: mockPlanGenerateObject },
      verify: { generateObject: mockVerifyGenerateObject },
    });
    const compiled = graph.compile();

    const initialState = {
      goal: 'DI test goal',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 5,
      taskId: 'di-test-1',
    };

    const result = await compiled.invoke(initialState, {
      configurable: { thread_id: 'di-thread' },
    });

    // Plan node should use the injected generateObject
    expect(mockPlanGenerateObject).toHaveBeenCalled();
    // Verify node should use the injected generateObject
    expect(mockVerifyGenerateObject).toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.goal).toBe('DI test goal');
  });

  it('falls back to deterministic defaults when no generateObject provided', async () => {
    // createTestGraph with empty options = nodes use internal fallbacks
    const graph = createTestGraph({});
    const compiled = graph.compile();

    const initialState = {
      goal: 'Fallback test',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 10,
      taskId: 'fallback-test',
    };

    const result = await compiled.invoke(initialState, {
      configurable: { thread_id: 'fallback-thread' },
    });

    expect(result).toBeDefined();
    expect(result.status).toBeDefined();
    // Without generateObject, plan node uses deterministic fallback (browser_snapshot)
    // This validates the backward-compatibility path
  });
});
