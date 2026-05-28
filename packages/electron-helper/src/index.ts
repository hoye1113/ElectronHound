// This module is loaded via --require before Electron app code runs.
// It sets the CDP port and establishes IPC communication with the bridge server.

import { IpcChannel } from './ipc-channel.js';
import { OperationHandler } from './operation-handler.js';

export interface HelperConfig {
  /** CDP remote debugging port. Defaults to 0 (auto-assign). */
  cdpPort?: number;
  /** Path to Unix socket or named pipe for IPC. */
  bridgeSocketPath?: string;
  /** TCP port for IPC (alternative to socketPath). */
  bridgePort?: number;
}

export { IpcChannel, OperationHandler };
export type { IpcMessage } from './ipc-channel.js';
export type { Operation, OperationResult } from './operation-handler.js';

// --- Electron detection ---

/**
 * Check if we are running inside an Electron main process.
 * Uses dynamic require to avoid bundler issues in non-Electron contexts.
 */
function isElectronMain(): boolean {
  try {
    // In Electron, 'electron' module is available
    // We check for the 'app' property which only exists in the main process
    const electronModule = eval('require')('electron') as Record<string, unknown>;
    return electronModule !== null && 'app' in electronModule;
  } catch (err: unknown) {
    process.stderr.write(`[electron-helper] isElectronMain: ${err instanceof Error ? err.message : String(err)}\n`);
    return false;
  }
}

/**
 * Set the CDP remote debugging port via Electron's commandLine API.
 * Must be called before app.ready event.
 */
function setCdpPort(port: number): void {
  if (!isElectronMain()) return;

  try {
    const electronModule = eval('require')('electron') as Record<string, unknown>;
    const app = electronModule['app'] as Record<string, unknown> | undefined;
    const commandLine = app?.['commandLine'] as
      | { appendSwitch: (switchName: string, value: string) => void }
      | undefined;

    if (commandLine && typeof commandLine.appendSwitch === 'function') {
      commandLine.appendSwitch('remote-debugging-port', String(port));
    }
  } catch (err: unknown) {
    process.stderr.write(`[electron-helper] setCdpPort: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

// --- Auto-initialization ---

let initialized = false;
let activeChannel: IpcChannel | null = null;
let activeHandler: OperationHandler | null = null;

/**
 * Initialize the electron-helper.
 *
 * When loaded in Electron: sets CDP port and starts IPC channel.
 * When loaded in Node.js (testing): exports are available but nothing auto-invokes.
 */
export function initialize(config?: HelperConfig): void {
  if (initialized) return;
  initialized = true;

  if (!isElectronMain()) {
    // Not in Electron — just make exports available, don't auto-invoke
    return;
  }

  const cdpPort = config?.cdpPort ?? 0;
  setCdpPort(cdpPort);

  // Start IPC channel if configured
  if (config?.bridgeSocketPath || config?.bridgePort) {
    activeChannel = new IpcChannel(config.bridgeSocketPath, config.bridgePort);
    activeHandler = new OperationHandler();

    activeChannel
      .connect()
      .then(() => {
        activeChannel!.onMessage((message) => {
          if (activeHandler) {
            void activeHandler
              .handle(message as Parameters<typeof activeHandler.handle>[0])
              .then((result) => {
                void activeChannel!.send({
                  type: 'operation_result',
                  id: message.id,
                  payload: result,
                });
              })
              .catch((err: Error) => {
                void activeChannel!.send({
                  type: 'operation_error',
                  id: message.id,
                  payload: { error: err.message },
                });
              });
          }
        });
      })
      .catch(() => {
        // Connection failed — channel will auto-reconnect
      });
  }
}

// Auto-invoke when loaded via --require in Electron
if (isElectronMain()) {
  initialize();
}
