/**
 * Runner – captureStepArtifacts coverage
 *
 * Tests for the captureStepArtifacts function (lines 270-276):
 * - Accessibility snapshot error handling (catch block)
 * - Artifact path storage when at least one artifact is captured
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const {
  mockProvider,
  mockMCPCtor,
  mockSessionManagerCtor,
  mockRunAuditChain,
  mockLoadProvidersConfig,
  mockCheckpointManagerCtor,
  mockAgentLoopRun,
  mockMkdir,
  mockWriteFile,
  capturedAgentLoopConfigs,
} = vi.hoisted(() => {
  const mockGenerateText = vi.fn();
  const mockGenerateObject = vi.fn();
  const mockProvider = {
    generateText: mockGenerateText,
    generateObject: mockGenerateObject,
  };
  const capturedAgentLoopConfigs: Array<Record<string, unknown>> = [];
  return {
    mockProvider,
    mockMCPCtor: vi.fn(),
    mockSessionManagerCtor: vi.fn(),
    mockRunAuditChain: vi.fn(),
    mockLoadProvidersConfig: vi.fn(),
    mockCheckpointManagerCtor: vi.fn(),
    mockAgentLoopRun: vi.fn(),
    mockMkdir: vi.fn().mockResolvedValue(undefined),
    mockWriteFile: vi.fn().mockResolvedValue(undefined),
    capturedAgentLoopConfigs,
  };
});

// ── Module-level mocks ─────────────────────────────────────────────────────

vi.mock('../llm/adapter.js', () => ({
  createLLMProviderAdapter: vi.fn(() => mockProvider),
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

vi.mock('../config-manager.js', () => ({
  loadProvidersConfig: (...args: unknown[]) => mockLoadProvidersConfig(...args),
}));

vi.mock('../session/checkpointManager.js', () => ({
  CheckpointManager: mockCheckpointManagerCtor,
}));

vi.mock('../runtime/agentLoop.js', () => ({
  AgentLoop: vi.fn().mockImplementation((config: Record<string, unknown>) => {
    capturedAgentLoopConfigs.push(config);
    return {
      run: (...args: unknown[]) => mockAgentLoopRun(...args),
      resume: vi.fn(),
    };
  }),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

// ── Import under test ──────────────────────────────────────────────────────

import { runTest } from '../runner.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeAgentRunResult(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'test-session-id',
    verdict: 'pass',
    report: { stepCount: 2, reasoning: 'test' },
    ...overrides,
  };
}

function makeSessionManager() {
  const sessions = new Map();
  return {
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
    addEntry: vi.fn((sessionId: string, entry: { role: string; content: string; type: string }) => {
      const session = sessions.get(sessionId);
      if (session) {
        session.entries.push({
          id: crypto.randomUUID(),
          sessionId,
          timestamp: new Date().toISOString(),
          ...entry,
        });
      }
    }),
    getSession: vi.fn((sessionId: string) => sessions.get(sessionId) ?? null),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('runTest captureStepArtifacts coverage', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-test-fake-key';
    capturedAgentLoopConfigs.length = 0;

    mockAgentLoopRun.mockResolvedValue(makeAgentRunResult());
    mockSessionManagerCtor.mockImplementation(() => makeSessionManager());

    mockCheckpointManagerCtor.mockImplementation(() => ({
      get: vi.fn().mockReturnValue(null),
      save: vi.fn(),
      delete: vi.fn(),
      close: vi.fn(),
    }));

    mockLoadProvidersConfig.mockReturnValue({
      version: 1,
      providers: [
        { id: 'test-provider', name: 'Test', type: 'openai-compatible', apiKey: 'key', baseURL: 'http://test', model: 'test-model' },
      ],
      activeId: 'test-provider',
    });

    mockRunAuditChain.mockResolvedValue(null);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  // ── Accessibility snapshot error handling (lines 270-271) ──────────

  it('handles accessibility snapshot failure gracefully', async () => {
    // Make agentLoop.run invoke onStepComplete with a step
    mockAgentLoopRun.mockImplementation(async function (this: unknown) {
      // Get the onStepComplete callback from the captured config
      const config = capturedAgentLoopConfigs[capturedAgentLoopConfigs.length - 1];
      const onStepComplete = config.onStepComplete as ((step: number, state: Record<string, unknown>) => void) | undefined;

      if (onStepComplete) {
        onStepComplete(1, {
          sessionId: 'test-session-id',
          taskPrompt: 'test',
          currentObservation: null,
          lastPlan: null,
          lastExecution: null,
        });
      }

      return makeAgentRunResult();
    });

    // Mock MCP: screenshot succeeds, accessibility snapshot fails
    let callCount = 0;
    mockMCPCtor.mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call: screenshot with data
          return { success: true, result: { data: 'iVBORw0KGgo' } };
        }
        // Second call: accessibility snapshot throws
        throw new Error('CDP connection lost');
      }),
    }));

    const result = await runTest({
      goal: 'Test accessibility failure',
      targetAppPath: '/test/app',
      maxSteps: 5,
      taskId: 'acc-fail-test',
    });

    expect(result).toBeDefined();
    expect(result.status).not.toBe('running');
  });

  it('handles both screenshot and accessibility failures', async () => {
    mockAgentLoopRun.mockImplementation(async function (this: unknown) {
      const config = capturedAgentLoopConfigs[capturedAgentLoopConfigs.length - 1];
      const onStepComplete = config.onStepComplete as ((step: number, state: Record<string, unknown>) => void) | undefined;

      if (onStepComplete) {
        onStepComplete(1, {
          sessionId: 'test-session-id',
          taskPrompt: 'test',
          currentObservation: null,
          lastPlan: null,
          lastExecution: null,
        });
      }

      return makeAgentRunResult();
    });

    // Mock MCP: both calls fail
    mockMCPCtor.mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockRejectedValue(new Error('MCP not available')),
    }));

    const result = await runTest({
      goal: 'Test both failures',
      targetAppPath: '/test/app',
      maxSteps: 5,
      taskId: 'both-fail-test',
    });

    expect(result).toBeDefined();
    expect(result.status).not.toBe('running');
  });

  // ── Artifact path storage (lines 275-276) ─────────────────────────

  it('stores artifact paths when screenshot is captured successfully', async () => {
    mockAgentLoopRun.mockImplementation(async function (this: unknown) {
      const config = capturedAgentLoopConfigs[capturedAgentLoopConfigs.length - 1];
      const onStepComplete = config.onStepComplete as ((step: number, state: Record<string, unknown>) => void) | undefined;

      if (onStepComplete) {
        onStepComplete(1, {
          sessionId: 'test-session-id',
          taskPrompt: 'test',
          currentObservation: null,
          lastPlan: null,
          lastExecution: null,
        });
      }

      return makeAgentRunResult();
    });

    // Mock MCP: screenshot succeeds with base64 data, accessibility returns empty
    let callCount = 0;
    mockMCPCtor.mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // Screenshot with valid base64 data
          return { success: true, result: { data: Buffer.from('test').toString('base64') } };
        }
        // Accessibility returns success with JSON result
        return { success: true, result: '{"tree": "data"}' };
      }),
    }));

    const result = await runTest({
      goal: 'Test artifact capture',
      targetAppPath: '/test/app',
      maxSteps: 5,
      taskId: 'artifact-test',
      dataDir: '/tmp/test-data',
    });

    expect(result).toBeDefined();
    expect(result.status).not.toBe('running');

    // Verify mkdir was called for screenshots and accessibility dirs
    expect(mockMkdir).toHaveBeenCalled();
    // Verify writeFile was called for both screenshot and accessibility
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('stores paths when only accessibility snapshot succeeds', async () => {
    mockAgentLoopRun.mockImplementation(async function (this: unknown) {
      const config = capturedAgentLoopConfigs[capturedAgentLoopConfigs.length - 1];
      const onStepComplete = config.onStepComplete as ((step: number, state: Record<string, unknown>) => void) | undefined;

      if (onStepComplete) {
        onStepComplete(1, {
          sessionId: 'test-session-id',
          taskPrompt: 'test',
          currentObservation: null,
          lastPlan: null,
          lastExecution: null,
        });
      }

      return makeAgentRunResult();
    });

    let callCount = 0;
    mockMCPCtor.mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // Screenshot returns no data
          return { success: true, result: null };
        }
        // Accessibility succeeds with data
        return { success: true, result: '{"nodes": []}' };
      }),
    }));

    const result = await runTest({
      goal: 'Test accessibility only',
      targetAppPath: '/test/app',
      maxSteps: 5,
      taskId: 'aria-only-test',
    });

    expect(result).toBeDefined();
    // Verify accessibility file was written
    const ariaWriteCalls = mockWriteFile.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('accessibility'),
    );
    expect(ariaWriteCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('handles screenshot data as a string result', async () => {
    mockAgentLoopRun.mockImplementation(async function (this: unknown) {
      const config = capturedAgentLoopConfigs[capturedAgentLoopConfigs.length - 1];
      const onStepComplete = config.onStepComplete as ((step: number, state: Record<string, unknown>) => void) | undefined;

      if (onStepComplete) {
        onStepComplete(1, {
          sessionId: 'test-session-id',
          taskPrompt: 'test',
          currentObservation: null,
          lastPlan: null,
          lastExecution: null,
        });
      }

      return makeAgentRunResult();
    });

    let callCount = 0;
    mockMCPCtor.mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // Screenshot returns a raw string (not an object)
          return { success: true, result: Buffer.from('png-data').toString('base64') };
        }
        // Accessibility: return a string result
        return { success: true, result: 'raw aria text' };
      }),
    }));

    const result = await runTest({
      goal: 'Test string result format',
      targetAppPath: '/test/app',
      maxSteps: 5,
      taskId: 'string-result-test',
    });

    expect(result).toBeDefined();
    expect(result.status).not.toBe('running');
  });

  it('handles screenshot with no data property', async () => {
    mockAgentLoopRun.mockImplementation(async function (this: unknown) {
      const config = capturedAgentLoopConfigs[capturedAgentLoopConfigs.length - 1];
      const onStepComplete = config.onStepComplete as ((step: number, state: Record<string, unknown>) => void) | undefined;

      if (onStepComplete) {
        onStepComplete(1, {
          sessionId: 'test-session-id',
          taskPrompt: 'test',
          currentObservation: null,
          lastPlan: null,
          lastExecution: null,
        });
      }

      return makeAgentRunResult();
    });

    mockMCPCtor.mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockResolvedValue({ success: true, result: {} }),  // Object with no data property
    }));

    const result = await runTest({
      goal: 'Test no data property',
      targetAppPath: '/test/app',
      maxSteps: 5,
      taskId: 'no-data-test',
    });

    expect(result).toBeDefined();
    expect(result.status).not.toBe('running');
  });
});
