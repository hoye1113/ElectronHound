import { spawnElectron } from '@eata/launcher';
import { getWebSocketUrl } from '@eata/launcher';
import type { ElectronProcess } from '@eata/launcher';

export interface ElectronLaunchInput {
  targetAppPath: string;
  helperPath?: string;
  debuggingPort?: number;
  /** Extra Chromium/Electron CLI flags (e.g. ['--no-sandbox'] for CI). */
  electronFlags?: string[];
}

export interface ElectronLaunchOutput {
  pid: number;
  cdpPort: number;
  webSocketUrl: string;
}

export interface LaunchContext {
  /** Registry of running Electron processes, keyed by PID */
  processRegistry: Map<number, ElectronProcess>;
}

/**
 * Launch an Electron application with CDP debugging enabled.
 * Uses @eata/launcher spawnElectron and CDP discovery.
 */
export async function electronLaunch(
  input: ElectronLaunchInput,
  context: LaunchContext,
): Promise<ElectronLaunchOutput> {
  const electronProcess = await spawnElectron({
    targetAppPath: input.targetAppPath,
    helperPath: input.helperPath,
    debuggingPort: input.debuggingPort ?? 0,
    electronFlags: input.electronFlags,
  });

  // Register process for later cleanup
  context.processRegistry.set(electronProcess.pid, electronProcess);

  // Discover WebSocket URL from CDP endpoint
  const webSocketUrl = await getWebSocketUrl(electronProcess.cdpPort);

  return {
    pid: electronProcess.pid,
    cdpPort: electronProcess.cdpPort,
    webSocketUrl,
  };
}
