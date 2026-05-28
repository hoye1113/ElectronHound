import type { BridgeClient } from '../bridge-client.js';

export interface TriggerIpcInput {
  channel: string;
  data: unknown;
}

export interface TriggerIpcOutput {
  success: boolean;
  response: unknown;
  error?: string;
}

export interface TriggerIpcContext {
  /** IPC bridge client connected to electron-helper */
  bridgeClient: BridgeClient | null;
}

/**
 * Send an IPC message to the Electron app via the helper module.
 * The helper module forwards the message to the Electron renderer process.
 */
export async function triggerIpc(
  input: TriggerIpcInput,
  context: TriggerIpcContext,
): Promise<TriggerIpcOutput> {
  if (!context.bridgeClient || !context.bridgeClient.isConnected()) {
    return {
      success: false,
      response: null,
      error: 'Bridge client not connected. Cannot send IPC message.',
    };
  }

  try {
    const response = await context.bridgeClient.send({
      type: 'send_ipc',
      payload: { channel: input.channel, data: input.data },
    });

    if (response.payload && typeof response.payload === 'object') {
      const payload = response.payload as Record<string, unknown>;
      return {
        success: Boolean(payload.success),
        response: payload.data ?? null,
        error: typeof payload.error === 'string' ? payload.error : undefined,
      };
    }

    return {
      success: true,
      response: response,
    };
  } catch (err: unknown) {
    return {
      success: false,
      response: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
