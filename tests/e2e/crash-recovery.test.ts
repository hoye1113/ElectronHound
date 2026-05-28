import { describe, it, expect, beforeEach } from 'vitest';
import { setMCPClient, MCPClient } from '../../packages/agent-core/src/mcp/client.js';

// TODO: Rewrite for AgentLoop (LangGraph StateGraph removed in Pi migration)
// These tests previously used createTestGraph() to test crash recovery behavior.
// They need to be rewritten to use AgentLoop or runTest() with appropriate mocks.
describe.skip('Crash recovery and abort scenarios (needs rewrite for AgentLoop)', () => {
  beforeEach(() => {
    const mockClient = new MCPClient();
    setMCPClient(mockClient);
  });

  it('aborts when MCP client is disconnected (simulating crash)', async () => {
    // Previously tested that disconnected MCP → stuckCounter → abort
  });

  it('enforces maxSteps limit and terminates', async () => {
    // Previously tested that graph terminates at maxSteps
  });

  it('graph does not infinite loop on repeated failures', async () => {
    // Previously tested termination guarantees
  });

  it('recovers with connected MCP after simulated reconnection', async () => {
    // Previously tested MCP reconnection flow
  });
});
