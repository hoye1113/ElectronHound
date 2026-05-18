import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

export interface SpawnOptions {
  targetAppPath: string;
  helperPath?: string;
  debuggingPort?: number;
  env?: Record<string, string>;
  timeout?: number;
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
 * Tries require.resolve first, falls back to 'electron' from PATH.
 */
async function resolveElectronPath(): Promise<string> {
  try {
    const resolved = await requireResolve('electron');
    if (resolved) {
      return resolved;
    }
  } catch {
    // Fall through to PATH lookup
  }
  return 'electron';
}

/**
 * ESM-compatible require.resolve wrapper.
 */
async function requireResolve(id: string): Promise<string | null> {
  // Use createRequire for ESM compatibility
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  try {
    return require.resolve(id);
  } catch {
    return null;
  }
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
  } = options;

  const electronPath = await resolveElectronPath();

  const args: string[] = [
    targetAppPath,
    `--remote-debugging-port=${debuggingPort}`,
  ];

  if (helperPath) {
    args.push('--require', helperPath);
  }

  const childEnv = env
    ? { ...process.env, ...env }
    : process.env;

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

  // Set up exit handler
  child.on('exit', (code, signal) => {
    console.log(`[launcher] Electron process exited with code ${code}, signal ${signal}`);
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
