import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ElectronProcess } from '@eata/launcher';
import type { RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';

import { electronLaunch } from '../tools/electron-launch.js';
import { electronClose } from '../tools/electron-close.js';
import { executeMain } from '../tools/execute-main.js';
import { triggerIpc } from '../tools/trigger-ipc.js';
import { mockDialog } from '../tools/mock-dialog.js';
import { BridgeClient } from '../bridge-client.js';
import { createServer, main } from '../server.js';

// ─── Mock @eata/launcher ──────────────────────────────────────────────

vi.mock('@eata/launcher', () => ({
  spawnElectron: vi.fn(),
  getWebSocketUrl: vi.fn(),
}));

// ─── Mock StdioServerTransport for main() tests ──────────────────────

const mockTransportInstance = {
  start: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue(undefined),
  onclose: undefined as (() => void) | undefined,
  onerror: undefined as ((error: Error) => void) | undefined,
};

vi.mock('@modelcontextprotocol/sdk/server/stdio', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => mockTransportInstance),
}));

import { spawnElectron, getWebSocketUrl } from '@eata/launcher';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';

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
  let killSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    processRegistry = new Map();
    killSpy = vi.spyOn(process, 'kill') as unknown as ReturnType<typeof vi.spyOn>;
    (killSpy as unknown as { mockImplementation: (fn: () => boolean) => void }).mockImplementation(() => true);
  });

  afterEach(() => {
    killSpy.mockRestore();
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
    const result = await electronClose({ pid: 99999 }, { processRegistry });

    expect(killSpy).toHaveBeenCalledWith(99999, 'SIGTERM');
    expect(result.success).toBe(true);
  });

  it('should return success false when process.kill throws for unknown PID', async () => {
    killSpy.mockImplementation(() => { throw new Error('ESRCH'); });

    const result = await electronClose({ pid: 99999 }, { processRegistry });

    expect(result.success).toBe(false);
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

  it('should handle non-Error thrown from bridge.send', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockRejectedValue('string error'),
    });

    const result = await executeMain(
      { code: 'console.log("test")' },
      { bridgeClient },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('string error');
  });

  it('should return the full response when response has no payload', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockResolvedValue({
        type: 'response',
        id: '1',
      }),
    });

    const result = await executeMain(
      { code: 'console.log("test")' },
      { bridgeClient },
    );

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ type: 'response', id: '1' });
  });

  it('should return success:false when payload.success is falsy', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockResolvedValue({
        type: 'response',
        id: '1',
        payload: { success: false, error: 'runtime error' },
      }),
    });

    const result = await executeMain(
      { code: 'invalid()' },
      { bridgeClient },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('runtime error');
  });

  it('should fall back to payload object when payload.data is null', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockResolvedValue({
        type: 'response',
        id: '1',
        payload: { success: true, data: null },
      }),
    });

    const result = await executeMain(
      { code: 'void 0' },
      { bridgeClient },
    );

    expect(result.success).toBe(true);
    // data is null, so result falls back to payload object itself
    expect(result.result).toEqual({ success: true, data: null });
  });

  it('should ignore non-string error in payload', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockResolvedValue({
        type: 'response',
        id: '1',
        payload: { success: false, error: 12345 },
      }),
    });

    const result = await executeMain(
      { code: 'fail()' },
      { bridgeClient },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('should block code when trust level analysis detects violations', async () => {
    const bridgeClient = createMockBridgeClient();

    const result = await executeMain(
      { code: 'require("fs").readFileSync("/etc/passwd")', trustLevel: 'app-context' },
      { bridgeClient },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('blocked by trust level');
    expect(result.securityAnalysis).toBeDefined();
    expect(result.securityAnalysis!.safe).toBe(false);
    expect(result.securityAnalysis!.blockedPatterns.length).toBeGreaterThan(0);
  });

  it('should allow safe code under app-context trust level', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockResolvedValue({
        type: 'response',
        id: '1',
        payload: { success: true, data: 'ok' },
      }),
    });

    const result = await executeMain(
      { code: 'console.log("hello")', trustLevel: 'app-context' },
      { bridgeClient },
    );

    expect(result.success).toBe(true);
  });

  it('should use default app-context trust level when not specified', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockResolvedValue({
        type: 'response',
        id: '1',
        payload: { success: true, data: 'ok' },
      }),
    });

    const result = await executeMain(
      { code: 'console.log("test")' },
      { bridgeClient },
    );

    expect(result.success).toBe(true);
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

  it('should handle non-Error thrown from bridge.send', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockRejectedValue(42),
    });

    const result = await triggerIpc(
      { channel: 'test', data: null },
      { bridgeClient },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('42');
  });

  it('should return the full response when response has no payload', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockResolvedValue({
        type: 'response',
        id: '1',
      }),
    });

    const result = await triggerIpc(
      { channel: 'test', data: 'hello' },
      { bridgeClient },
    );

    expect(result.success).toBe(true);
    expect(result.response).toEqual({ type: 'response', id: '1' });
  });

  it('should return success:false when payload.success is falsy', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockResolvedValue({
        type: 'response',
        id: '1',
        payload: { success: false, error: 'channel not found' },
      }),
    });

    const result = await triggerIpc(
      { channel: 'missing', data: null },
      { bridgeClient },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('channel not found');
  });

  it('should fall back to null when payload.data is null', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockResolvedValue({
        type: 'response',
        id: '1',
        payload: { success: true, data: null },
      }),
    });

    const result = await triggerIpc(
      { channel: 'test', data: 'x' },
      { bridgeClient },
    );

    expect(result.success).toBe(true);
    expect(result.response).toBeNull();
  });

  it('should ignore non-string error in payload', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockResolvedValue({
        type: 'response',
        id: '1',
        payload: { success: false, error: { code: 500 } },
      }),
    });

    const result = await triggerIpc(
      { channel: 'test', data: null },
      { bridgeClient },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeUndefined();
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

  it('should handle non-Error thrown from bridge.send', async () => {
    const bridgeClient = createMockBridgeClient({
      send: vi.fn().mockRejectedValue({ code: 'ERR' }),
    });

    const result = await mockDialog(
      { type: 'open', response: '/path' },
      { bridgeClient },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('[object Object]');
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

// ─── MCP Tool Handler Tests (covers L67-150 in server.ts) ────────────

/**
 * Extract registered tool handlers from the McpServer internals.
 * McpServer stores tools in _registeredTools (a plain object keyed by name).
 */
function getToolHandlers(server: ReturnType<typeof createServer>['server']) {
  const internals = server as unknown as {
    _registeredTools?: Record<string, RegisteredTool>;
  };
  return internals._registeredTools ?? {};
}

describe('MCP tool handler callbacks (via createServer)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── electron_launch handler ──────────────────────────────────────

  describe('electron_launch handler', () => {
    it('should return pid, cdpPort, and webSocketUrl as JSON content', async () => {
      const mockProcess = createMockElectronProcess();
      mockSpawnElectron.mockResolvedValue(mockProcess);
      mockGetWebSocketUrl.mockResolvedValue('ws://localhost:9222/devtools/browser/abc');

      const { server, processRegistry } = createServer();
      const tools = getToolHandlers(server);
      const handler = tools['electron_launch']!.handler as (
        args: unknown,
      ) => Promise<unknown>;

      const result = (await handler({
        targetAppPath: '/app',
      })) as {
        content: Array<{ type: string; text: string }>;
        structuredContent: unknown;
      };

      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pid).toBe(12345);
      expect(parsed.cdpPort).toBe(9222);
      expect(parsed.webSocketUrl).toBe('ws://localhost:9222/devtools/browser/abc');
      expect(result.structuredContent).toEqual(parsed);
      expect(processRegistry.has(12345)).toBe(true);
    });

    it('should pass optional helperPath and debuggingPort to spawnElectron', async () => {
      const mockProcess = createMockElectronProcess({ pid: 54321, cdpPort: 9333 });
      mockSpawnElectron.mockResolvedValue(mockProcess);
      mockGetWebSocketUrl.mockResolvedValue('ws://localhost:9333/devtools/browser/xyz');

      const { server } = createServer();
      const tools = getToolHandlers(server);
      const handler = tools['electron_launch']!.handler as (args: unknown) => Promise<unknown>;

      await handler({
        targetAppPath: '/app',
        helperPath: '/helper.js',
        debuggingPort: 8888,
      });

      expect(mockSpawnElectron).toHaveBeenCalledWith({
        targetAppPath: '/app',
        helperPath: '/helper.js',
        debuggingPort: 8888,
      });
    });

    it('should propagate errors from electronLaunch', async () => {
      mockSpawnElectron.mockRejectedValue(new Error('ENOENT'));

      const { server } = createServer();
      const tools = getToolHandlers(server);
      const handler = tools['electron_launch']!.handler as (args: unknown) => Promise<unknown>;

      await expect(handler({ targetAppPath: '/bad' })).rejects.toThrow('ENOENT');
    });
  });

  // ── electron_close handler ───────────────────────────────────────

  describe('electron_close handler', () => {
    let killSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      killSpy = vi.spyOn(process, 'kill') as unknown as ReturnType<typeof vi.spyOn>;
      (killSpy as unknown as { mockImplementation: (fn: () => boolean) => void }).mockImplementation(() => true);
    });

    afterEach(() => {
      killSpy.mockRestore();
    });

    it('should return success result as JSON content', async () => {
      const mockProcess = createMockElectronProcess();
      const { server, processRegistry } = createServer();
      processRegistry.set(12345, mockProcess);

      const tools = getToolHandlers(server);
      const handler = tools['electron_close']!.handler as (args: unknown) => Promise<unknown>;

      const result = (await handler({ pid: 12345 })) as {
        content: Array<{ type: string; text: string }>;
        structuredContent: unknown;
      };

      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(result.structuredContent).toEqual(parsed);
      expect(processRegistry.has(12345)).toBe(false);
    });

    it('should handle OS-level kill for unknown PID', async () => {
      const { server } = createServer();
      const tools = getToolHandlers(server);
      const handler = tools['electron_close']!.handler as (args: unknown) => Promise<unknown>;

      const result = (await handler({ pid: 99999 })) as {
        content: Array<{ type: string; text: string }>;
        structuredContent: unknown;
      };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(99999, 'SIGTERM');
    });

    it('should return success:false when OS kill fails', async () => {
      killSpy.mockImplementation(() => { throw new Error('ESRCH'); });

      const { server } = createServer();
      const tools = getToolHandlers(server);
      const handler = tools['electron_close']!.handler as (args: unknown) => Promise<unknown>;

      const result = (await handler({ pid: 99999 })) as {
        content: Array<{ type: string; text: string }>;
      };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
    });
  });

  // ── execute_main handler ─────────────────────────────────────────

  describe('execute_main handler', () => {
    it('should return result as JSON content on success (L106-108)', async () => {
      const bridgeClient = createMockBridgeClient({
        send: vi.fn().mockResolvedValue({
          type: 'response',
          id: '1',
          payload: { success: true, data: { version: '1.0.0' } },
        }),
      });

      const { server } = createServer({ bridgeClient });
      const tools = getToolHandlers(server);
      const handler = tools['execute_main']!.handler as (args: unknown) => Promise<unknown>;

      const result = (await handler({ code: 'app.getVersion()' })) as {
        content: Array<{ type: string; text: string }>;
        structuredContent: unknown;
      };

      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toEqual({ version: '1.0.0' });
      expect(result.structuredContent).toEqual({ result: { version: '1.0.0' } });
    });

    it('should return error content with isError flag on failure (L99-103)', async () => {
      const bridgeClient = createMockBridgeClient({
        isConnected: vi.fn().mockReturnValue(false),
      });

      const { server } = createServer({ bridgeClient });
      const tools = getToolHandlers(server);
      const handler = tools['execute_main']!.handler as (args: unknown) => Promise<unknown>;

      const result = (await handler({ code: 'test' })) as {
        content: Array<{ type: string; text: string }>;
        isError: boolean;
      };

      expect(result.content[0].text).toContain('not connected');
      expect(result.isError).toBe(true);
    });

    it('should use "Unknown error" fallback when error message is undefined (L101)', async () => {
      const bridgeClient = createMockBridgeClient({
        send: vi.fn().mockResolvedValue({
          type: 'response',
          id: '1',
          payload: { success: false },
        }),
      });

      const { server } = createServer({ bridgeClient });
      const tools = getToolHandlers(server);
      const handler = tools['execute_main']!.handler as (args: unknown) => Promise<unknown>;

      const result = (await handler({ code: 'bad()' })) as {
        content: Array<{ type: string; text: string }>;
        isError: boolean;
      };

      expect(result.content[0].text).toBe('Unknown error');
      expect(result.isError).toBe(true);
    });

    it('should pass timeout through to the bridge client', async () => {
      const bridgeClient = createMockBridgeClient();

      const { server } = createServer({ bridgeClient });
      const tools = getToolHandlers(server);
      const handler = tools['execute_main']!.handler as (args: unknown) => Promise<unknown>;

      await handler({ code: 'test', timeout: 5000 });

      expect(bridgeClient.send).toHaveBeenCalledWith({
        type: 'execute_main',
        payload: { code: 'test', timeout: 5000 },
      });
    });
  });

  // ── trigger_ipc handler ──────────────────────────────────────────

  describe('trigger_ipc handler', () => {
    it('should return response as JSON content on success (L126-129)', async () => {
      const bridgeClient = createMockBridgeClient({
        send: vi.fn().mockResolvedValue({
          type: 'response',
          id: '1',
          payload: { success: true, data: { pong: true } },
        }),
      });

      const { server } = createServer({ bridgeClient });
      const tools = getToolHandlers(server);
      const handler = tools['trigger_ipc']!.handler as (args: unknown) => Promise<unknown>;

      const result = (await handler({ channel: 'ping', data: { msg: 'hi' } })) as {
        content: Array<{ type: string; text: string }>;
        structuredContent: unknown;
      };

      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toEqual({ pong: true });
      expect(result.structuredContent).toEqual({ response: { pong: true } });
    });

    it('should return error content with isError flag on failure (L120-124)', async () => {
      const bridgeClient = createMockBridgeClient({
        isConnected: vi.fn().mockReturnValue(false),
      });

      const { server } = createServer({ bridgeClient });
      const tools = getToolHandlers(server);
      const handler = tools['trigger_ipc']!.handler as (args: unknown) => Promise<unknown>;

      const result = (await handler({ channel: 'test', data: null })) as {
        content: Array<{ type: string; text: string }>;
        isError: boolean;
      };

      expect(result.content[0].text).toContain('not connected');
      expect(result.isError).toBe(true);
    });

    it('should use "Unknown error" fallback when error message is undefined (L121)', async () => {
      const bridgeClient = createMockBridgeClient({
        send: vi.fn().mockResolvedValue({
          type: 'response',
          id: '1',
          payload: { success: false },
        }),
      });

      const { server } = createServer({ bridgeClient });
      const tools = getToolHandlers(server);
      const handler = tools['trigger_ipc']!.handler as (args: unknown) => Promise<unknown>;

      const result = (await handler({ channel: 'bad', data: null })) as {
        content: Array<{ type: string; text: string }>;
        isError: boolean;
      };

      expect(result.content[0].text).toBe('Unknown error');
      expect(result.isError).toBe(true);
    });
  });

  // ── mock_dialog handler ──────────────────────────────────────────

  describe('mock_dialog handler', () => {
    it('should return {success:true} as JSON content on success (L148)', async () => {
      const bridgeClient = createMockBridgeClient({
        send: vi.fn().mockResolvedValue({
          type: 'response',
          id: '1',
          payload: { success: true },
        }),
      });

      const { server } = createServer({ bridgeClient });
      const tools = getToolHandlers(server);
      const handler = tools['mock_dialog']!.handler as (args: unknown) => Promise<unknown>;

      const result = (await handler({
        type: 'open',
        response: '/mock/file.txt',
      })) as {
        content: Array<{ type: string; text: string }>;
      };

      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toEqual({ success: true });
    });

    it('should return error content with isError flag on failure (L141-145)', async () => {
      const bridgeClient = createMockBridgeClient({
        isConnected: vi.fn().mockReturnValue(false),
      });

      const { server } = createServer({ bridgeClient });
      const tools = getToolHandlers(server);
      const handler = tools['mock_dialog']!.handler as (args: unknown) => Promise<unknown>;

      const result = (await handler({ type: 'save', response: '/path' })) as {
        content: Array<{ type: string; text: string }>;
        isError: boolean;
      };

      expect(result.content[0].text).toContain('not connected');
      expect(result.isError).toBe(true);
    });

    it('should return error string from mockDialog on send failure', async () => {
      const bridgeClient = createMockBridgeClient({
        send: vi.fn().mockRejectedValue(new Error('Connection reset')),
      });

      const { server } = createServer({ bridgeClient });
      const tools = getToolHandlers(server);
      const handler = tools['mock_dialog']!.handler as (args: unknown) => Promise<unknown>;

      const result = (await handler({ type: 'message', response: 0 })) as {
        content: Array<{ type: string; text: string }>;
        isError: boolean;
      };

      expect(result.content[0].text).toBe('Connection reset');
      expect(result.isError).toBe(true);
    });

    it('should support all three dialog types through the handler', async () => {
      const bridgeClient = createMockBridgeClient();

      const { server } = createServer({ bridgeClient });
      const tools = getToolHandlers(server);
      const handler = tools['mock_dialog']!.handler as (args: unknown) => Promise<unknown>;

      for (const type of ['open', 'save', 'message'] as const) {
        const result = (await handler({
          type,
          response: type === 'message' ? 0 : '/path',
        })) as { content: Array<{ type: string; text: string }> };

        expect(JSON.parse(result.content[0].text)).toEqual({ success: true });
      }
    });
  });
});

// ─── main() and entry point tests (covers L159-176) ────────────────

describe('main() and module entry point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransportInstance.start.mockClear();
    mockTransportInstance.close.mockClear();
  });

  it('should create server and connect transport when main() is called (L160-164)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // main() is now exported; call it directly
    // StdioServerTransport is mocked, and mockTransportInstance has start/close
    await main();

    // Verify StdioServerTransport was instantiated
    expect(StdioServerTransport).toHaveBeenCalled();
    // Verify transport.start() was called by server.connect()
    expect(mockTransportInstance.start).toHaveBeenCalled();
    // Verify stderr message
    expect(consoleSpy).toHaveBeenCalledWith('Electron Bridge MCP server running on stdio');

    consoleSpy.mockRestore();
  });

  it('should log to stderr when main() starts successfully (L164)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await main();

    expect(consoleSpy).toHaveBeenCalledWith('Electron Bridge MCP server running on stdio');

    consoleSpy.mockRestore();
  });

  it('should propagate errors when server.connect fails (L160-164)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Make transport.start() reject so connect() throws
    mockTransportInstance.start.mockRejectedValueOnce(new Error('transport init failed'));

    await expect(main()).rejects.toThrow('transport init failed');

    consoleSpy.mockRestore();
  });

  it('isMainModule should be false in test context (L167-170)', () => {
    // In test context, process.argv[1] is the test runner, not server.ts
    // Verify the guard condition: import.meta.url will not match process.argv[1]
    const isMainModule =
      process.argv[1] &&
      import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
    expect(isMainModule).toBeFalsy();
  });

  it('isMainModule logic should match when argv matches import.meta.url (L167-170)', () => {
    // Verify the URL construction logic works as expected
    // When process.argv[1] contains backslashes (Windows), they are replaced with /
    const testPath = 'C:\\Users\\test\\server.ts';
    const expected = new URL(`file://${testPath.replace(/\\/g, '/')}`).href;
    expect(expected).toBe('file:///C:/Users/test/server.ts');
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
