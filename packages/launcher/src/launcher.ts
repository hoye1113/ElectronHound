import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectElectronVersion } from './version-detect.js';

export interface SpawnOptions {
  targetAppPath: string;
  helperPath?: string;
  debuggingPort?: number;
  env?: Record<string, string>;
  timeout?: number;
  /** Extra Chromium/Electron CLI flags (e.g. ['--no-sandbox'] for CI). */
  electronFlags?: string[];
  /**
   * Skip version compatibility check.
   * When false (default), the launcher detects the Electron version
   * and warns if it's outside the supported range.
   */
  skipVersionCheck?: boolean;
  /**
   * Task ID for user-data-dir isolation (PR-4).
   * When set, creates a unique temp directory for Electron's user data,
   * preventing state conflicts when multiple workers test the same app.
   */
  taskId?: string;
}

export interface ElectronProcess {
  pid: number;
  process: ChildProcess;
  cdpPort: number;
  kill: () => void;
}

const DEFAULT_DEBUGGING_PORT = 0;
const DEFAULT_TIMEOUT = 30_000;

/**
 * Resolve the Electron binary path.
 * Uses require('electron') which returns the path to the electron binary
 * (not require.resolve which returns index.js).
 * Falls back to 'electron' from PATH if not found.
 */
async function resolveElectronPath(): Promise<string> {
  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    // require('electron') returns the binary path string, not the module
    const electronPath = require('electron') as string;
    if (typeof electronPath === 'string' && electronPath.length > 0) {
      return electronPath;
    }
  } catch (err: unknown) {
    process.stderr.write(`[launcher] resolveElectronPath: ${err instanceof Error ? err.message : String(err)}\n`);
  }
  return 'electron';
}

/**
 * Spawn an Electron application with CDP debugging enabled.
 *
 * @param options - Spawn configuration
 * @returns Promise resolving to an ElectronProcess handle
 */
export async function spawnElectron(options: SpawnOptions): Promise<ElectronProcess> {
  const {
    targetAppPath,
    helperPath,
    debuggingPort = DEFAULT_DEBUGGING_PORT,
    env,
    timeout = DEFAULT_TIMEOUT,
    electronFlags,
    skipVersionCheck = false,
    taskId,
  } = options;

  const electronPath = await resolveElectronPath();

  // Version compatibility check (PR-16)
  if (!skipVersionCheck) {
    const versionInfo = await detectElectronVersion({ electronPath });
    if (versionInfo && !versionInfo.isSupported) {
      process.stderr.write(
        `[launcher] WARNING: Detected Electron v${versionInfo.major} which is outside the supported range.\n`,
      );
    }
  }

  const args: string[] = [
    targetAppPath,
    `--remote-debugging-port=${debuggingPort}`,
  ];

  // PR-4: User-data-dir isolation for concurrent workers
  let userDataDir: string | null = null;
  if (taskId) {
    userDataDir = mkdtempSync(join(tmpdir(), `eata-${taskId}-`));
    args.push(`--user-data-dir=${userDataDir}`);
  }

  if (helperPath) {
    args.push('--require', helperPath);
  }

  // Append extra Electron/Chromium flags (e.g. --no-sandbox for CI)
  // Supports both explicit flags and ELECTRON_FLAGS env var (comma-separated)
  const envFlags = process.env.ELECTRON_FLAGS
    ? process.env.ELECTRON_FLAGS.split(',').map((f) => f.trim()).filter(Boolean)
    : [];
  const allFlags = [...(electronFlags ?? []), ...envFlags];
  if (allFlags.length > 0) {
    args.push(...allFlags);
  }

  const childEnv: Record<string, string | undefined> = env
    ? { ...process.env, ...env }
    : { ...process.env };

  // ELECTRON_RUN_AS_NODE=1 (set by VS Code, CI, etc.) makes the electron binary
  // run as plain Node.js instead of Electron. Always unset it so the app loads
  // with the full Electron API (app, BrowserWindow, ipcMain, …).
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(electronPath, args, {
    env: childEnv as NodeJS.ProcessEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });

  const kill = () => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  };

  // Set up error handler to prevent unhandled exceptions
  child.on('error', (err) => {
    // Error is emitted; consumers can listen via child.on('error')
    // We don't throw here to allow graceful handling
    console.error(`[launcher] Electron process error: ${err.message}`);
  });

  // Set up exit handler with user-data-dir cleanup
  child.on('exit', (code, signal) => {
    console.log(`[launcher] Electron process exited with code ${code}, signal ${signal}`);
    // PR-4: Clean up temporary user-data-dir after process exits
    if (userDataDir) {
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup; ignore errors
      }
    }
  });

  // Resolve the actual CDP port from stderr output
  // Electron prints "DevTools listening on ws://127.0.0.1:<port>/..." to stderr
  const cdpPort = await resolveCDPPortFromStderr(child, timeout);

  return {
    pid: child.pid!,
    process: child,
    cdpPort,
    kill,
  };
}

/**
 * Parse the CDP port from Electron's stderr output.
 * Electron prints: "DevTools listening on ws://127.0.0.1:<port>/..."
 */
function resolveCDPPortFromStderr(
  child: ChildProcess,
  timeout: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for CDP port after ${timeout}ms`));
    }, timeout);

    const portRegex = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//;

    const onData = (data: Buffer) => {
      const match = data.toString().match(portRegex);
      if (match) {
        cleanup();
        resolve(Number(match[1]));
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const onExit = (code: number | null, signal: string | null) => {
      cleanup();
      reject(new Error(`Electron process exited before CDP ready (code: ${code}, signal: ${signal})`));
    };

    function cleanup() {
      clearTimeout(timer);
      child.stderr?.off('data', onData);
      child.off('error', onError);
      child.off('exit', onExit);
    }

    child.stderr?.on('data', onData);
    child.on('error', onError);
    child.on('exit', onExit);
  });
}
