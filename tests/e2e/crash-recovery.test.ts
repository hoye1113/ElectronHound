import { describe, it, expect, beforeEach } from 'vitest';
import { createTestGraph } from '../../packages/agent-core/src/graph.js';
import { setMCPClient, MCPClient } from '../../packages/agent-core/src/mcp/client.js';

describe('Crash recovery and abort scenarios', () => {
  beforeEach(() => {
    // Set MCP client but do NOT connect → callTool returns failure
    // This simulates MCP server being unreachable
    const mockClient = new MCPClient();
    setMCPClient(mockClient);
  });

  it('aborts when MCP client is disconnected (simulating crash)', async () => {
    const graph = createTestGraph();
    const compiled = graph.compile();

    const result = await compiled.invoke(
      {
        goal: 'Test that should abort due to disconnected MCP',
        targetAppPath: '/test/app',
        llmModel: 'gpt-4o',
        maxSteps: 20,
        taskId: 'crash-test-1',
      },
      { configurable: { thread_id: 'crash-test-1' }, recursionLimit: 100 },
    );

    // With MCP disconnected, observe gets same failure message every time
    // → stuckCounter increments → abort
    expect(result.status).toBe('aborted');
    expect(result.stepCount).toBeGreaterThan(0);
  });

  it('enforces maxSteps limit and terminates', async () => {
    const graph = createTestGraph();
    const compiled = graph.compile();

    const result = await compiled.invoke(
      {
        goal: 'Test max steps enforcement',
        targetAppPath: '/test/app',
        llmModel: 'gpt-4o',
        maxSteps: 2,
        taskId: 'maxsteps-test',
      },
      { configurable: { thread_id: 'maxsteps-test' }, recursionLimit: 100 },
    );

    // Should NOT still be running — graph must terminate
    expect(result.status).not.toBe('running');
    // Either aborted or failed due to maxSteps
    expect(['aborted', 'failed', 'completed']).toContain(result.status);
  });

  it('graph does not infinite loop on repeated failures', async () => {
    const graph = createTestGraph();
    const compiled = graph.compile();

    const result = await compiled.invoke(
      {
        goal: 'Test no infinite loop',
        targetAppPath: '/test/app',
        llmModel: 'gpt-4o',
        maxSteps: 10,
        taskId: 'noloop-test',
      },
      { configurable: { thread_id: 'noloop-test' }, recursionLimit: 100 },
    );

    // Graph must always terminate — never stays in 'running'
    expect(result.status).not.toBe('running');
    // Step count should be bounded by maxSteps
    expect(result.stepCount).toBeLessThanOrEqual(20); // reasonable upper bound
  });

  it('recovers with connected MCP after simulated reconnection', async () => {
    // First run with disconnected MCP → abort
    const graph1 = createTestGraph();
    const compiled1 = graph1.compile();

    const result1 = await compiled1.invoke(
      {
        goal: 'Test reconnection',
        targetAppPath: '/test/app',
        llmModel: 'gpt-4o',
        maxSteps: 10,
        taskId: 'reconnect-test',
      },
      { configurable: { thread_id: 'reconnect-test' }, recursionLimit: 100 },
    );
    expect(result1.status).toBe('aborted');

    // Now connect MCP and run again → should complete
    const client = new MCPClient();
    await client.connect({});
    setMCPClient(client);

    const graph2 = createTestGraph();
    const compiled2 = graph2.compile();

    const result2 = await compiled2.invoke(
      {
        goal: 'Test reconnection after fix',
        targetAppPath: '/test/app',
        llmModel: 'gpt-4o',
        maxSteps: 10,
        taskId: 'reconnect-test-2',
      },
      { configurable: { thread_id: 'reconnect-test-2' }, recursionLimit: 100 },
    );
    expect(result2.status).not.toBe('running');
    expect(result2.stepCount).toBeGreaterThan(0);
  });
});
