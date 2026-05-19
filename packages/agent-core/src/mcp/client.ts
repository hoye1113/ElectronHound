export interface MCPToolCall {
  server: 'playwright' | 'electron';
  toolName: string;
  args: Record<string, unknown>;
}

export interface MCPToolResult {
  success: boolean;
  result: unknown;
}

export interface MCPClientConfig {
  playwrightCdpUrl?: string;
  electronBridgeSocketPath?: string;
}

export class MCPClient {
  private connected = false;

  async connect(config: MCPClientConfig): Promise<void> {
    this.connected = true;
  }

  async callTool(
    server: 'playwright' | 'electron',
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    if (!this.connected) {
      return { success: false, result: 'MCP client not connected' };
    }
    return { success: true, result: `mock-${server}-${toolName}: ${JSON.stringify(args)}` };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
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
