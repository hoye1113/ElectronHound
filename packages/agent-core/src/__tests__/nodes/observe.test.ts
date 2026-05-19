import { describe, it, expect, vi, beforeEach } from 'vitest';
import { observeNode } from '../../nodes/observe.js';
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
    currentPlan: null,
    currentExecResult: null,
    currentVerdict: null,
    stepCount: 0,
    stuckCounter: 0,
    status: 'running' as const,
    lastObservationHash: '',
    ...overrides,
  };
}

describe('observeNode', () => {
  let mockClient: MCPClient;

  beforeEach(() => {
    mockClient = new MCPClient();
    setMCPClient(mockClient);
  });

  it('calls browser_snapshot and returns observation', async () => {
    vi.spyOn(mockClient, 'callTool').mockResolvedValue({
      success: true,
      result: '{"tree":"root"}',
    });
    vi.spyOn(mockClient, 'isConnected').mockReturnValue(true);

    const state = makeState();
    const result = await observeNode(state);

    expect(mockClient.callTool).toHaveBeenCalledWith('playwright', 'browser_snapshot', {});
    expect(result.currentObservation).toBeDefined();
    expect(result.currentObservation!.ariaTree).toContain('root');
    expect(result.stepCount).toBe(1);
  });

  it('increments stepCount', async () => {
    vi.spyOn(mockClient, 'callTool').mockResolvedValue({
      success: true,
      result: 'page content',
    });
    vi.spyOn(mockClient, 'isConnected').mockReturnValue(true);

    const state = makeState({ stepCount: 5 });
    const result = await observeNode(state);
    expect(result.stepCount).toBe(6);
  });

  it('adds to history', async () => {
    vi.spyOn(mockClient, 'callTool').mockResolvedValue({
      success: true,
      result: 'page content',
    });
    vi.spyOn(mockClient, 'isConnected').mockReturnValue(true);

    const state = makeState();
    const result = await observeNode(state);
    expect(result.history).toBeDefined();
    expect(Array.isArray(result.history)).toBe(true);
  });

  it('detects stuck when observation unchanged', async () => {
    vi.spyOn(mockClient, 'callTool').mockResolvedValue({
      success: true,
      result: 'same content',
    });
    vi.spyOn(mockClient, 'isConnected').mockReturnValue(true);

    const state = makeState({
      stuckCounter: 0,
      lastObservationHash: String(hashString('same content')),
    });
    const result = await observeNode(state);
    expect(result.stuckCounter).toBe(1);
  });

  it('increments stuckCounter on identical observations', async () => {
    vi.spyOn(mockClient, 'callTool').mockResolvedValue({
      success: true,
      result: 'stuck page',
    });
    vi.spyOn(mockClient, 'isConnected').mockReturnValue(true);

    const stuckHash = String(hashString('stuck page'));
    const state = makeState({
      stuckCounter: 2,
      lastObservationHash: stuckHash,
    });
    const result = await observeNode(state);
    expect(result.stuckCounter).toBe(3);
  });

  it('resets stuckCounter when observation changes', async () => {
    vi.spyOn(mockClient, 'callTool').mockResolvedValue({
      success: true,
      result: 'new content',
    });
    vi.spyOn(mockClient, 'isConnected').mockReturnValue(true);

    const state = makeState({
      stuckCounter: 2,
      lastObservationHash: 'old-hash',
    });
    const result = await observeNode(state);
    expect(result.stuckCounter).toBe(0);
  });
});

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}
