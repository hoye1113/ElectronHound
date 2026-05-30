import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process for daemon process management
const mockChildProcess = {
  pid: 12345,
  stdin: { write: vi.fn(), end: vi.fn() },
  stdout: { on: vi.fn(), pipe: vi.fn() },
  stderr: { on: vi.fn() },
  kill: vi.fn(),
  on: vi.fn(),
  connected: true,
};

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => mockChildProcess),
}));

// Mock MCP SDK
const mockTransportInstances: Array<{
  start: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  params: unknown;
}> = [];

const mockClientInstances: Array<{
  connect: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  info: { name: string; version: string };
}> = [];

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation((params: unknown) => {
    const instance = {
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      params,
    };
    mockTransportInstances.push(instance);
    return instance;
  }),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation((info: { name: string; version: string }) => {
    const instance = {
      connect: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'mock-tool-result' }],
      }),
      close: vi.fn().mockResolvedValue(undefined),
      info,
    };
    mockClientInstances.push(instance);
    return instance;
  }),
}));

// Import after mocks
const { MCPDaemonManager } = await import('../mcp/daemon.js');

describe('MCPDaemonManager', () => {
  let daemonManager: InstanceType<typeof MCPDaemonManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransportInstances.length = 0;
    mockClientInstances.length = 0;
    mockChildProcess.kill.mockReset();
    mockChildProcess.on.mockReset();
    mockChildProcess.stdin.write.mockReset();

    // Reset connected state
    mockChildProcess.connected = true;

    daemonManager = new MCPDaemonManager({
      shutdownTimeoutMs: 1000,
      healthCheckIntervalMs: 5000,
    });
  });

  afterEach(async () => {
    await daemonManager.shutdown().catch(() => {});
  });

  describe('Daemon lifecycle', () => {
    it('starts daemon process on first request', async () => {
      const { spawn } = await import('node:child_process');

      await daemonManager.ensureDaemon();

      expect(spawn).toHaveBeenCalledWith(
        'npx',
        ['@playwright/mcp', '--headless', '--daemon'],
        expect.objectContaining({
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      );
      expect(daemonManager.isRunning()).toBe(true);
    });

    it('reuses existing daemon on subsequent requests', async () => {
      const { spawn } = await import('node:child_process');

      await daemonManager.ensureDaemon();
      await daemonManager.ensureDaemon();
      await daemonManager.ensureDaemon();

      // Should only spawn once
      expect(spawn).toHaveBeenCalledTimes(1);
    });

    it('tracks daemon PID', async () => {
      await daemonManager.ensureDaemon();

      expect(daemonManager.getDaemonPid()).toBe(12345);
    });

    it('returns null PID when daemon is not running', () => {
      expect(daemonManager.getDaemonPid()).toBeNull();
    });

    it('shuts down daemon process gracefully', async () => {
      await daemonManager.ensureDaemon();
      await daemonManager.shutdown();

      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(daemonManager.isRunning()).toBe(false);
    });

    it('handles daemon crash and allows restart', async () => {
      const { spawn } = await import('node:child_process');

      await daemonManager.ensureDaemon();

      // Simulate daemon crash
      const exitHandler = mockChildProcess.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'exit',
      )?.[1] as ((...args: unknown[]) => void) | undefined;

      expect(exitHandler).toBeDefined();

      // Trigger exit handler
      if (exitHandler) {
        exitHandler(1, null);
      }

      expect(daemonManager.isRunning()).toBe(false);

      // Should be able to restart
      await daemonManager.ensureDaemon();
      expect(spawn).toHaveBeenCalledTimes(2);
      expect(daemonManager.isRunning()).toBe(true);
    });
  });

  describe('Context isolation', () => {
    it('creates isolated BrowserContext per task', async () => {
      await daemonManager.ensureDaemon();

      const context1 = await daemonManager.createContext('task-1');
      const context2 = await daemonManager.createContext('task-2');

      expect(context1.contextId).toBeDefined();
      expect(context2.contextId).toBeDefined();
      expect(context1.contextId).not.toBe(context2.contextId);
    });

    it('tracks active contexts', async () => {
      await daemonManager.ensureDaemon();

      await daemonManager.createContext('task-1');
      await daemonManager.createContext('task-2');
      await daemonManager.createContext('task-3');

      expect(daemonManager.getActiveContextCount()).toBe(3);
    });

    it('destroys context on task completion', async () => {
      await daemonManager.ensureDaemon();

      await daemonManager.createContext('task-1');
      await daemonManager.createContext('task-2');

      await daemonManager.destroyContext('task-1');

      expect(daemonManager.getActiveContextCount()).toBe(1);
    });

    it('provides MCP client scoped to context', async () => {
      await daemonManager.ensureDaemon();

      const context = await daemonManager.createContext('task-1');

      expect(context.client).toBeDefined();
      expect(typeof context.client.callTool).toBe('function');
    });

    it('throws when creating context without running daemon', async () => {
      await expect(daemonManager.createContext('task-1')).rejects.toThrow(
        'Daemon is not running',
      );
    });
  });

  describe('Health check', () => {
    it('reports healthy when daemon is responsive', async () => {
      await daemonManager.ensureDaemon();

      // Mock successful health check response
      if (mockClientInstances.length > 0) {
        mockClientInstances[0]!.callTool.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'ok' }],
        });
      }

      const health = await daemonManager.checkHealth();

      expect(health.healthy).toBe(true);
      expect(health.pid).toBe(12345);
    });

    it('reports unhealthy when daemon is not running', async () => {
      const health = await daemonManager.checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.reason).toBe('Daemon is not running');
    });

    it('reports unhealthy when daemon is unresponsive', async () => {
      await daemonManager.ensureDaemon();

      // Mock unresponsive daemon
      if (mockClientInstances.length > 0) {
        mockClientInstances[0]!.callTool.mockRejectedValueOnce(
          new Error('Connection timeout'),
        );
      }

      const health = await daemonManager.checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.reason).toContain('Connection timeout');
    });
  });

  describe('Daemon reuse', () => {
    it('reuses Chromium instance across tasks', async () => {
      const { spawn } = await import('node:child_process');

      await daemonManager.ensureDaemon();

      // Create multiple contexts (simulating multiple tasks)
      await daemonManager.createContext('task-1');
      await daemonManager.createContext('task-2');
      await daemonManager.createContext('task-3');

      // Only one daemon process should be spawned
      expect(spawn).toHaveBeenCalledTimes(1);

      // All contexts should share the same daemon
      expect(daemonManager.getActiveContextCount()).toBe(3);
    });

    it('provides isolated page state per context', async () => {
      await daemonManager.ensureDaemon();

      const context1 = await daemonManager.createContext('task-1');
      const context2 = await daemonManager.createContext('task-2');

      // Call tool on context 1
      await context1.client.callTool('browser_navigate', { url: 'https://example.com' });

      // Call tool on context 2 with different URL
      await context2.client.callTool('browser_navigate', { url: 'https://test.com' });

      // Both calls should succeed independently
      expect(mockClientInstances.length).toBeGreaterThan(0);
    });
  });

  describe('Shutdown behavior', () => {
    it('waits for all contexts to be destroyed before shutdown', async () => {
      await daemonManager.ensureDaemon();

      await daemonManager.createContext('task-1');
      await daemonManager.createContext('task-2');

      // Shutdown should wait for contexts
      const shutdownPromise = daemonManager.shutdown();

      // Destroy contexts
      await daemonManager.destroyContext('task-1');
      await daemonManager.destroyContext('task-2');

      await shutdownPromise;

      expect(daemonManager.isRunning()).toBe(false);
    });

    it('force kills daemon after timeout', async () => {
      // Use short timeout for test
      const shortTimeoutManager = new MCPDaemonManager({
        shutdownTimeoutMs: 100,
        healthCheckIntervalMs: 5000,
      });

      await shortTimeoutManager.ensureDaemon();

      // Don't destroy contexts, let timeout trigger
      const shutdownPromise = shortTimeoutManager.shutdown();

      await shutdownPromise;

      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGKILL');
      expect(shortTimeoutManager.isRunning()).toBe(false);
    });

    it('cleans up all contexts on shutdown', async () => {
      await daemonManager.ensureDaemon();

      await daemonManager.createContext('task-1');
      await daemonManager.createContext('task-2');
      await daemonManager.createContext('task-3');

      await daemonManager.shutdown();

      expect(daemonManager.getActiveContextCount()).toBe(0);
    });
  });

  describe('Error handling', () => {
    it('handles daemon spawn failure', async () => {
      const { spawn } = await import('node:child_process');
      vi.mocked(spawn).mockImplementationOnce(() => {
        throw new Error('spawn failed');
      });

      await expect(daemonManager.ensureDaemon()).rejects.toThrow('spawn failed');
      expect(daemonManager.isRunning()).toBe(false);
    });

    it('handles context creation failure', async () => {
      await daemonManager.ensureDaemon();

      // Mock MCP client failure
      if (mockClientInstances.length > 0) {
        mockClientInstances[0]!.callTool.mockRejectedValueOnce(
          new Error('Failed to create context'),
        );
      }

      await expect(daemonManager.createContext('task-1')).rejects.toThrow();
    });

    it('handles double shutdown gracefully', async () => {
      await daemonManager.ensureDaemon();

      await daemonManager.shutdown();
      await daemonManager.shutdown(); // Should not throw

      expect(daemonManager.isRunning()).toBe(false);
    });

    it('handles destroy of non-existent context', async () => {
      await daemonManager.ensureDaemon();

      // Should not throw
      await daemonManager.destroyContext('non-existent');
      expect(daemonManager.getActiveContextCount()).toBe(0);
    });
  });

  describe('Configuration', () => {
    it('respects custom shutdown timeout', () => {
      const customManager = new MCPDaemonManager({
        shutdownTimeoutMs: 5000,
        healthCheckIntervalMs: 10000,
      });

      expect(customManager.getConfig().shutdownTimeoutMs).toBe(5000);
      expect(customManager.getConfig().healthCheckIntervalMs).toBe(10000);
    });

    it('uses default configuration when not specified', () => {
      const defaultManager = new MCPDaemonManager();

      expect(defaultManager.getConfig().shutdownTimeoutMs).toBe(30000);
      expect(defaultManager.getConfig().healthCheckIntervalMs).toBe(60000);
    });
  });
});

describe('MCPClient with daemon support', () => {
  // Test integration with MCPClient
  let client: InstanceType<typeof import('../mcp/client.js').MCPClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransportInstances.length = 0;
    mockClientInstances.length = 0;
  });

  afterEach(async () => {
    if (client) {
      await client.disconnect().catch(() => {});
    }
  });

  it('exposes daemon mode flag', async () => {
    const { MCPClient } = await import('../mcp/client.js');
    client = new MCPClient();

    expect(client.isDaemonMode()).toBe(false);
  });

  it('connectToDaemon sets daemon mode', async () => {
    const { MCPClient } = await import('../mcp/client.js');
    client = new MCPClient();

    await client.connectToDaemon();

    expect(client.isDaemonMode()).toBe(true);
    expect(client.isConnected()).toBe(true);
  });

  it('connectToDaemon reuses existing daemon', async () => {
    const { MCPClient } = await import('../mcp/client.js');
    client = new MCPClient();

    await client.connectToDaemon();
    await client.connectToDaemon(); // Should not throw

    expect(client.isDaemonMode()).toBe(true);
  });

  it('disconnect cleans up daemon connection', async () => {
    const { MCPClient } = await import('../mcp/client.js');
    client = new MCPClient();

    await client.connectToDaemon();
    await client.disconnect();

    expect(client.isDaemonMode()).toBe(false);
    expect(client.isConnected()).toBe(false);
  });
});
