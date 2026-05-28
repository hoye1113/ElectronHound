import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { z } from 'zod/v4';

import { BridgeClient } from './bridge-client.js';
import type { ElectronProcess } from '@eata/launcher';

import { electronLaunch } from './tools/electron-launch.js';
import { electronClose } from './tools/electron-close.js';
import { executeMain } from './tools/execute-main.js';
import { triggerIpc } from './tools/trigger-ipc.js';
import { mockDialog } from './tools/mock-dialog.js';

// --- Tool input schemas ---

const ElectronLaunchSchema = z.object({
  targetAppPath: z.string(),
  helperPath: z.string().optional(),
  debuggingPort: z.number().int().nonnegative().optional(),
});

const ElectronCloseSchema = z.object({
  pid: z.number().int().positive(),
});

const ExecuteMainSchema = z.object({
  code: z.string(),
  timeout: z.number().int().positive().optional(),
});

const TriggerIpcSchema = z.object({
  channel: z.string(),
  data: z.unknown(),
});

const MockDialogSchema = z.object({
  type: z.enum(['open', 'save', 'message']),
  response: z.unknown(),
});

/**
 * Create and configure the Electron Bridge MCP server.
 * Returns the server before connecting to a transport, for testability.
 */
export function createServer(options?: {
  bridgeClient?: BridgeClient;
}): { server: McpServer; bridgeClient: BridgeClient; processRegistry: Map<number, ElectronProcess> } {
  const mcpServer = new McpServer(
    { name: 'electron-bridge-mcp', version: '0.1.0' },
    {
      instructions:
        'Electron Bridge MCP server for Electron app automation. Use electron_launch to start an Electron app, then use execute_main and trigger_ipc to interact with it. Use mock_dialog to intercept native dialogs. Use electron_close to clean up.',
    },
  );

  const processRegistry = new Map<number, ElectronProcess>();
  const bridgeClient = options?.bridgeClient ?? new BridgeClient();

  // --- Register tools ---

  mcpServer.registerTool(
    'electron_launch',
    {
      description: 'Launch an Electron application with CDP debugging enabled. Returns the process PID, CDP port, and WebSocket URL for Playwright connection.',
      inputSchema: ElectronLaunchSchema,
    },
    async (args) => {
      const result = await electronLaunch(args, { processRegistry });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    },
  );

  mcpServer.registerTool(
    'electron_close',
    {
      description: 'Kill a running Electron application by its PID.',
      inputSchema: ElectronCloseSchema,
    },
    async (args) => {
      const result = await electronClose(args, { processRegistry });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    },
  );

  mcpServer.registerTool(
    'execute_main',
    {
      description: 'Execute JavaScript code in the Electron main process context via the helper module IPC bridge. Returns the execution result.',
      inputSchema: ExecuteMainSchema,
    },
    async (args) => {
      const result = await executeMain(args, { bridgeClient });
      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: result.error ?? 'Unknown error' }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result.result) }],
        structuredContent: { result: result.result },
      };
    },
  );

  mcpServer.registerTool(
    'trigger_ipc',
    {
      description: 'Send an IPC message to the Electron app via the helper module. The message is forwarded to the renderer process.',
      inputSchema: TriggerIpcSchema,
    },
    async (args) => {
      const result = await triggerIpc(args, { bridgeClient });
      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: result.error ?? 'Unknown error' }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result.response) }],
        structuredContent: { response: result.response },
      };
    },
  );

  mcpServer.registerTool(
    'mock_dialog',
    {
      description: 'Register a mock for Electron native dialogs (open, save, message). The next dialog call of the specified type will return the mocked response.',
      inputSchema: MockDialogSchema,
    },
    async (args) => {
      const result = await mockDialog(args, { bridgeClient });
      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: result.error ?? 'Unknown error' }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }],
      };
    },
  );

  return { server: mcpServer, bridgeClient, processRegistry };
}

/**
 * Auto-start the MCP server with stdio transport when run directly.
 * Exported for testability.
 */
export async function main(): Promise<void> {
  const { server } = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Electron Bridge MCP server running on stdio');
}

// Detect if this is the main module
const isMainModule =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;

if (isMainModule) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
