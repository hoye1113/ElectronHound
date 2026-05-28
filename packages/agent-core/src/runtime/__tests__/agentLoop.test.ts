import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLoop } from '../agentLoop.js';
import type { LLMProvider } from '../../llm/types.js';
import type { SessionManager } from '../../session/sessionManager.js';
import type { MCPClient } from '../../mcp/client.js';

function createMockLLM(): LLMProvider {
  return {
    generateText: vi.fn().mockResolvedValue({ text: '{"summary":"mock","details":{}}' }),
    generateObject: vi.fn().mockImplementation(async (opts: { prompt: string }) => {
      // Return pass verdict on first verify, so the loop exits quickly
      if (opts.prompt.includes('Evaluate whether')) {
        return { object: { verdict: 'pass', reasoning: 'Goal achieved' } };
      }
      return {
        object: {
          reasoning: 'test',
          action: 'test action',
          toolName: 'electron_launch',
          toolArgs: { targetAppPath: '/app' },
          expectedOutcome: 'app launches',
        },
      };
    }),
  };
}

function createMockSession(): SessionManager {
  return {
    createSession: vi.fn().mockReturnValue('session-1'),
    addEntry: vi.fn(),
    getSession: vi.fn().mockReturnValue(null),
  } as unknown as SessionManager;
}

function createMockMCP(): MCPClient & { disconnect: ReturnType<typeof vi.fn> } {
  return {
    callTool: vi.fn().mockResolvedValue({ success: true, result: 'ok' }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    isMockMode: vi.fn().mockReturnValue(false),
  } as unknown as MCPClient & { disconnect: ReturnType<typeof vi.fn> };
}

describe('AgentLoop', () => {
  describe('finally cleanup', () => {
    it('calls mcp.disconnect() when loop completes with pass verdict', async () => {
      const mcp = createMockMCP();
      const loop = new AgentLoop({
        llmProvider: createMockLLM(),
        sessionManager: createMockSession(),
        mcpClient: mcp,
        maxSteps: 5,
      });

      await loop.run('Test goal');

      expect(mcp.disconnect).toHaveBeenCalled();
    });

    it('calls mcp.disconnect() when loop exhausts maxSteps', async () => {
      const mcp = createMockMCP();
      const llm = createMockLLM();
      // Always return retry so loop exhausts maxSteps
      (llm.generateObject as ReturnType<typeof vi.fn>).mockResolvedValue({
        object: {
          reasoning: 'retry',
          action: 'retry action',
          toolName: 'electron_launch',
          toolArgs: { targetAppPath: '/app' },
          expectedOutcome: 'app launches',
        },
      });

      const loop = new AgentLoop({
        llmProvider: llm,
        sessionManager: createMockSession(),
        mcpClient: mcp,
        maxSteps: 2,
      });

      await loop.run('Test goal');

      expect(mcp.disconnect).toHaveBeenCalled();
    });

    it('calls mcp.disconnect() when loop gets stuck', async () => {
      const mcp = createMockMCP();
      const llm = createMockLLM();
      // Return identical observations to trigger stuck detection
      (llm.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
        text: '{"summary":"same state","details":{}}',
      });
      // Always retry
      (llm.generateObject as ReturnType<typeof vi.fn>).mockResolvedValue({
        object: {
          reasoning: 'retry',
          action: 'retry',
          toolName: 'electron_launch',
          toolArgs: { targetAppPath: '/app' },
          expectedOutcome: 'launch',
        },
      });

      const loop = new AgentLoop({
        llmProvider: llm,
        sessionManager: createMockSession(),
        mcpClient: mcp,
        maxSteps: 10,
        stuckThreshold: 2,
      });

      await loop.run('Test goal');

      expect(mcp.disconnect).toHaveBeenCalled();
    });

    it('does not throw when mcp is undefined', async () => {
      const loop = new AgentLoop({
        llmProvider: createMockLLM(),
        sessionManager: createMockSession(),
        // no mcpClient
        maxSteps: 5,
      });

      await expect(loop.run('Test goal')).resolves.toBeDefined();
    });

    it('does not throw when mcp.disconnect() rejects', async () => {
      const mcp = createMockMCP();
      mcp.disconnect.mockRejectedValueOnce(new Error('disconnect failed'));

      const loop = new AgentLoop({
        llmProvider: createMockLLM(),
        sessionManager: createMockSession(),
        mcpClient: mcp,
        maxSteps: 5,
      });

      await expect(loop.run('Test goal')).resolves.toBeDefined();
    });
  });
});
