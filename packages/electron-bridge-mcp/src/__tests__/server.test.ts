import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ElectronProcess } from '@eata/launcher';

import { electronLaunch } from '../tools/electron-launch.js';
import { electronClose } from '../tools/electron-close.js';
import { executeMain } from '../tools/execute-main.js';
import { triggerIpc } from '../tools/trigger-ipc.js';
import { mockDialog } from '../tools/mock-dialog.js';
import { BridgeClient } from '../bridge-client.js';
import { createServer } from '../server.js';

// ─── Mock @eata/launcher ──────────────────────────────────────────────

vi.mock('@eata/launcher', () => ({
  spawnElectron: vi.fn(),
  getWebSocketUrl: vi.fn(),
}));

import { spawnElectron, getWebSocketUrl } from '@eata/launcher';

const mockSpawnElectron = vi.mocked(spawnElectron);
const mockGetWebSocketUrl = vi.mocked(getWebSocketUrl);

// ─── Helpers ──────────────────────────────────────────────────────────

function createMockBridgeClient(overrides?: Partial<BridgeClient>): BridgeClient {
  const client = {
    connect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue({
      type: 'response',
      id: '1',
      payload: { success: true, data: 'mock-result' },
    }),
    sendFireAndForget: vi.fn(),
    onMessage: vi.fn(),
    close: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  } as unknown as BridgeClient;

  if (overrides) {
    Object.assign(client, overrides);
  }

  return client;
}

function createMockElectronProcess(overrides?: Partial<ElectronProcess>): ElectronProcess {
  return {
    pid: 12345,
    cdpPort: 9222,
    kill: vi.fn(),
    process: { on: vi.fn(), stderr: { on: vi.fn() } } as unknown as ElectronProcess['process'],
    ...overrides,
  };
}

// ─── electron_launch tests ────────────────────────────────────────────

describe('electron_launch tool', () => {
  let processRegistry: Map<number, ElectronProcess>;

  beforeEach(() => {
    vi.clearAllMocks();
    processRegistry = new Map();
  });

  it('should spawn Electron and return CDP info', async () => {
    const mockProcess = createMockElectronProcess();
    mockSpawnElectron.mockResolvedValue(mockProcess);
    mockGetWebSocketUrl.mockResolvedValue('ws://localhost:9222/devtools/browser/abc');

    const result = await electronLaunch(
      { targetAppPath: '/path/to/app' },
      { processRegistry },
    );

    expect(mockSpawnElectron).toHaveBeenCalledWith({
      targetAppPath: '/path/to/app',
      helperPath: undefined,
      debuggingPort: 0,
    });
    expect(result.pid).toBe(12345);
    expect(result.cdpPort).toBe(9222);
    expect(result.webSocketUrl).toBe('ws://localhost:9222/devtools/browser/abc');
  });

  it('should pass helperPath and debuggingPort through', async () => {
    const mockProcess = createMockElectronProcess();
    mockSpawnElectron.mockResolvedValue(mockProcess);
    mockGetWebSocketUrl.mockResolvedValue('ws://localhost:9222/devtools/browser/abc');

    await electronLaunch(
      { targetAppPath: '/path/to/app', helperPath: '/path/to/helper.js', debuggingPort: 9999 },
      { processRegistry },
    );

    expect(mockSpawnElectron).toHaveBeenCalledWith({
      targetAppPath: '/path/to/app',
      helperPath: '/path/to/helper.js',
      debuggingPort: 9999,
    });
  });

  it('should register the process in the registry', async () => {
    const mockProcess = createMockElectronProcess();
    mockSpawnElectron.mockResolvedValue(mockProcess);
    mockGetWebSocketUrl.mockResolvedValue('ws://localhost:9222/devtools/browser/abc');

    await electronLaunch(
      { targetAppPath: '/path/to/app' },
      { processRegistry },
    );

    expect(processRegistry.has(12345)).toBe(true);
    expect(processRegistry.get(12345)).toBe(mockProcess);
  });

  it('should propagate spawn failures', async () => {
    mockSpawnElectron.mockRejectedValue(new Error('spawn ENOENT'));

    await expect(
      electronLaunch({ targetAppPath: '/path/to/app' }, { processRegistry }),
    ).rejects.toThrow('spawn ENOENT');
  });

  it('should propagate CDP discovery failures', async () => {
    const mockProcess = createMockElectronProcess();
    mockSpawnElectron.mockResolvedValue(mockProcess);
    mockGetWebSocketUrl.mockRejectedValue(new Error('CDP discovery timeout'));

    await expect(
      electronLaunch({ targetAppPath: '/path/to/app' }, { processRegistry }),
    ).rejects.toThrow('CDP discovery timeout');
  });
});

// ─── electron_close tests ─────────────────────────────────────────────

describe('electron_close tool', () => {
  let processRegistry: Map<number, ElectronProcess>;

  beforeEach(() => {
    vi.clearAllMocks();
    processRegistry = new Map();
  });

  it('should kill a registered process', async () => {
    const mockProcess = createMockElectronProcess();
    processRegistry.set(12345, mockProcess);

    const result = await electronClose({ pid: 12345 }, { processRegistry });

    expect(result.success).toBe(true);
    expect(mockProcess.kill).toHaveBeenCalled();
    expect(processRegistry.has(12345)).toBe(false);
  });

  it('should attempt OS-level kill for unknown PID', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = await electronClose({ pid: 99999 }, { processRegistry });

    expect(killSpy).toHaveBeenCalledWith(99999, 'SIGTERM');
    expect(result.success).toBe(true);

    killSpy.mockRestore();
  });

  it('should return success false when process.kill throws for unknown PID', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

    const result = await electronClose({ pid: 99999 }, { processRegistry });

    expect(result.success).toBe(false);

    killSpy.mockRestore();
  });
});

// ─── execute_main tests ───────────────────────────────────────────────

describe('execute_main tool', () => {
  it('should send code via bridge and return result', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockResolvedValue({
        type: 'response',
        id: '1',
        payload: { success: true, data: { version: '1.2.3' } },
      }),
    });

    const result = await executeMain(
      { code: 'require("electron").app.getVersion()' },
      { bridgeClient },
    );

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ version: '1.2.3' });
    expect(bridgeClient.send).toHaveBeenCalledWith({
      type: 'execute_main',
      payload: { code: 'require("electron").app.getVersion()', timeout: undefined },
    });
  });

  it('should pass timeout in payload', async () => {
    const bridgeClient = createMockBridgeClient();

    await executeMain(
      { code: 'console.log("test")', timeout: 5000 },
      { bridgeClient },
    );

    expect(bridgeClient.send).toHaveBeenCalledWith({
      type: 'execute_main',
      payload: { code: 'console.log("test")', timeout: 5000 },
    });
  });

  it('should return error when bridge is not connected', async () => {
    const bridgeClient = createMockBridgeClient({
      isConnected: vi.fn().mockReturnValue(false),
    });

    const result = await executeMain(
      { code: 'console.log("test")' },
      { bridgeClient },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not connected');
  });

  it('should return error when bridgeClient is null', async () => {
    const result = await executeMain(
      { code: 'console.log("test")' },
      { bridgeClient: null },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not connected');
  });

  it('should handle bridge send error', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockRejectedValue(new Error('Connection lost')),
    });

    const result = await executeMain(
      { code: 'console.log("test")' },
      { bridgeClient },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection lost');
  });
});

// ─── trigger_ipc tests ────────────────────────────────────────────────

describe('trigger_ipc tool', () => {
  it('should send IPC message via bridge and return response', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockResolvedValue({
        type: 'response',
        id: '1',
        payload: { success: true, data: { pong: true } },
      }),
    });

    const result = await triggerIpc(
      { channel: 'ping', data: { message: 'hello' } },
      { bridgeClient },
    );

    expect(result.success).toBe(true);
    expect(result.response).toEqual({ pong: true });
    expect(bridgeClient.send).toHaveBeenCalledWith({
      type: 'send_ipc',
      payload: { channel: 'ping', data: { message: 'hello' } },
    });
  });

  it('should return error when bridge is not connected', async () => {
    const bridgeClient = createMockBridgeClient({
      isConnected: vi.fn().mockReturnValue(false),
    });

    const result = await triggerIpc(
      { channel: 'test', data: null },
      { bridgeClient },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not connected');
  });

  it('should return error when bridgeClient is null', async () => {
    const result = await triggerIpc(
      { channel: 'test', data: null },
      { bridgeClient: null },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not connected');
  });

  it('should handle bridge send error', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockRejectedValue(new Error('Timeout')),
    });

    const result = await triggerIpc(
      { channel: 'test', data: null },
      { bridgeClient },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Timeout');
  });
});

// ─── mock_dialog tests ────────────────────────────────────────────────

describe('mock_dialog tool', () => {
  it('should register dialog mock via bridge', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockResolvedValue({
        type: 'response',
        id: '1',
        payload: { success: true },
      }),
    });

    const result = await mockDialog(
      { type: 'open', response: '/mock/path.txt' },
      { bridgeClient },
    );

    expect(result.success).toBe(true);
    expect(bridgeClient.send).toHaveBeenCalledWith({
      type: 'mock_dialog',
      payload: { type: 'open', response: '/mock/path.txt' },
    });
  });

  it('should support different dialog types', async () => {
    const bridgeClient = createMockBridgeClient();

    for (const type of ['open', 'save', 'message'] as const) {
      const result = await mockDialog(
        { type, response: type === 'message' ? 0 : '/path' },
        { bridgeClient },
      );
      expect(result.success).toBe(true);
    }
  });

  it('should return error when bridge is not connected', async () => {
    const bridgeClient = createMockBridgeClient({
      isConnected: vi.fn().mockReturnValue(false),
    });

    const result = await mockDialog(
      { type: 'save', response: '/path' },
      { bridgeClient },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not connected');
  });

  it('should return error when bridgeClient is null', async () => {
    const result = await mockDialog(
      { type: 'save', response: '/path' },
      { bridgeClient: null },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not connected');
  });

  it('should handle bridge send error', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });

    const result = await mockDialog(
      { type: 'message', response: 0 },
      { bridgeClient },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection refused');
  });
});

// ─── createServer tests ───────────────────────────────────────────────

describe('createServer', () => {
  it('should create an MCP server with 5 registered tools', () => {
    const { server } = createServer();

    // The MCP server wrapper stores tools internally
    const internals = server as unknown as {
      _registeredTools?: Record<string, unknown>;
    };

    // Verify server exists and tools are registered
    expect(server).toBeDefined();
    // Tools are stored in _registeredTools
    expect(internals._registeredTools).toBeDefined();
  });

  it('should create 5 tools registered under the expected names', () => {
    const { server } = createServer();

    // McpServer stores tools in _registeredTools (a plain object keyed by name)
    const mcpServerInternals = server as unknown as {
      _registeredTools?: Record<string, { title?: string }>;
    };

    const tools = mcpServerInternals._registeredTools;
    expect(tools).toBeDefined();

    const toolNames = Object.keys(tools!);
    expect(toolNames).toHaveLength(5);
    expect(toolNames).toContain('electron_launch');
    expect(toolNames).toContain('electron_close');
    expect(toolNames).toContain('execute_main');
    expect(toolNames).toContain('trigger_ipc');
    expect(toolNames).toContain('mock_dialog');
  });

  it('should use provided bridgeClient if given', () => {
    const customClient = createMockBridgeClient();
    const { bridgeClient } = createServer({ bridgeClient: customClient });

    expect(bridgeClient).toBe(customClient);
  });

  it('should create a new BridgeClient if not provided', () => {
    const { bridgeClient } = createServer();

    expect(bridgeClient).toBeDefined();
    expect(bridgeClient).toBeInstanceOf(BridgeClient);
  });

  it('should expose the process registry', () => {
    const { processRegistry } = createServer();

    expect(processRegistry).toBeDefined();
    expect(processRegistry).toBeInstanceOf(Map);
    expect(processRegistry.size).toBe(0);
  });
});

// ─── BridgeClient tests ───────────────────────────────────────────────

describe('BridgeClient', () => {
  it('should start disconnected', () => {
    const client = new BridgeClient();
    expect(client.isConnected()).toBe(false);
  });

  it('should fail to send when not connected', async () => {
    const client = new BridgeClient();

    await expect(client.send({ type: 'test' })).rejects.toThrow('not connected');
  });

  it('should close cleanly when not connected', () => {
    const client = new BridgeClient();
    // Should not throw
    expect(() => client.close()).not.toThrow();
  });
});
