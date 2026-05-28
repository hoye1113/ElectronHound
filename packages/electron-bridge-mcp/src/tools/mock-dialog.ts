import type { BridgeClient } from '../bridge-client.js';

export type DialogType = 'open' | 'save' | 'message';

export interface MockDialogInput {
  type: DialogType;
  response: unknown;
}

export interface MockDialogOutput {
  success: boolean;
  error?: string;
}

export interface MockDialogContext {
  /** IPC bridge client connected to electron-helper */
  bridgeClient: BridgeClient | null;
}

/**
 * Register a dialog mock in the Electron helper module.
 * The next dialog call (open/save/message) will return the mocked response.
 */
export async function mockDialog(
  input: MockDialogInput,
  context: MockDialogContext,
): Promise<MockDialogOutput> {
  if (!context.bridgeClient || !context.bridgeClient.isConnected()) {
    return {
      success: false,
      error: 'Bridge client not connected. Cannot register dialog mock.',
    };
  }

  try {
    await context.bridgeClient.send({
      type: 'mock_dialog',
      payload: { type: input.type, response: input.response },
    });

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
