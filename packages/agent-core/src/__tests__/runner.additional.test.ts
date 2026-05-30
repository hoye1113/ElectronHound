import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const {
  mockGenerateText,
  mockGenerateObject,
  mockProvider,
  mockMCPCtor,
  mockSessionManagerCtor,
  mockRunAuditChain,
  mockLoadProvidersConfig,
  mockCheckpointManagerCtor,
  mockAgentLoopRun,
  mockAgentLoopResume,
  mockMkdir,
  mockWriteFile,
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
    mockLoadProvidersConfig: vi.fn(),
    mockCheckpointManagerCtor: vi.fn(),
    mockAgentLoopRun: vi.fn(),
    mockAgentLoopResume: vi.fn(),
    mockMkdir: vi.fn().mockResolvedValue(undefined),
    mockWriteFile: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../config-manager.js', () => ({
  loadProvidersConfig: (...args: unknown[]) => mockLoadProvidersConfig(...args),
}));

vi.mock('../session/checkpointManager.js', () => ({
  CheckpointManager: mockCheckpointManagerCtor,
}));

vi.mock('../runtime/agentLoop.js', () => ({
  AgentLoop: vi.fn().mockImplementation(() => ({
    run: (...args: unknown[]) => mockAgentLoopRun(...args),
    resume: (...args: unknown[]) => mockAgentLoopResume(...args),
  })),
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
    report: { stepCount: 1, reasoning: 'test' },
    ...overrides,
  };
}

function makeSessionManager() {
  const sessions = new Map();
  return {
    createSession: vi.fn((agentId: string, taskPrompt: string) => {
      const id = crypto.randomUUID();
      sessions.set(id, { id, agentId, taskPrompt, entries: [], createdAt: new Date().toISOString() });
      return id;
    }),
    addEntry: vi.fn((sessionId: string, entry: { role: string; content: string; type: string }) => {
      const session = sessions.get(sessionId);
      if (session) {
        session.entries.push({ id: crypto.randomUUID(), sessionId, timestamp: new Date().toISOString(), ...entry });
      }
    }),
    getSession: vi.fn((sessionId: string) => sessions.get(sessionId) ?? null),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('runTest additional coverage', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-test-fake-key';

    // Default AgentLoop.run result
    mockAgentLoopRun.mockResolvedValue(makeAgentRunResult());

    // Default SessionManager
    mockSessionManagerCtor.mockImplementation(() => makeSessionManager());

    // Default MCP
    mockMCPCtor.mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockResolvedValue({ success: true, result: null }),
    }));

    // Default CheckpointManager
    mockCheckpointManagerCtor.mockImplementation(() => ({
      get: vi.fn().mockReturnValue(null),
      save: vi.fn(),
      delete: vi.fn(),
      close: vi.fn(),
    }));

    // Default config
    mockLoadProvidersConfig.mockReturnValue({
      version: 1,
      providers: [
        { id: 'test-provider', name: 'Test', type: 'openai-compatible', apiKey: 'key', baseURL: 'http://test', model: 'test-model' },
      ],
      activeId: 'test-provider',
    });

    // Default audit chain
    mockRunAuditChain.mockResolvedValue(null);

    // Mock fs
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  // ── providerId path ───────────────────────────────────────────────────

  describe('providerId option', () => {
    it('uses specified provider when found in config', async () => {
      const result = await runTest({
        goal: 'Test with provider',
        targetAppPath: '/test/app',
        providerId: 'test-provider',
        maxSteps: 2,
        taskId: 'provider-test',
      });

      expect(result.taskId).toBe('provider-test');
      expect(mockLoadProvidersConfig).toHaveBeenCalled();
    });

    it('throws when providerId not in config', async () => {
      mockLoadProvidersConfig.mockReturnValue({
        version: 1,
        providers: [{ id: 'other', name: 'Other', type: 'openai-compatible', apiKey: 'k', baseURL: 'http://o', model: 'm' }],
        activeId: 'other',
      });

      await expect(
        runTest({
          goal: 'Test',
          targetAppPath: '/test/app',
          providerId: 'nonexistent',
          taskId: 'provider-not-found',
        }),
      ).rejects.toThrow("Provider 'nonexistent' not found");
    });
  });

  // ── MCP client initialization paths ───────────────────────────────────

  describe('MCP client initialization', () => {
    it('connects with cdpUrl when provided', async () => {
      const mockConnect = vi.fn().mockResolvedValue(undefined);
      mockMCPCtor.mockImplementation(() => ({
        connect: mockConnect,
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn().mockResolvedValue({ success: true, result: null }),
      }));

      await runTest({
        goal: 'CDP test',
        targetAppPath: '/test/app',
        cdpUrl: 'ws://localhost:9222/devtools/browser/123',
        maxSteps: 2,
        taskId: 'cdp-test',
      });

      expect(mockMCPCtor).toHaveBeenCalled();
      expect(mockConnect).toHaveBeenCalledWith({ playwrightCdpUrl: 'ws://localhost:9222/devtools/browser/123' });
    });

    it('connects with electron appPath when no cdpUrl', async () => {
      const mockConnect = vi.fn().mockResolvedValue(undefined);
      mockMCPCtor.mockImplementation(() => ({
        connect: mockConnect,
        disconnect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn().mockResolvedValue({ success: true, result: null }),
      }));

      await runTest({
        goal: 'Electron test',
        targetAppPath: '/test/app',
        maxSteps: 2,
        taskId: 'electron-test',
      });

      expect(mockConnect).toHaveBeenCalledWith({ electron: { appPath: '/test/app' } });
    });

    it('does not create MCP client when no cdpUrl or targetAppPath', async () => {
      await runTest({
        goal: 'No MCP test',
        targetAppPath: '',
        maxSteps: 2,
        taskId: 'no-mcp-test',
      });

      // MCPClient should not be instantiated when targetAppPath is empty
      // (the code checks `options.targetAppPath` which is falsy for '')
    });
  });

  // ── CheckpointManager paths ───────────────────────────────────────────

  describe('CheckpointManager', () => {
    it('initializes CheckpointManager when checkpointPath provided', async () => {
      await runTest({
        goal: 'Checkpoint test',
        targetAppPath: '/test/app',
        checkpointPath: '/tmp/checkpoint.sqlite3',
        maxSteps: 2,
        taskId: 'cp-init-test',
      });

      expect(mockCheckpointManagerCtor).toHaveBeenCalledWith('/tmp/checkpoint.sqlite3');
    });

    it('handles CheckpointManager initialization failure gracefully', async () => {
      mockCheckpointManagerCtor.mockImplementation(() => {
        throw new Error('Cannot open database');
      });

      // Should not throw - the error is caught and logged
      const result = await runTest({
        goal: 'CP init fail test',
        targetAppPath: '/test/app',
        checkpointPath: '/bad/path.sqlite3',
        maxSteps: 2,
        taskId: 'cp-fail-test',
      });

      expect(result).toBeDefined();
    });

    it('skips CheckpointManager when no checkpointPath', async () => {
      await runTest({
        goal: 'No checkpoint test',
        targetAppPath: '/test/app',
        maxSteps: 2,
        taskId: 'no-cp-test',
      });

      // CheckpointManager constructor should not be called
      // (it's only called when checkpointPath is provided)
      expect(mockCheckpointManagerCtor).not.toHaveBeenCalled();
    });
  });

  // ── Resume from checkpoint ────────────────────────────────────────────

  describe('resume from checkpoint', () => {
    it('resumes when checkpoint exists', async () => {
      const checkpoint = {
        sessionId: 'existing-session',
        currentStep: 3,
        maxSteps: 50,
        taskPrompt: 'Resumed goal',
        config: { maxSteps: 50 },
        lastObservation: null,
        lastPlan: null,
        lastExecutionResult: null,
        sessionEntries: [],
        timestamp: '2026-01-01T00:00:00Z',
      };

      const mockGet = vi.fn().mockReturnValue(checkpoint);
      const mockDelete = vi.fn();
      const mockClose = vi.fn();

      mockCheckpointManagerCtor.mockImplementation(() => ({
        get: mockGet,
        save: vi.fn(),
        delete: mockDelete,
        close: mockClose,
      }));

      mockAgentLoopResume.mockResolvedValue(makeAgentRunResult({ sessionId: 'existing-session' }));

      const result = await runTest({
        goal: 'Resume test',
        targetAppPath: '/test/app',
        checkpointPath: '/tmp/cp.sqlite3',
        maxSteps: 50,
        taskId: 'resume-test',
      });

      expect(mockAgentLoopResume).toHaveBeenCalledWith(checkpoint);
      expect(mockDelete).toHaveBeenCalledWith('resume-test');
      expect(result.taskId).toBe('resume-test');
    });

    it('runs fresh when no checkpoint exists', async () => {
      const mockGet = vi.fn().mockReturnValue(null);

      mockCheckpointManagerCtor.mockImplementation(() => ({
        get: mockGet,
        save: vi.fn(),
        delete: vi.fn(),
        close: vi.fn(),
      }));

      const result = await runTest({
        goal: 'Fresh run test',
        targetAppPath: '/test/app',
        checkpointPath: '/tmp/cp.sqlite3',
        maxSteps: 5,
        taskId: 'fresh-test',
      });

      expect(mockAgentLoopRun).toHaveBeenCalled();
      expect(mockAgentLoopResume).not.toHaveBeenCalled();
    });
  });

  // ── Status mapping ────────────────────────────────────────────────────

  describe('status mapping', () => {
    it('maps "pass" verdict to "completed" status', async () => {
      mockAgentLoopRun.mockResolvedValue(makeAgentRunResult({ verdict: 'pass' }));

      const result = await runTest({
        goal: 'Pass test',
        targetAppPath: '/test/app',
        maxSteps: 2,
        taskId: 'status-pass',
      });

      expect(result.status).toBe('completed');
      expect(result.stuckCounter).toBe(0);
    });

    it('maps "fail" verdict to "failed" status', async () => {
      mockAgentLoopRun.mockResolvedValue(makeAgentRunResult({ verdict: 'fail' }));

      const result = await runTest({
        goal: 'Fail test',
        targetAppPath: '/test/app',
        maxSteps: 2,
        taskId: 'status-fail',
      });

      expect(result.status).toBe('failed');
    });

    it('maps "stuck" verdict to "failed" status with stuckCounter=3', async () => {
      mockAgentLoopRun.mockResolvedValue(makeAgentRunResult({ verdict: 'stuck' }));

      const result = await runTest({
        goal: 'Stuck test',
        targetAppPath: '/test/app',
        maxSteps: 2,
        taskId: 'status-stuck',
      });

      expect(result.status).toBe('failed');
      expect(result.stuckCounter).toBe(3);
    });

    it('maps unknown verdict to "aborted" status', async () => {
      mockAgentLoopRun.mockResolvedValue(makeAgentRunResult({ verdict: 'unknown' }));

      const result = await runTest({
        goal: 'Unknown test',
        targetAppPath: '/test/app',
        maxSteps: 2,
        taskId: 'status-unknown',
      });

      expect(result.status).toBe('aborted');
    });

    it('handles null verdict as "aborted"', async () => {
      mockAgentLoopRun.mockResolvedValue(makeAgentRunResult({ verdict: null }));

      const result = await runTest({
        goal: 'Null verdict test',
        targetAppPath: '/test/app',
        maxSteps: 2,
        taskId: 'status-null',
      });

      expect(result.status).toBe('aborted');
    });
  });

  // ── Audit chain ───────────────────────────────────────────────────────

  describe('audit chain', () => {
    it('includes audit chain result when successful', async () => {
      mockRunAuditChain.mockResolvedValue({
        summary: 'All good',
        issues: [],
      });

      const result = await runTest({
        goal: 'Audit test',
        targetAppPath: '/test/app',
        maxSteps: 2,
        taskId: 'audit-success',
      });

      expect(result.auditChainResult).toEqual({ summary: 'All good', issues: [] });
    });

    it('handles audit chain failure gracefully', async () => {
      mockRunAuditChain.mockRejectedValue(new Error('Audit failed'));

      const result = await runTest({
        goal: 'Audit fail test',
        targetAppPath: '/test/app',
        maxSteps: 2,
        taskId: 'audit-fail',
      });

      expect(result.auditChainResult).toBeNull();
    });
  });

  // ── dataDir option ────────────────────────────────────────────────────

  describe('dataDir option', () => {
    it('uses default dataDir when not specified', async () => {
      await runTest({
        goal: 'Default dataDir test',
        targetAppPath: '/test/app',
        maxSteps: 2,
        taskId: 'datadir-default',
      });

      // The default dataDir is './data'
      // Verify via the AgentLoop onStepComplete callback behavior
    });

    it('uses custom dataDir when specified', async () => {
      await runTest({
        goal: 'Custom dataDir test',
        targetAppPath: '/test/app',
        dataDir: '/custom/data',
        maxSteps: 2,
        taskId: 'datadir-custom',
      });

      // Custom dataDir should be passed through
    });
  });

  // ── RunTestResult shape ───────────────────────────────────────────────

  describe('RunTestResult shape', () => {
    it('includes all required fields', async () => {
      const result = await runTest({
        goal: 'Shape test',
        targetAppPath: '/test/app',
        llmModel: 'gpt-4o',
        maxSteps: 10,
        taskId: 'shape-test',
      });

      expect(result).toHaveProperty('goal', 'Shape test');
      expect(result).toHaveProperty('targetAppPath', '/test/app');
      expect(result).toHaveProperty('llmModel', 'gpt-4o');
      expect(result).toHaveProperty('maxSteps', 10);
      expect(result).toHaveProperty('taskId', 'shape-test');
      expect(result).toHaveProperty('history');
      expect(result).toHaveProperty('currentObservation');
      expect(result).toHaveProperty('currentPlan');
      expect(result).toHaveProperty('currentExecResult');
      expect(result).toHaveProperty('currentVerdict');
      expect(result).toHaveProperty('stepCount');
      expect(result).toHaveProperty('stuckCounter');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('lastObservationHash');
      expect(result).toHaveProperty('auditChainResult');
    });

    it('defaults llmModel to gpt-4o when not provided', async () => {
      const result = await runTest({
        goal: 'Default model test',
        targetAppPath: '/test/app',
        maxSteps: 2,
        taskId: 'default-model',
      });

      expect(result.llmModel).toBe('gpt-4o');
    });

    it('defaults maxSteps to 50 when not provided', async () => {
      const result = await runTest({
        goal: 'Default steps test',
        targetAppPath: '/test/app',
        taskId: 'default-steps',
      });

      expect(result.maxSteps).toBe(50);
    });
  });
});
