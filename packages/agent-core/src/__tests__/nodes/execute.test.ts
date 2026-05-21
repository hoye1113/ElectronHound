import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeNode } from '../../nodes/execute.js';
import { setMCPClient, MCPClient } from '../../mcp/client.js';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
    auditChainResult: null,
    ...overrides,
  };
}

describe('executeNode', () => {
  let mockClient: MCPClient;
  let tempDir: string;
  let envDataDir: string | undefined;

  beforeEach(() => {
    mockClient = new MCPClient();
    setMCPClient(mockClient);
    // Use a temp directory for screenshots
    tempDir = mkdtempSync(join(tmpdir(), 'eata-test-'));
    envDataDir = process.env.EATA_DATA_DIR;
    process.env.EATA_DATA_DIR = tempDir;
  });

  afterEach(() => {
    // Restore env
    if (envDataDir === undefined) {
      delete process.env.EATA_DATA_DIR;
    } else {
      process.env.EATA_DATA_DIR = envDataDir;
    }
    // Clean up temp dir
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('executes browser tool via playwright MCP', async () => {
    vi.spyOn(mockClient, 'callTool').mockImplementation(async (server, toolName) => {
      if (toolName === 'browser_screenshot') {
        return { success: true, result: { content: [{ type: 'image', data: 'aVZCT1J3MEtHZ29BQUFBTlNVaEVVZ0FBQU1RQUFB', mimeType: 'image/png' }] } };
      }
      return { success: true, result: 'clicked Settings' };
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

  it('captures screenshot and sets path on execResult', async () => {
    const fakeBase64 = Buffer.from('fake-png-data').toString('base64');
    vi.spyOn(mockClient, 'callTool').mockImplementation(async (server, toolName) => {
      if (toolName === 'browser_screenshot') {
        return { success: true, result: { content: [{ type: 'image', data: fakeBase64, mimeType: 'image/png' }] } };
      }
      return { success: true, result: 'clicked Settings' };
    });

    const state = makeState();
    const result = await executeNode(state);

    expect(result.currentExecResult!.success).toBe(true);
    expect(result.currentExecResult!.screenshot).toBeDefined();
    expect(result.currentExecResult!.screenshot).toContain('step-1-execute.png');
    expect(result.currentExecResult!.screenshot).toContain(tempDir);
    expect(existsSync(result.currentExecResult!.screenshot!)).toBe(true);
  });

  it('gracefully handles screenshot failure without crashing', async () => {
    vi.spyOn(mockClient, 'callTool').mockImplementation(async (server, toolName) => {
      if (toolName === 'browser_screenshot') {
        throw new Error('MCP disconnected');
      }
      return { success: true, result: 'clicked Settings' };
    });

    const state = makeState();
    const result = await executeNode(state);

    // Tool execution still succeeds, screenshot is just undefined
    expect(result.currentExecResult!.success).toBe(true);
    expect(result.currentExecResult!.screenshot).toBeUndefined();
  });

  it('gracefully handles screenshot callTool returning failure', async () => {
    vi.spyOn(mockClient, 'callTool').mockImplementation(async (server, toolName) => {
      if (toolName === 'browser_screenshot') {
        return { success: false, result: 'Screenshot failed' };
      }
      return { success: true, result: 'clicked Settings' };
    });

    const state = makeState();
    const result = await executeNode(state);

    expect(result.currentExecResult!.success).toBe(true);
    expect(result.currentExecResult!.screenshot).toBeUndefined();
  });

  it('does not capture screenshot for electron tools', async () => {
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
    expect(result.currentExecResult!.screenshot).toBeUndefined();
    // Only one callTool call (for electron_main), not browser_screenshot
    expect(mockClient.callTool).toHaveBeenCalledTimes(1);
  });

  it('handles mock mode screenshot (string result)', async () => {
    const fakeBase64 = Buffer.from('mock-png').toString('base64');
    vi.spyOn(mockClient, 'callTool').mockImplementation(async (server, toolName) => {
      if (toolName === 'browser_screenshot') {
        return { success: true, result: fakeBase64 };
      }
      return { success: true, result: 'clicked Settings' };
    });

    const state = makeState();
    const result = await executeNode(state);

    expect(result.currentExecResult!.screenshot).toBeDefined();
    expect(result.currentExecResult!.screenshot).toContain('step-1-execute.png');
  });
});
