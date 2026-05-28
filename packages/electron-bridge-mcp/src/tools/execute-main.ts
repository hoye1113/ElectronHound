import type { BridgeClient } from '../bridge-client.js';

export interface ExecuteMainInput {
  code: string;
  timeout?: number;
}

export interface ExecuteMainOutput {
  success: boolean;
  result: unknown;
  error?: string;
}

export interface ExecuteMainContext {
  /** IPC bridge client connected to electron-helper */
  bridgeClient: BridgeClient | null;
}

/**
 * Send code execution request to the Electron helper module via IPC bridge.
 * For v0.1, this sends the code as a string via IPC to the helper module
 * which evaluates it in the Electron main process context.
 */
export async function executeMain(
  input: ExecuteMainInput,
  context: ExecuteMainContext,
): Promise<ExecuteMainOutput> {
  if (!context.bridgeClient || !context.bridgeClient.isConnected()) {
    return {
      success: false,
      result: null,
      error: 'Bridge client not connected. Cannot execute code in Electron main process.',
    };
  }

  try {
    const response = await context.bridgeClient.send({
      type: 'execute_main',
      payload: { code: input.code, timeout: input.timeout },
    });

    if (response.payload && typeof response.payload === 'object') {
      const payload = response.payload as Record<string, unknown>;
      return {
        success: Boolean(payload.success),
        result: payload.data ?? payload,
        error: typeof payload.error === 'string' ? payload.error : undefined,
      };
    }

    return {
      success: true,
      result: response,
    };
  } catch (err: unknown) {
    return {
      success: false,
      result: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
