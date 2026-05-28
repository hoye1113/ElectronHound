/**
 * EATA Electron Tools
 *
 * 5 electron tools for Electron CDP integration:
 * launch, close, execute_main, trigger_ipc, mock_dialog
 *
 * All tools extend ElectronTool base class and implement Tool.invoke().
 */

import { z } from 'zod';
import { toErrorMessage } from '../utils/error.js';
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
 * @template P - The parameter type for this tool (defaults to ToolParams).
 */
export abstract class ElectronTool<P = ToolParams> implements Tool<P> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly schema: z.ZodSchema<unknown>;

  constructor(protected readonly context: ElectronContext) {}

  abstract invoke(params: P): Promise<ToolResult>;
}

// ─── Concrete tools ─────────────────────────────────────────────────────

export class LaunchElectronTool extends ElectronTool<LaunchParams> {
  readonly name = 'launch';
  readonly description = 'Launch an Electron application';
  readonly schema = launchSchema;

  async invoke(params: LaunchParams): Promise<ToolResult> {
    try {
      const data = (await this.context.launch(params)) as Record<string, unknown>;
      return {
        success: true,
        data: { launched: true, appPath: params.appPath, ...data },
      };
    } catch (err: unknown) {
      return { success: false, error: `Launch failed: ${toErrorMessage(err)}` };
    }
  }
}

export class CloseElectronTool extends ElectronTool<CloseParams> {
  readonly name = 'close';
  readonly description = 'Close a running Electron application';
  readonly schema = closeSchema;

  async invoke(params: CloseParams): Promise<ToolResult> {
    try {
      await this.context.close(params);
      return { success: true, data: { closed: true } };
    } catch (err: unknown) {
      return { success: false, error: `Close failed: ${toErrorMessage(err)}` };
    }
  }
}

export class ExecuteMainTool extends ElectronTool<ExecuteMainParams> {
  readonly name = 'execute_main';
  readonly description = 'Execute JavaScript code in the Electron main process';
  readonly schema = executeMainSchema;

  async invoke(params: ExecuteMainParams): Promise<ToolResult> {
    try {
      const data = await this.context.executeMain(params.code, params.timeout);
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: `ExecuteMain failed: ${toErrorMessage(err)}` };
    }
  }
}

export class TriggerIpcTool extends ElectronTool<TriggerIpcParams> {
  readonly name = 'trigger_ipc';
  readonly description = 'Trigger an IPC event on a specific channel';
  readonly schema = triggerIpcSchema;

  async invoke(params: TriggerIpcParams): Promise<ToolResult> {
    try {
      const data = (await this.context.triggerIpc(params.channel, params.payload, {
        expectResponse: params.expectResponse,
        timeout: params.timeout,
      })) as Record<string, unknown>;
      return {
        success: true,
        data: { channel: params.channel, ...data },
      };
    } catch (err: unknown) {
      return { success: false, error: `TriggerIPC failed: ${toErrorMessage(err)}` };
    }
  }
}

export class MockDialogTool extends ElectronTool<MockDialogParams> {
  readonly name = 'mock_dialog';
  readonly description = 'Mock a native dialog (alert, confirm, prompt) with an auto-response';
  readonly schema = mockDialogSchema;

  async invoke(params: MockDialogParams): Promise<ToolResult> {
    try {
      await this.context.mockDialog(params.type, {
        response: params.response,
        dismiss: params.dismiss,
      });
      return {
        success: true,
        data: { mocked: true, type: params.type, response: params.response },
      };
    } catch (err: unknown) {
      return { success: false, error: `MockDialog failed: ${toErrorMessage(err)}` };
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

/**
 * Create all 5 electron tools for the given electron context.
 */
export function createElectronTools(context: ElectronContext): Tool[] {
  return [
    new LaunchElectronTool(context),
    new CloseElectronTool(context),
    new ExecuteMainTool(context),
    new TriggerIpcTool(context),
    new MockDialogTool(context),
  ] as Tool[];
}

