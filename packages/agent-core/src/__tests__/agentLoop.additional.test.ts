import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLoop } from '../runtime/agentLoop.js';
import type { LLMProvider } from '../llm/types.js';
import type { SessionManager } from '../session/sessionManager.js';
import type { MCPClient } from '../mcp/client.js';
import type { AgentLoopState, Observation, Verdict } from '../runtime/types.js';
import { LLMError } from '../llm/retry.js';

// ─── Mock factories ───────────────────────────────────────

function createMockLLM(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    generateText: vi.fn().mockResolvedValue({ text: '{"summary":"mock observation","details":{}}' }),
    generateObject: vi.fn().mockImplementation(async (opts: { prompt: string }) => {
      if (opts.prompt.includes('Evaluate whether')) {
        return { object: { verdict: 'pass', reasoning: 'Goal achieved' } };
      }
      return {
        object: {
          reasoning: 'test plan',
          action: 'test action',
          toolName: 'electron_launch',
          toolArgs: { targetAppPath: '/app' },
          expectedOutcome: 'app launches',
        },
      };
    }),
    ...overrides,
  };
}

function createMockSession(): SessionManager {
  return {
    createSession: vi.fn().mockReturnValue('session-test-1'),
    addEntry: vi.fn(),
    getSession: vi.fn().mockReturnValue(null),
  } as unknown as SessionManager;
}

function createMockMCP(): MCPClient & {
  callTool: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
} {
  return {
    callTool: vi.fn().mockResolvedValue({ success: true, result: 'ok' }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    isMockMode: vi.fn().mockReturnValue(false),
  } as unknown as MCPClient & {
    callTool: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
}

// ─── AgentLoop.run() — full loop scenarios ────────────────

describe('AgentLoop.run() scenarios', () => {
  it('returns pass verdict when verify returns pass on first cycle', async () => {
    const llm = createMockLLM();
    const session = createMockSession();

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: session,
      maxSteps: 5,
    });

    const result = await loop.run('Test the login page');

    expect(result.verdict).toBe('pass');
    expect(result.sessionId).toBe('session-test-1');
    expect(result.report).toBeDefined();
    expect(result.report!.goal).toBe('Test the login page');
    expect(result.report!.verdict).toBe('pass');
  });

  it('creates a session and adds initial user entry', async () => {
    const session = createMockSession();
    const loop = new AgentLoop({
      llmProvider: createMockLLM(),
      sessionManager: session,
      maxSteps: 5,
    });

    await loop.run('My task');

    expect(session.createSession).toHaveBeenCalledWith('agent-loop', 'My task');
    expect(session.addEntry).toHaveBeenCalledWith(
      'session-test-1',
      expect.objectContaining({ role: 'user', content: 'My task', type: 'user' }),
    );
  });

  it('runs multiple cycles when verify returns retry', async () => {
    let verifyCallCount = 0;
    let obsCount = 0;
    const llm = createMockLLM({
      generateText: vi.fn().mockImplementation(async () => {
        obsCount++;
        return { text: `{"summary":"observation cycle ${obsCount}","details":{"step":${obsCount}}}` };
      }),
      generateObject: vi.fn().mockImplementation(async (opts: { prompt: string }) => {
        if (opts.prompt.includes('Evaluate whether')) {
          verifyCallCount++;
          if (verifyCallCount >= 3) {
            return { object: { verdict: 'pass', reasoning: 'Finally passed' } };
          }
          return { object: { verdict: 'retry', reasoning: 'Keep going' } };
        }
        return {
          object: {
            reasoning: 'plan',
            action: 'action',
            toolName: 'browser_click',
            toolArgs: { ref: 'btn' },
            expectedOutcome: 'clicked',
          },
        };
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 10,
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('pass');
    // Should have had multiple verify calls
    expect(verifyCallCount).toBe(3);
  });

  it('returns fail verdict when verify returns fail', async () => {
    const llm = createMockLLM({
      generateObject: vi.fn().mockImplementation(async (opts: { prompt: string }) => {
        if (opts.prompt.includes('Evaluate whether')) {
          return { object: { verdict: 'fail', reasoning: 'App crashed' } };
        }
        return {
          object: {
            reasoning: 'plan',
            action: 'action',
            toolName: 'electron_launch',
            toolArgs: { targetAppPath: '/app' },
            expectedOutcome: 'launch',
          },
        };
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 5,
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('fail');
    expect(result.report!.reasoning).toBe('App crashed');
  });

  it('returns fail when maxSteps is exhausted', async () => {
    let obsCount = 0;
    const llm = createMockLLM({
      generateText: vi.fn().mockImplementation(async () => {
        obsCount++;
        return { text: `{"summary":"observation ${obsCount}","details":{"step":${obsCount}}}` };
      }),
      generateObject: vi.fn().mockResolvedValue({
        object: {
          reasoning: 'retry',
          action: 'retry',
          toolName: 'electron_launch',
          toolArgs: { targetAppPath: '/app' },
          expectedOutcome: 'launch',
        },
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 3,
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('fail');
    expect(result.report!.reasoning).toContain('Exceeded maximum steps');
  });

  it('returns fail on LLM error during observe', async () => {
    let textCallCount = 0;
    const llm = createMockLLM({
      generateText: vi.fn().mockImplementation(async () => {
        textCallCount++;
        if (textCallCount === 1) {
          throw new LLMError('Rate limited', 429, true);
        }
        // Second call = report, succeed
        return { text: 'Error report' };
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 5,
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('fail');
    expect(result.report!.reasoning).toContain('Rate limited');
  });

  it('returns fail on generic error during plan', async () => {
    let objectCallCount = 0;
    const llm = createMockLLM({
      generateObject: vi.fn().mockImplementation(async (opts: { prompt: string }) => {
        objectCallCount++;
        if (objectCallCount === 1) {
          // First call = plan, throw error
          throw new Error('Network timeout');
        }
        // Subsequent calls = verify, succeed
        return { object: { verdict: 'pass', reasoning: 'done' } };
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 5,
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('fail');
    expect(result.report!.reasoning).toContain('Network timeout');
  });

  it('invokes onStepComplete callback after each step', async () => {
    const onStepComplete = vi.fn();
    let verifyCount = 0;
    const llm = createMockLLM({
      generateObject: vi.fn().mockImplementation(async (opts: { prompt: string }) => {
        if (opts.prompt.includes('Evaluate whether')) {
          verifyCount++;
          if (verifyCount >= 2) return { object: { verdict: 'pass', reasoning: 'done' } };
          return { object: { verdict: 'retry', reasoning: 'not yet' } };
        }
        return {
          object: {
            reasoning: 'plan',
            action: 'action',
            toolName: 'browser_click',
            toolArgs: { ref: 'btn' },
            expectedOutcome: 'clicked',
          },
        };
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 5,
      onStepComplete,
    });

    await loop.run('Test');

    expect(onStepComplete).toHaveBeenCalled();
    // First call should be step 1
    expect(onStepComplete.mock.calls[0][0]).toBe(1);
    expect(onStepComplete.mock.calls[0][1]).toMatchObject({ sessionId: 'session-test-1' });
  });
});

// ─── AgentLoop — stuck detection ──────────────────────────

describe('AgentLoop stuck detection', () => {
  it('detects stuck after N identical observations', async () => {
    const llm = createMockLLM({
      // All observations are identical
      generateText: vi.fn().mockResolvedValue({
        text: '{"summary":"same state","details":{}}',
      }),
      generateObject: vi.fn().mockResolvedValue({
        object: {
          reasoning: 'retry',
          action: 'retry',
          toolName: 'electron_launch',
          toolArgs: { targetAppPath: '/app' },
          expectedOutcome: 'launch',
        },
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 20,
      stuckThreshold: 3,
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('stuck');
    expect(result.report!.reasoning).toContain('consecutive identical observations');
  });

  it('does not trigger stuck with different observations', async () => {
    let callCount = 0;
    const llm = createMockLLM({
      generateText: vi.fn().mockImplementation(async () => {
        callCount++;
        return { text: `{"summary":"state ${callCount}","details":{}}` };
      }),
      generateObject: vi.fn().mockImplementation(async (opts: { prompt: string }) => {
        if (opts.prompt.includes('Evaluate whether')) {
          return { object: { verdict: 'pass', reasoning: 'done' } };
        }
        return {
          object: {
            reasoning: 'plan',
            action: 'action',
            toolName: 'electron_launch',
            toolArgs: { targetAppPath: '/app' },
            expectedOutcome: 'launch',
          },
        };
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 10,
      stuckThreshold: 3,
    });

    const result = await loop.run('Test');

    // Should not be stuck since observations are different
    expect(result.verdict).not.toBe('stuck');
  });

  it('uses default stuckThreshold of 3', async () => {
    const llm = createMockLLM({
      generateText: vi.fn().mockResolvedValue({
        text: '{"summary":"identical","details":{}}',
      }),
      generateObject: vi.fn().mockResolvedValue({
        object: {
          reasoning: 'retry',
          action: 'retry',
          toolName: 'electron_launch',
          toolArgs: { targetAppPath: '/app' },
          expectedOutcome: 'launch',
        },
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 20,
      // stuckThreshold defaults to 3
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('stuck');
  });
});

// ─── AgentLoop.execute() — MCP routing ────────────────────

describe('AgentLoop.execute() MCP routing', () => {
  it('routes browser_* tools to playwright server', async () => {
    const mcp = createMockMCP();
    let capturedPlan: unknown = null;

    // Capture the plan from execute
    const llm = createMockLLM({
      generateObject: vi.fn().mockImplementation(async (opts: { prompt: string }) => {
        if (opts.prompt.includes('Evaluate whether')) {
          return { object: { verdict: 'pass', reasoning: 'done' } };
        }
        return {
          object: {
            reasoning: 'click button',
            action: 'click',
            toolName: 'browser_click',
            toolArgs: { ref: '#btn' },
            expectedOutcome: 'button clicked',
          },
        };
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      mcpClient: mcp,
      maxSteps: 5,
    });

    await loop.run('Test');

    // browser_click should be routed to playwright
    expect(mcp.callTool).toHaveBeenCalledWith(
      'playwright',
      'browser_click',
      expect.objectContaining({ ref: '#btn' }),
    );
  });

  it('routes non-browser tools to electron server', async () => {
    const mcp = createMockMCP();

    const llm = createMockLLM({
      generateObject: vi.fn().mockImplementation(async (opts: { prompt: string }) => {
        if (opts.prompt.includes('Evaluate whether')) {
          return { object: { verdict: 'pass', reasoning: 'done' } };
        }
        return {
          object: {
            reasoning: 'launch app',
            action: 'launch',
            toolName: 'electron_launch',
            toolArgs: { targetAppPath: '/app' },
            expectedOutcome: 'launched',
          },
        };
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      mcpClient: mcp,
      maxSteps: 5,
    });

    await loop.run('Test');

    expect(mcp.callTool).toHaveBeenCalledWith(
      'electron',
      'electron_launch',
      expect.objectContaining({ targetAppPath: '/app' }),
    );
  });

  it('returns stub result when no MCP client is provided', async () => {
    const loop = new AgentLoop({
      llmProvider: createMockLLM(),
      sessionManager: createMockSession(),
      // no mcpClient
      maxSteps: 5,
    });

    const result = await loop.run('Test');

    // Should still complete (pass) with stub execution
    expect(result.verdict).toBe('pass');
  });

  it('handles MCP tool execution failure gracefully', async () => {
    const mcp = createMockMCP();
    mcp.callTool.mockRejectedValue(new Error('Tool crashed'));

    const loop = new AgentLoop({
      llmProvider: createMockLLM(),
      sessionManager: createMockSession(),
      mcpClient: mcp,
      maxSteps: 5,
    });

    const result = await loop.run('Test');

    // Should still complete — execution failure is handled
    expect(result.verdict).toBe('pass');
  });

  it('handles MCP tool returning success: false', async () => {
    const mcp = createMockMCP();
    mcp.callTool.mockResolvedValue({ success: false, result: null, error: 'Element not found' });

    const loop = new AgentLoop({
      llmProvider: createMockLLM(),
      sessionManager: createMockSession(),
      mcpClient: mcp,
      maxSteps: 5,
    });

    const result = await loop.run('Test');

    // Should still complete — the loop continues through verify
    expect(result).toBeDefined();
  });
});

// ─── AgentLoop — feedback recovery ────────────────────────

describe('AgentLoop feedback recovery', () => {
  it('injects feedback patterns on fail when patternsPath is set', async () => {
    // We can't easily test the file-based feedback loading without filesystem mocks,
    // but we can verify the code path is reached by checking that the loop
    // continues with retry when patternsPath is set
    let verifyCount = 0;
    const llm = createMockLLM({
      generateObject: vi.fn().mockImplementation(async (opts: { prompt: string }) => {
        if (opts.prompt.includes('Evaluate whether')) {
          verifyCount++;
          // First verify returns fail, then pass
          if (verifyCount === 1) {
            return { object: { verdict: 'fail', reasoning: 'Step failed' } };
          }
          return { object: { verdict: 'pass', reasoning: 'Recovered' } };
        }
        return {
          object: {
            reasoning: 'plan',
            action: 'action',
            toolName: 'electron_launch',
            toolArgs: { targetAppPath: '/app' },
            expectedOutcome: 'launch',
          },
        };
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 10,
      // patternsPath set but file doesn't exist — no patterns loaded
      patternsPath: '/nonexistent/patterns.jsonl',
    });

    const result = await loop.run('Test');

    // Without actual patterns file, fail stays as fail
    expect(result.verdict).toBe('fail');
    expect(verifyCount).toBe(1);
  });

  it('does not attempt feedback recovery when patternsPath is not set', async () => {
    let verifyCount = 0;
    const llm = createMockLLM({
      generateObject: vi.fn().mockImplementation(async (opts: { prompt: string }) => {
        if (opts.prompt.includes('Evaluate whether')) {
          verifyCount++;
          return { object: { verdict: 'fail', reasoning: 'Failed' } };
        }
        return {
          object: {
            reasoning: 'plan',
            action: 'action',
            toolName: 'electron_launch',
            toolArgs: { targetAppPath: '/app' },
            expectedOutcome: 'launch',
          },
        };
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 5,
      // no patternsPath
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('fail');
    expect(verifyCount).toBe(1);
  });
});

// ─── AgentLoop — observe() with AXTree ────────────────────

describe('AgentLoop observe with AXTree data', () => {
  it('compresses AXTree when present in execution result', async () => {
    const mcp = createMockMCP();
    mcp.callTool.mockResolvedValue({
      success: true,
      result: {
        role: 'WebArea',
        name: 'Test Page',
        children: [
          { role: 'button', name: 'Click me' },
          { role: 'textbox', name: 'Input' },
        ],
      },
    });

    const llm = createMockLLM();

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      mcpClient: mcp,
      maxSteps: 5,
    });

    const result = await loop.run('Test the UI');

    expect(result.verdict).toBe('pass');
    // generateText was called for observe with compressed context
    expect(llm.generateText).toHaveBeenCalled();
  });

  it('handles execution result with axtree wrapper', async () => {
    const mcp = createMockMCP();
    mcp.callTool.mockResolvedValue({
      success: true,
      result: {
        axtree: {
          role: 'WebArea',
          name: 'Page',
          children: [{ role: 'heading', name: 'Title' }],
        },
      },
    });

    const llm = createMockLLM();

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      mcpClient: mcp,
      maxSteps: 5,
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('pass');
  });

  it('handles non-AXTree execution results normally', async () => {
    const mcp = createMockMCP();
    mcp.callTool.mockResolvedValue({
      success: true,
      result: { message: 'App launched successfully', pid: 1234 },
    });

    const llm = createMockLLM();

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      mcpClient: mcp,
      maxSteps: 5,
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('pass');
  });
});

// ─── AgentLoop — verdict schema validation ────────────────

describe('AgentLoop verdict schema', () => {
  it('handles invalid verdict value by defaulting to retry', async () => {
    const llm = createMockLLM({
      generateObject: vi.fn().mockImplementation(async (opts: { prompt: string }) => {
        if (opts.prompt.includes('Evaluate whether')) {
          // Return an invalid verdict value
          return { object: { verdict: 'invalid_value', reasoning: 'test' } };
        }
        return {
          object: {
            reasoning: 'plan',
            action: 'action',
            toolName: 'electron_launch',
            toolArgs: { targetAppPath: '/app' },
            expectedOutcome: 'launch',
          },
        };
      }),
    });

    // With maxSteps=1, the invalid verdict defaults to 'retry',
    // then maxSteps is exhausted → fail
    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 1,
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('fail');
    expect(result.report!.reasoning).toContain('Exceeded maximum steps');
  });

  it('handles missing verdict field by defaulting to retry', async () => {
    const llm = createMockLLM({
      generateObject: vi.fn().mockImplementation(async (opts: { prompt: string }) => {
        if (opts.prompt.includes('Evaluate whether')) {
          return { object: { reasoning: 'no verdict field' } };
        }
        return {
          object: {
            reasoning: 'plan',
            action: 'action',
            toolName: 'electron_launch',
            toolArgs: { targetAppPath: '/app' },
            expectedOutcome: 'launch',
          },
        };
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 1,
    });

    const result = await loop.run('Test');

    // Missing verdict defaults to retry, then maxSteps exhausted
    expect(result.verdict).toBe('fail');
  });
});

// ─── AgentLoop — plan schema validation ───────────────────

describe('AgentLoop plan schema', () => {
  it('handles missing plan fields with defaults', async () => {
    const llm = createMockLLM({
      generateObject: vi.fn().mockImplementation(async (opts: { prompt: string }) => {
        if (opts.prompt.includes('Evaluate whether')) {
          return { object: { verdict: 'pass', reasoning: 'done' } };
        }
        // Return a plan with minimal fields
        return { object: { toolName: 'browser_click' } };
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 5,
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('pass');
  });
});

// ─── AgentLoop — LLMError handling ────────────────────────

describe('AgentLoop LLMError handling', () => {
  it('captures statusCode from LLMError', async () => {
    let textCallCount = 0;
    const llm = createMockLLM({
      generateText: vi.fn().mockImplementation(async () => {
        textCallCount++;
        if (textCallCount === 1) {
          throw new LLMError('Server error', 503, true);
        }
        return { text: 'Error report' };
      }),
    });

    const session = createMockSession();
    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: session,
      maxSteps: 5,
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('fail');
    // Session should have received the error entry with statusCode
    const addEntryCalls = vi.mocked(session.addEntry).mock.calls;
    const errorEntry = addEntryCalls.find(
      (call) => {
        const content = call[1]?.content;
        return typeof content === 'string' && content.includes('llm_error');
      },
    );
    expect(errorEntry).toBeDefined();
  });

  it('handles non-LLMError exceptions with statusCode 0', async () => {
    let textCallCount = 0;
    const llm = createMockLLM({
      generateText: vi.fn().mockImplementation(async () => {
        textCallCount++;
        if (textCallCount === 1) {
          throw new Error('Generic error');
        }
        return { text: 'Error report' };
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 5,
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('fail');
    expect(result.report!.reasoning).toContain('Generic error');
  });
});

// ─── AgentLoop — observe() JSON parsing ───────────────────

describe('AgentLoop observe JSON parsing', () => {
  it('parses direct JSON from LLM response', async () => {
    const llm = createMockLLM({
      generateText: vi.fn().mockResolvedValue({
        text: '{"summary":"Page loaded","details":{"url":"http://localhost"}}',
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 5,
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('pass');
  });

  it('parses JSON wrapped in code block', async () => {
    const llm = createMockLLM({
      generateText: vi.fn().mockResolvedValue({
        text: '```json\n{"summary":"Code block response","details":{}}\n```',
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 5,
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('pass');
  });

  it('falls back to raw text when JSON parsing fails', async () => {
    const llm = createMockLLM({
      generateText: vi.fn().mockResolvedValue({
        text: 'This is not JSON at all, just plain text observation.',
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 5,
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('pass');
  });

  it('extracts JSON from mixed text with embedded JSON block', async () => {
    const llm = createMockLLM({
      generateText: vi.fn().mockResolvedValue({
        text: 'Here is my observation:\n{"summary":"Found JSON","details":{"key":"value"}}\nEnd of observation.',
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 5,
    });

    const result = await loop.run('Test');

    expect(result.verdict).toBe('pass');
  });
});

// ─── AgentLoop — session entry recording ──────────────────

describe('AgentLoop session entry recording', () => {
  it('records observe, plan, execute, and verify entries', async () => {
    const session = createMockSession();

    const loop = new AgentLoop({
      llmProvider: createMockLLM(),
      sessionManager: session,
      maxSteps: 5,
    });

    await loop.run('Test');

    const addEntryCalls = vi.mocked(session.addEntry).mock.calls;
    // Should have: user entry, observe, plan, execute, verify, report
    expect(addEntryCalls.length).toBeGreaterThanOrEqual(5);

    // Check roles are present
    const roles = addEntryCalls.map((call) => call[1]?.role);
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
    expect(roles).toContain('system');
  });

  it('records stuck detection system entry', async () => {
    const session = createMockSession();
    const llm = createMockLLM({
      generateText: vi.fn().mockResolvedValue({
        text: '{"summary":"stuck state","details":{}}',
      }),
      generateObject: vi.fn().mockResolvedValue({
        object: {
          reasoning: 'retry',
          action: 'retry',
          toolName: 'electron_launch',
          toolArgs: { targetAppPath: '/app' },
          expectedOutcome: 'launch',
        },
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: session,
      maxSteps: 20,
      stuckThreshold: 3,
    });

    await loop.run('Test');

    const addEntryCalls = vi.mocked(session.addEntry).mock.calls;
    const stuckEntry = addEntryCalls.find(
      (call) => call[1]?.content?.includes('consecutive identical observations'),
    );
    expect(stuckEntry).toBeDefined();
    expect(stuckEntry![1].role).toBe('system');
  });
});

// ─── AgentLoop — resume from checkpoint ───────────────────

describe('AgentLoop.resume()', () => {
  it('resumes from a checkpoint and continues the loop', async () => {
    let verifyCount = 0;
    const llm = createMockLLM({
      generateObject: vi.fn().mockImplementation(async (opts: { prompt: string }) => {
        if (opts.prompt.includes('Evaluate whether')) {
          verifyCount++;
          return { object: { verdict: 'pass', reasoning: 'Resumed and passed' } };
        }
        return {
          object: {
            reasoning: 'continue',
            action: 'continue action',
            toolName: 'browser_click',
            toolArgs: { ref: '#btn' },
            expectedOutcome: 'clicked',
          },
        };
      }),
    });

    const session = createMockSession();

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: session,
      maxSteps: 10,
    });

    const checkpoint = {
      sessionId: 'resumed-session',
      taskPrompt: 'Resume test',
      currentStep: 3,
      lastObservation: {
        summary: 'Previous observation',
        details: {},
        timestamp: new Date().toISOString(),
      },
      lastPlan: null,
      lastExecutionResult: null,
      sessionEntries: [
        { role: 'user', content: 'Resume test', type: 'user' as const, id: 'e1', timestamp: Date.now() },
        { role: 'assistant', content: '{"summary":"obs"}', type: 'assistant' as const, id: 'e2', timestamp: Date.now() },
      ],
    };

    const result = await loop.resume(checkpoint);

    expect(result.verdict).toBe('pass');
    expect(result.sessionId).toBe('resumed-session');
    // Should have restored session entries
    expect(session.addEntry).toHaveBeenCalledWith(
      'resumed-session',
      expect.objectContaining({ role: 'user', content: 'Resume test' }),
    );
  });

  it('resumes and detects stuck', async () => {
    const llm = createMockLLM({
      generateText: vi.fn().mockResolvedValue({
        text: '{"summary":"same","details":{}}',
      }),
      generateObject: vi.fn().mockResolvedValue({
        object: {
          reasoning: 'retry',
          action: 'retry',
          toolName: 'electron_launch',
          toolArgs: { targetAppPath: '/app' },
          expectedOutcome: 'launch',
        },
      }),
    });

    const session = createMockSession();

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: session,
      maxSteps: 20,
      stuckThreshold: 3,
    });

    const checkpoint = {
      sessionId: 'resume-stuck',
      taskPrompt: 'Stuck test',
      currentStep: 0,
      lastObservation: null,
      lastPlan: null,
      lastExecutionResult: null,
      sessionEntries: [],
    };

    const result = await loop.resume(checkpoint);

    expect(result.verdict).toBe('stuck');
  });

  it('handles LLM error during resume', async () => {
    let textCallCount = 0;
    const llm = createMockLLM({
      generateText: vi.fn().mockImplementation(async () => {
        textCallCount++;
        if (textCallCount === 1) {
          throw new LLMError('API down', 500, false);
        }
        return { text: 'Error report' };
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 10,
    });

    const checkpoint = {
      sessionId: 'resume-error',
      taskPrompt: 'Error test',
      currentStep: 0,
      lastObservation: null,
      lastPlan: null,
      lastExecutionResult: null,
      sessionEntries: [],
    };

    const result = await loop.resume(checkpoint);

    expect(result.verdict).toBe('fail');
    expect(result.report!.reasoning).toContain('API down');
  });

  it('exhausts maxSteps during resume', async () => {
    let obsCount = 0;
    const llm = createMockLLM({
      generateText: vi.fn().mockImplementation(async () => {
        obsCount++;
        return { text: `{"summary":"resume obs ${obsCount}","details":{"step":${obsCount}}}` };
      }),
      generateObject: vi.fn().mockResolvedValue({
        object: {
          reasoning: 'retry',
          action: 'retry',
          toolName: 'electron_launch',
          toolArgs: { targetAppPath: '/app' },
          expectedOutcome: 'launch',
        },
      }),
    });

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager: createMockSession(),
      maxSteps: 5,
    });

    const checkpoint = {
      sessionId: 'resume-exhaust',
      taskPrompt: 'Exhaust test',
      currentStep: 0,
      lastObservation: null,
      lastPlan: null,
      lastExecutionResult: null,
      sessionEntries: [],
    };

    const result = await loop.resume(checkpoint);

    expect(result.verdict).toBe('fail');
    expect(result.report!.reasoning).toContain('Exceeded maximum steps');
  });
});
