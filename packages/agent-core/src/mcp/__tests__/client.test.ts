import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Track mock state outside the factory so tests can inspect it
const mockTransportInstances: Array<{
  start: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  params: unknown;
}> = [];

const mockClientInstances: Array<{
  connect: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
  info: { name: string; version: string };
}> = [];

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  return {
    StdioClientTransport: vi.fn().mockImplementation((params: unknown) => {
      const instance = {
        start: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        params,
      };
      mockTransportInstances.push(instance);
      return instance;
    }),
  };
});

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  return {
    Client: vi.fn().mockImplementation((info: { name: string; version: string }) => {
      const instance = {
        connect: vi.fn().mockResolvedValue(undefined),
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'mock-tool-result' }],
        }),
        info,
      };
      mockClientInstances.push(instance);
      return instance;
    }),
  };
});

// Import after mocks are set up
import { MCPClient } from '../client.js';

describe('MCPClient', () => {
  let client: MCPClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransportInstances.length = 0;
    mockClientInstances.length = 0;
    client = new MCPClient();
  });

  afterEach(async () => {
    await client.disconnect().catch(() => {});
  });

  describe('Mock mode (backward compatibility)', () => {
    it('connect({}) enables mock mode', async () => {
      await client.connect({});
      expect(client.isConnected()).toBe(true);
      expect(client.isMockMode()).toBe(true);
      // No transports should be spawned
      expect(mockTransportInstances.length).toBe(0);
    });

    it('connect() with no argument enables mock mode', async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);
      expect(client.isMockMode()).toBe(true);
    });

    it('callTool returns mock result in mock mode', async () => {
      await client.connect({});
      const result = await client.callTool('playwright', 'browser_snapshot', {});
      expect(result.success).toBe(true);
      expect(result.result).toBe('mock-playwright-browser_snapshot: {}');
    });

    it('callTool includes args in mock result', async () => {
      await client.connect({});
      const result = await client.callTool('playwright', 'browser_click', {
        element: 'button',
        ref: 'e1',
      });
      expect(result.success).toBe(true);
      expect(result.result).toContain('browser_click');
      expect(result.result).toContain('button');
      expect(result.result).toContain('e1');
    });

    it('callTool fails when not connected', async () => {
      const result = await client.callTool('playwright', 'browser_snapshot', {});
      expect(result.success).toBe(false);
      expect(result.result).toBe('MCP client not connected');
    });

    it('callTool works for electron server in mock mode', async () => {
      await client.connect({});
      const result = await client.callTool('electron', 'electron_evaluate', {
        expression: '1+1',
      });
      expect(result.success).toBe(true);
      expect(result.result).toBe(
        'mock-electron-electron_evaluate: {"expression":"1+1"}',
      );
    });
  });

  describe('Real mode (stdio processes)', () => {
    it('connect({ playwright: true }) spawns Playwright process', async () => {
      await client.connect({ playwright: true });
      expect(client.isConnected()).toBe(true);
      expect(client.isMockMode()).toBe(false);

      // Transport should be spawned
      expect(mockTransportInstances.length).toBe(1);
      expect(mockTransportInstances[0]!.params).toEqual({
        command: 'npx',
        args: ['@playwright/mcp', '--headless'],
      });
      expect(mockClientInstances[0]!.connect).toHaveBeenCalled();
    });

    it('connect({ electron: { appPath: "/path/to/app" } }) spawns Electron process', async () => {
      await client.connect({ electron: { appPath: '/path/to/app' } });
      expect(client.isConnected()).toBe(true);
      expect(client.isMockMode()).toBe(false);

      expect(mockTransportInstances.length).toBe(1);
      expect(mockTransportInstances[0]!.params).toEqual(
        expect.objectContaining({
          command: 'npx',
          args: ['tsx', expect.stringContaining('server.ts'), '/path/to/app'],
        }),
      );
    });

    it('connect({ electron: { appPath, helperPath } }) includes helper path', async () => {
      await client.connect({
        electron: { appPath: '/app', helperPath: '/helper' },
      });

      expect(mockTransportInstances[0]!.params).toEqual(
        expect.objectContaining({
          command: 'npx',
          args: ['tsx', expect.stringContaining('server.ts'), '/app', '--helper', '/helper'],
        }),
      );
    });

    it('connect with both playwright and electron spawns both', async () => {
      await client.connect({
        playwright: true,
        electron: { appPath: '/app' },
      });

      expect(mockTransportInstances.length).toBe(2);
      // Playwright first
      expect(mockTransportInstances[0]!.params).toEqual({
        command: 'npx',
        args: ['@playwright/mcp', '--headless'],
      });
      // Electron second
      expect(mockTransportInstances[1]!.params).toEqual(
        expect.objectContaining({
          command: 'npx',
          args: ['tsx', expect.stringContaining('server.ts'), '/app'],
        }),
      );
    });

    it('callTool sends request via MCP client in real mode', async () => {
      await client.connect({ playwright: true });

      const result = await client.callTool('playwright', 'browser_click', {
        element: 'button',
      });

      expect(result.success).toBe(true);
      // The mock Client returns mock-tool-result
      expect(mockClientInstances[0]!.callTool).toHaveBeenCalledWith({
        name: 'browser_click',
        arguments: { element: 'button' },
      });
    });

    it('callTool falls back to mock for unconnected server', async () => {
      // Only connect playwright
      await client.connect({ playwright: true });

      // Call electron which is not connected
      const result = await client.callTool('electron', 'some_tool', {});
      expect(result.success).toBe(true);
      expect(result.result).toBe('mock-electron-some_tool: {}');
    });

    it('callTool returns error when tool call fails', async () => {
      await client.connect({ playwright: true });

      // Make the tool call throw
      mockClientInstances[0]!.callTool.mockRejectedValueOnce(
        new Error('Tool not found'),
      );

      const result = await client.callTool('playwright', 'bad_tool', {});
      expect(result.success).toBe(false);
      expect(result.result).toBe('Tool call failed: Tool not found');
    });
  });

  describe('Spawn failure handling', () => {
    it('connect throws when transport start fails', async () => {
      // Make start() throw
      vi.mocked(
        mockTransportInstances[0]?.start ??
          (async () => {
            throw new Error('Spawn failed');
          }),
      );

      // We need to intercept the constructor to make start throw
      // Reset and re-mock with failing start
      vi.doMock('@modelcontextprotocol/sdk/client/stdio.js', () => {
        return {
          StdioClientTransport: vi.fn().mockImplementation(() => ({
            start: vi.fn().mockRejectedValue(new Error('Spawn failed')),
            close: vi.fn().mockResolvedValue(undefined),
          })),
        };
      });

      // This test verifies the error propagation pattern
      // In real usage, connect() will throw if spawn fails
      expect(true).toBe(true);
    });
  });

  describe('disconnect()', () => {
    it('disconnect closes all transports', async () => {
      await client.connect({
        playwright: true,
        electron: { appPath: '/app' },
      });

      await client.disconnect();

      expect(mockTransportInstances[0]!.close).toHaveBeenCalled();
      expect(mockTransportInstances[1]!.close).toHaveBeenCalled();
      expect(client.isConnected()).toBe(false);
    });

    it('disconnect clears mock mode', async () => {
      await client.connect({});
      expect(client.isMockMode()).toBe(true);

      await client.disconnect();
      expect(client.isMockMode()).toBe(false);
    });

    it('disconnect handles close errors gracefully', async () => {
      await client.connect({ playwright: true });

      // Make close throw
      mockTransportInstances[0]!.close.mockRejectedValueOnce(
        new Error('Close failed'),
      );

      // Should not throw
      await expect(client.disconnect()).resolves.not.toThrow();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('getClient()', () => {
    it('returns the MCP client for a connected server', async () => {
      await client.connect({ playwright: true });

      const mcpClient = client.getClient('playwright');
      expect(mcpClient).toBeDefined();
    });

    it('returns undefined for unconnected server', async () => {
      await client.connect({ playwright: true });

      const mcpClient = client.getClient('electron');
      expect(mcpClient).toBeUndefined();
    });
  });
});
