/**
 * Centralised logging interface for agent-core.
 *
 * All runtime modules should import `createStderrLogger` instead of calling
 * `process.stderr.write` or `console.warn` directly.  This makes logs
 * uniform (always `[tag] message\n` on stderr) and easy to redirect or
 * suppress in tests.
 */

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Create a logger that writes to stderr with a `[tag]` prefix.
 *
 * @param tag - Short module identifier (e.g. "runner", "agentLoop").
 */
export function createStderrLogger(tag: string): Logger {
  const write = (message: string): void => {
    process.stderr.write(`[${tag}] ${message}\n`);
  };

  return {
    info: write,
    warn: write,
    error: write,
  };
}
