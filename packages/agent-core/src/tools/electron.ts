/**
 * EATA Electron Tools
 *
 * 5 electron tools for Electron CDP integration:
 * launch, close, execute_main, trigger_ipc, mock_dialog
 *
 * All tools extend ElectronTool base class and implement Tool.invoke().
 */

import { z } from 'zod';
import type {
  Tool,
  ToolResult,
  ToolParams,
  ElectronContext,
  LaunchParams,
  CloseParams,
  ExecuteMainParams,
  TriggerIpcParams,
  MockDialogParams,
} from './types.js';

// ─── Zod schemas ────────────────────────────────────────────────────────

const launchSchema = z.object({
  appPath: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  enableCdp: z.boolean().optional().default(true),
  cdpPort: z.number().int().positive().optional(),
});

const closeSchema = z.object({
  force: z.boolean().optional().default(false),
  timeout: z.number().int().positive().optional(),
});

const executeMainSchema = z.object({
  code: z.string().min(1),
  timeout: z.number().int().positive().optional(),
});

const triggerIpcSchema = z.object({
  channel: z.string().min(1),
  payload: z.unknown().optional(),
  expectResponse: z.boolean().optional().default(false),
  timeout: z.number().int().positive().optional(),
});

const mockDialogSchema = z.object({
  type: z.enum(['alert', 'confirm', 'prompt']),
  response: z.union([z.string(), z.boolean()]).optional(),
  dismiss: z.boolean().optional().default(false),
});

// ─── Base class ─────────────────────────────────────────────────────────

/**
 * Base class for Electron tools.
 * Holds a reference to the injected ElectronContext for CDP.
 */
export abstract class ElectronTool implements Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly schema: z.ZodSchema<unknown>;

  constructor(protected readonly context: ElectronContext) {}

  abstract invoke(params: ToolParams): Promise<ToolResult>;
}

// ─── Concrete tools ─────────────────────────────────────────────────────

export class LaunchElectronTool extends ElectronTool {
  readonly name = 'launch';
  readonly description = 'Launch an Electron application';
  readonly schema = launchSchema;

  async invoke(params: ToolParams): Promise<ToolResult> {
    const p = params as unknown as LaunchParams;
    try {
      const data = (await this.context.launch(p)) as Record<string, unknown>;
      return {
        success: true,
        data: { launched: true, appPath: p.appPath, ...data },
      };
    } catch (err: unknown) {
      return { success: false, error: `Launch failed: ${errMsg(err)}` };
    }
  }
}

export class CloseElectronTool extends ElectronTool {
  readonly name = 'close';
  readonly description = 'Close a running Electron application';
  readonly schema = closeSchema;

  async invoke(params: ToolParams): Promise<ToolResult> {
    const p = params as unknown as CloseParams;
    try {
      await this.context.close(p);
      return { success: true, data: { closed: true } };
    } catch (err: unknown) {
      return { success: false, error: `Close failed: ${errMsg(err)}` };
    }
  }
}

export class ExecuteMainTool extends ElectronTool {
  readonly name = 'execute_main';
  readonly description = 'Execute JavaScript code in the Electron main process';
  readonly schema = executeMainSchema;

  async invoke(params: ToolParams): Promise<ToolResult> {
    const { code, timeout } = params as unknown as ExecuteMainParams;
    try {
      const data = await this.context.executeMain(code, timeout);
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: `ExecuteMain failed: ${errMsg(err)}` };
    }
  }
}

export class TriggerIpcTool extends ElectronTool {
  readonly name = 'trigger_ipc';
  readonly description = 'Trigger an IPC event on a specific channel';
  readonly schema = triggerIpcSchema;

  async invoke(params: ToolParams): Promise<ToolResult> {
    const { channel, payload, expectResponse, timeout } = params as unknown as TriggerIpcParams;
    try {
      const data = (await this.context.triggerIpc(channel, payload, {
        expectResponse,
        timeout,
      })) as Record<string, unknown>;
      return {
        success: true,
        data: { channel, ...data },
      };
    } catch (err: unknown) {
      return { success: false, error: `TriggerIPC failed: ${errMsg(err)}` };
    }
  }
}

export class MockDialogTool extends ElectronTool {
  readonly name = 'mock_dialog';
  readonly description = 'Mock a native dialog (alert, confirm, prompt) with an auto-response';
  readonly schema = mockDialogSchema;

  async invoke(params: ToolParams): Promise<ToolResult> {
    const { type, response, dismiss } = params as unknown as MockDialogParams;
    try {
      await this.context.mockDialog(type, {
        response,
        dismiss,
      });
      return {
        success: true,
        data: { mocked: true, type, response },
      };
    } catch (err: unknown) {
      return { success: false, error: `MockDialog failed: ${errMsg(err)}` };
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

/**
 * Create all 5 electron tools for the given electron context.
 */
export function createElectronTools(context: ElectronContext): ElectronTool[] {
  return [
    new LaunchElectronTool(context),
    new CloseElectronTool(context),
    new ExecuteMainTool(context),
    new TriggerIpcTool(context),
    new MockDialogTool(context),
  ];
}

// ─── Helpers ────────────────────────────────────────────────────────────

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
