import type { ElectronProcess } from '@eata/launcher';

export interface ElectronCloseInput {
  pid: number;
}

export interface ElectronCloseOutput {
  success: boolean;
}

export interface CloseContext {
  /** Registry of running Electron processes, keyed by PID */
  processRegistry: Map<number, ElectronProcess>;
}

/**
 * Kill an Electron process by PID.
 */
export async function electronClose(
  input: ElectronCloseInput,
  context: CloseContext,
): Promise<ElectronCloseOutput> {
  const electronProcess = context.processRegistry.get(input.pid);

  if (!electronProcess) {
    // Process not in registry — try OS-level kill
    try {
      process.kill(input.pid, 'SIGTERM');
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  electronProcess.kill();
  context.processRegistry.delete(input.pid);

  return { success: true };
}
