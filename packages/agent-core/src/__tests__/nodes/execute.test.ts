import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeNode } from '../../nodes/execute.js';
import { setMCPClient, MCPClient } from '../../mcp/client.js';

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    goal: 'test goal',
    targetAppPath: '/app',
    llmModel: 'gpt-4o',
    maxSteps: 50,
    taskId: 'task-1',
    history: [],
    currentObservation: null,
    currentPlan: {
      reasoning: 'Click button',
      toolCall: { name: 'browser_click', args: { element: 'Settings' } },
      expectedOutcome: 'Settings page opens',
    },
    currentExecResult: null,
    currentVerdict: null,
    stepCount: 1,
    stuckCounter: 0,
    status: 'running' as const,
    lastObservationHash: '',
    ...overrides,
  };
}

describe('executeNode', () => {
  let mockClient: MCPClient;

  beforeEach(() => {
    mockClient = new MCPClient();
    setMCPClient(mockClient);
  });

  it('executes browser tool via playwright MCP', async () => {
    vi.spyOn(mockClient, 'callTool').mockResolvedValue({
      success: true,
      result: 'clicked Settings',
    });

    const state = makeState();
    const result = await executeNode(state);

    expect(mockClient.callTool).toHaveBeenCalledWith(
      'playwright',
      'browser_click',
      { element: 'Settings' },
    );
    expect(result.currentExecResult!.success).toBe(true);
  });

  it('routes electron_* tools to electron MCP', async () => {
    vi.spyOn(mockClient, 'callTool').mockResolvedValue({
      success: true,
      result: 'v1.0.0',
    });

    const state = makeState({
      currentPlan: {
        reasoning: 'Get version',
        toolCall: { name: 'electron_main', args: { code: 'app.getVersion()' } },
        expectedOutcome: 'Version returned',
      },
    });

    const result = await executeNode(state);
    expect(mockClient.callTool).toHaveBeenCalledWith(
      'electron',
      'electron_main',
      { code: 'app.getVersion()' },
    );
  });

  it('returns failure when tool call fails', async () => {
    vi.spyOn(mockClient, 'callTool').mockRejectedValue(new Error('Tool error'));

    const state = makeState();
    const result = await executeNode(state);

    expect(result.currentExecResult!.success).toBe(false);
    expect(result.currentExecResult!.result).toContain('Tool error');
  });

  it('returns failure when no plan exists', async () => {
    const state = makeState({ currentPlan: null });
    const result = await executeNode(state);

    expect(result.currentExecResult!.success).toBe(false);
  });

  it('returns failure when plan has no toolCall', async () => {
    const state = makeState({
      currentPlan: {
        reasoning: 'Nothing to do',
        toolCall: null as unknown as { name: string; args: Record<string, unknown> },
        expectedOutcome: 'Done',
      },
    });
    const result = await executeNode(state);

    expect(result.currentExecResult!.success).toBe(false);
  });
});
