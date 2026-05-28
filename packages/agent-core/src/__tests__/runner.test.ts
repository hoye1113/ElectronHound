import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks (accessible from vi.mock factories) ──────────────────────

const {
  mockGenerateText,
  mockGenerateObject,
  mockProvider,
  mockMCPCtor,
  mockSessionManagerCtor,
  mockRunAuditChain,
} = vi.hoisted(() => {
  const mockGenerateText = vi.fn();
  const mockGenerateObject = vi.fn();
  const mockProvider = {
    generateText: mockGenerateText,
    generateObject: mockGenerateObject,
  };
  return {
    mockGenerateText,
    mockGenerateObject,
    mockProvider,
    mockMCPCtor: vi.fn(),
    mockSessionManagerCtor: vi.fn(),
    mockRunAuditChain: vi.fn(),
  };
});

// ── Module-level mocks ─────────────────────────────────────────────────────

vi.mock('../llm/adapter.js', () => ({
  createLLMProviderAdapter: vi.fn(() => {
    if (!process.env.OPENAI_API_KEY) return null;
    return mockProvider;
  }),
  createLLMProviderAdapterForProvider: vi.fn(() => mockProvider),
}));

vi.mock('../mcp/client.js', () => ({
  MCPClient: mockMCPCtor,
}));

vi.mock('../session/sessionManager.js', () => ({
  SessionManager: mockSessionManagerCtor,
}));

vi.mock('../sub-agents/audit-chain.js', () => ({
  runAuditChain: mockRunAuditChain,
}));

// ── Import under test (after mocks) ────────────────────────────────────────

import { runTest } from '../runner.js';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('runTest', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-test-fake-key';
    // No OPENAI_BASE_URL needed -- provider is fully mocked

    // ── Mock LLM: observe -> plan -> verify(pass) -> report ──
    mockGenerateText.mockImplementation(async () => ({
      text: JSON.stringify({ summary: 'test observation', details: {} }),
    }));

    mockGenerateObject.mockImplementation(async (opts: { system?: string }) => {
      // Verify phase: return 'pass' so the loop exits after one iteration
      if (opts.system?.includes('verification agent')) {
        return { object: { verdict: 'pass', reasoning: 'goal achieved' } };
      }
      // Plan phase: return a valid plan
      return {
        object: {
          reasoning: 'test plan',
          action: 'test action',
          toolName: 'browser_click',
          toolArgs: { ref: '1' },
          expectedOutcome: 'element clicked',
        },
      };
    });

    // ── Mock MCP: no-op connect/disconnect, stubbed callTool ──
    mockMCPCtor.mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockResolvedValue({ success: true, result: null }),
    }));

    // ── Mock SessionManager: in-memory store ──
    const sessions = new Map<
      string,
      {
        id: string;
        agentId: string;
        taskPrompt: string;
        entries: Array<{
          id: string;
          sessionId: string;
          timestamp: string;
          role: string;
          content: string;
          type: string;
        }>;
        createdAt: string;
      }
    >();
    mockSessionManagerCtor.mockImplementation(() => ({
      createSession: vi.fn((agentId: string, taskPrompt: string) => {
        const id = crypto.randomUUID();
        sessions.set(id, {
          id,
          agentId,
          taskPrompt,
          entries: [],
          createdAt: new Date().toISOString(),
        });
        return id;
      }),
      addEntry: vi.fn(
        (
          sessionId: string,
          entry: { role: string; content: string; type: string },
        ) => {
          const session = sessions.get(sessionId);
          if (session) {
            session.entries.push({
              id: crypto.randomUUID(),
              sessionId,
              timestamp: new Date().toISOString(),
              ...entry,
            });
          }
        },
      ),
      getSession: vi.fn(
        (sessionId: string) => sessions.get(sessionId) ?? null,
      ),
    }));

    // ── Mock audit chain: skip sub-agent pipeline ──
    mockRunAuditChain.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it('throws when no LLM provider is available', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(
      runTest({
        goal: 'Test',
        targetAppPath: '/test/app',
        maxSteps: 5,
        taskId: 'no-key-test',
      }),
    ).rejects.toThrow('No LLM provider available');
  });

  it('respects maxSteps option', async () => {
    const result = await runTest({
      goal: 'Test low max steps',
      targetAppPath: '/test/app',
      maxSteps: 2,
      taskId: 'test-runner-3',
    });
    expect(result.status).not.toBe('running');
  });

  it('generates taskId when not provided', async () => {
    const result = await runTest({
      goal: 'Auto-generated ID',
      targetAppPath: '/test/app',
      maxSteps: 5,
    });
    expect(result.taskId).toBeDefined();
    expect(result.taskId.length).toBeGreaterThan(0);
  });

  it('returns RunTestResult with correct shape on success', async () => {
    const result = await runTest({
      goal: 'Shape test',
      targetAppPath: '/test/app',
      maxSteps: 5,
      taskId: 'shape-test',
    });
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('stepCount');
    expect(result).toHaveProperty('goal');
    expect(result).toHaveProperty('taskId');
    expect(['completed', 'failed', 'aborted']).toContain(result.status);
  });
});

describe('runTest with providerId', () => {
  it('throws when providerId not found', async () => {
    await expect(
      runTest({
        goal: 'Test',
        targetAppPath: '/test/app',
        providerId: 'nonexistent-provider-id',
        taskId: 'provider-test-1',
      }),
    ).rejects.toThrow("Provider 'nonexistent-provider-id' not found");
  });
});

describe('runTest without API key', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when no API key and no providerId', async () => {
    await expect(
      runTest({
        goal: 'No key test',
        targetAppPath: '/test/app',
        maxSteps: 5,
        taskId: 'no-key-test',
      }),
    ).rejects.toThrow('No LLM provider available');
  });
});
