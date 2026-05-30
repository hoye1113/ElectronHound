import { z } from 'zod/v4';

// ============================================================================
// Trust Level System for execute_main Permission Grading (PR-15)
// ============================================================================

/**
 * Trust levels control what code the AI agent is allowed to execute
 * in the Electron main process via execute_main.
 *
 * - `readonly`:   No writes, no network, no filesystem access.
 *                 Allows reading app state and UI queries only.
 *
 * - `app-context`: App APIs allowed (e.g. BrowserWindow, app.getPath),
 *                  but no host-level access (no child_process, no fs writes
 *                  outside app directories). This is the default.
 *
 * - `host-full`:  Everything allowed, including arbitrary filesystem,
 *                  network, and process control. Requires explicit opt-in
 *                  and shows a warning in the dashboard.
 */
export const TrustLevelSchema = z.enum(['readonly', 'app-context', 'host-full']);
export type TrustLevel = z.infer<typeof TrustLevelSchema>;

/**
 * Configuration for a trust level, specifying which APIs are allowed
 * or explicitly denied at that level.
 */
export const TrustConfigSchema = z.object({
  /** The active trust level */
  level: TrustLevelSchema,
  /**
   * Explicit list of allowed API patterns (glob-style strings).
   * When non-empty, only matching APIs are permitted.
   * Example: ['BrowserWindow.*', 'app.getPath']
   */
  allowed: z.array(z.string()).optional().default([]),
  /**
   * Explicit list of denied API patterns (glob-style strings).
   * Takes precedence over `allowed` — if an API matches both,
   * it is denied.
   * Example: ['child_process.*', 'fs.writeFileSync']
   */
  denied: z.array(z.string()).optional().default([]),
});
export type TrustConfig = z.infer<typeof TrustConfigSchema>;

// ─── Default trust configurations per level ─────────────────────────────────

/** Default config for `readonly` level */
export const READONLY_TRUST_CONFIG: TrustConfig = {
  level: 'readonly',
  allowed: [],
  denied: [
    'fs.*',
    'child_process.*',
    'net.*',
    'http.*',
    'https.*',
    'dgram.*',
    'dns.*',
    'process.exit',
    'process.kill',
    'os.homedir',
    'os.hostname',
    'require',
  ],
};

/** Default config for `app-context` level (default for execute_main) */
export const APP_CONTEXT_TRUST_CONFIG: TrustConfig = {
  level: 'app-context',
  allowed: [],
  denied: [
    'child_process.*',
    'require',
    'fs.*',
    'os.*',
    'process.exit',
    'process.kill',
    'process.env',
    'net.connect',
    'net.createServer',
    'http',
    'https',
    'dgram.*',
    'dns.*',
    'cluster.*',
    'vm.runInThisContext',
    'vm.runInNewContext',
    'eval',
    'new Function',
    'import',
  ],
};

/** Default config for `host-full` level */
export const HOST_FULL_TRUST_CONFIG: TrustConfig = {
  level: 'host-full',
  allowed: [],
  denied: [],
};

/** Lookup table from trust level to its default config */
export const TRUST_CONFIGS: Record<TrustLevel, TrustConfig> = {
  readonly: READONLY_TRUST_CONFIG,
  'app-context': APP_CONTEXT_TRUST_CONFIG,
  'host-full': HOST_FULL_TRUST_CONFIG,
};
