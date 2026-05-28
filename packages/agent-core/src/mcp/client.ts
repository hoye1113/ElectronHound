import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StdioClientTransport,
  type StdioServerParameters,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toErrorMessage } from '../utils/error.js';
import { createStderrLogger } from '../utils/logger.js';

const logger = createStderrLogger('MCPClient');

export interface MCPToolCall {
  server: 'playwright' | 'electron';
  toolName: string;
  args: Record<string, unknown>;
}

export interface MCPToolResult {
  success: boolean;
  result: unknown;
}

/**
 * Configuration for spawning real MCP servers via stdio.
 */
export interface MCPServerConfig {
  /** Spawn @playwright/mcp in headless mode */
  playwright?: boolean;
  /** Spawn @eata/electron-bridge-mcp with the given app path */
  electron?: { appPath: string; helperPath?: string };
}

/**
 * Legacy configuration (kept for backward compatibility).
 * @deprecated Use MCPServerConfig instead.
 */
export interface MCPClientConfig {
  playwrightCdpUrl?: string;
  electronBridgeSocketPath?: string;
}

interface ServerConnection {
  transport: StdioClientTransport;
  client: Client;
}

export class MCPClient {
  private connected = false;
  private mockMode = false;
  private connections: Map<string, ServerConnection> = new Map();

  /**
   * Connect to MCP servers.
   * - Empty config or no playwright/electron = mock mode (backward compat)
   * - With config = spawn real stdio processes
   */
  async connect(config: MCPServerConfig | MCPClientConfig = {}): Promise<void> {
    // Detect mock mode: empty config or legacy config without real servers
    const hasRealConfig =
      ('playwright' in config && config.playwright) ||
      ('electron' in config && config.electron);

    if (!hasRealConfig) {
      this.mockMode = true;
      this.connected = true;
      return;
    }

    // Real mode: spawn processes
    const serverConfig = config as MCPServerConfig;

    if (serverConfig.playwright) {
      await this.spawnPlaywright();
    }

    if (serverConfig.electron) {
      await this.spawnElectron(serverConfig.electron);
    }

    this.connected = true;
  }

  /**
   * Spawn the Playwright MCP server.
   * When `cdpUrl` is provided, connects to a running browser via CDP instead of launching headless.
   */
  private async spawnPlaywright(cdpUrl?: string): Promise<void> {
    // Disconnect existing Playwright connection if any
    if (this.connections.has('playwright')) {
      await this.disconnectServer('playwright');
    }

    const params: StdioServerParameters = {
      command: 'npx',
      args: cdpUrl
        ? ['@playwright/mcp', '--cdp-endpoint', cdpUrl]
        : ['@playwright/mcp', '--headless'],
    };

    const transport = new StdioClientTransport(params);
    const client = new Client({
      name: 'agent-core-playwright',
      version: '0.1.0',
    });

    await client.connect(transport);

    this.connections.set('playwright', { transport, client });
  }

  /**
   * Spawn the Electron Bridge MCP server.
   */
  private async spawnElectron(options: {
    appPath: string;
    helperPath?: string;
  }): Promise<void> {
    const args = [options.appPath];
    if (options.helperPath) {
      args.push('--helper', options.helperPath);
    }

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const serverScript = resolve(__dirname, '..', '..', '..', 'electron-bridge-mcp', 'src', 'server.ts');

    const cleanEnv = { ...process.env };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    const params: StdioServerParameters = {
      command: 'npx',
      args: ['tsx', serverScript, ...args],
      env: cleanEnv as Record<string, string>,
    };

    const transport = new StdioClientTransport(params);
    const client = new Client({
      name: 'agent-core-electron',
      version: '0.1.0',
    });

    await client.connect(transport);

    this.connections.set('electron', { transport, client });
  }

  /**
   * Disconnect a single server by name and remove it from the connections map.
   */
  private async disconnectServer(server: string): Promise<void> {
    const conn = this.connections.get(server);
    if (conn) {
      try {
        await conn.transport.close();
      } catch {
        // Ignore cleanup errors
      }
      this.connections.delete(server);
    }
  }

  /**
   * Intercept an electron_launch result; if it contains a webSocketUrl,
   * spawn a Playwright MCP server connected to that CDP endpoint.
   */
  private async handleElectronLaunchResult(result: MCPToolResult): Promise<void> {
    const content = result.result as { content?: Array<{ text?: string }> };
    const text = content?.content?.[0]?.text;
    if (!text) return;

    try {
      const data = JSON.parse(text) as { webSocketUrl?: string };
      if (data.webSocketUrl) {
        logger.info(`electron_launch returned webSocketUrl: ${data.webSocketUrl}, spawning Playwright...`);
        await this.spawnPlaywright(data.webSocketUrl);
      }
    } catch (err: unknown) {
      // Playwright spawn failure or JSON parse error shouldn't break electron_launch
      logger.error(`Failed to auto-connect Playwright: ${toErrorMessage(err)}`);
    }
  }

  /**
   * Handle electron_close by disconnecting the dynamically-spawned Playwright server.
   */
  private async handleElectronClose(): Promise<void> {
    if (this.connections.has('playwright')) {
      logger.info(`electron_close called, disconnecting Playwright...`);
      await this.disconnectServer('playwright');
    }
  }

  /**
   * Call a tool on the specified server.
   * In mock mode, returns a mock result.
   * In real mode, uses the connected MCP client.
   */
  async callTool(
    server: 'playwright' | 'electron',
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    if (!this.connected) {
      return { success: false, result: 'MCP client not connected' };
    }

    // Mock mode: return mock result
    if (this.mockMode) {
      return {
        success: true,
        result: `mock-${server}-${toolName}: ${JSON.stringify(args)}`,
      };
    }

    // Real mode: look up connection
    const connection = this.connections.get(server);
    if (!connection) {
      // Server not connected, fall back to mock
      return {
        success: true,
        result: `mock-${server}-${toolName}: ${JSON.stringify(args)}`,
      };
    }

    try {
      const result = await connection.client.callTool({
        name: toolName,
        arguments: args,
      });

      const toolResult: MCPToolResult = {
        success: !result.isError,
        result,
      };

      // Intercept electron_launch result to dynamically connect Playwright
      if (server === 'electron' && toolName === 'electron_launch' && toolResult.success) {
        await this.handleElectronLaunchResult(toolResult);
      }

      // Intercept electron_close to disconnect Playwright
      if (server === 'electron' && toolName === 'electron_close') {
        await this.handleElectronClose();
      }

      return toolResult;
    } catch (error: unknown) {
      const errorMessage = toErrorMessage(error);
      return {
        success: false,
        result: `Tool call failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Disconnect from all MCP servers and clean up.
   */
  async disconnect(): Promise<void> {
    const serverNames = Array.from(this.connections.keys());
    for (const server of serverNames) {
      await this.disconnectServer(server);
    }
    this.connected = false;
    this.mockMode = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  isMockMode(): boolean {
    return this.mockMode;
  }

  /**
   * Get the underlying MCP client for a specific server (for advanced usage).
   */
  getClient(server: 'playwright' | 'electron'): Client | undefined {
    return this.connections.get(server)?.client;
  }
}

let defaultClient: MCPClient | null = null;

export function getMCPClient(): MCPClient {
  if (!defaultClient) {
    defaultClient = new MCPClient();
  }
  return defaultClient;
}

export function setMCPClient(client: MCPClient): void {
  defaultClient = client;
}
