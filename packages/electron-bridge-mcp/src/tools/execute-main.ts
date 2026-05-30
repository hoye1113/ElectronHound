import type { BridgeClient } from '../bridge-client.js';
import type { TrustLevel, TrustConfig } from '@eata/shared-types';
import { APP_CONTEXT_TRUST_CONFIG, TRUST_CONFIGS } from '@eata/shared-types';
import { analyzeCode } from '@eata/agent-core/security/astAnalyzer';

export interface ExecuteMainInput {
  code: string;
  timeout?: number;
  /**
   * Trust level for code execution permission grading.
   * Defaults to 'app-context' if not specified.
   */
  trustLevel?: TrustLevel;
  /**
   * Custom trust configuration. If provided, overrides the default
   * config for the specified trust level.
   */
  trustConfig?: TrustConfig;
}

export interface ExecuteMainOutput {
  success: boolean;
  result: unknown;
  error?: string;
  /**
   * Security analysis result, included when code is blocked
   * or when analysis is performed.
   */
  securityAnalysis?: {
    safe: boolean;
    blockedPatterns: string[];
    trustLevel: TrustLevel;
  };
}

export interface ExecuteMainContext {
  /** IPC bridge client connected to electron-helper */
  bridgeClient: BridgeClient | null;
}

/**
 * Send code execution request to the Electron helper module via IPC bridge.
 * For v0.1, this sends the code as a string via IPC to the helper module
 * which evaluates it in the Electron main process context.
 *
 * PR-15: Before execution, the code is analyzed against the trust level
 * configuration. If dangerous patterns are detected that violate the
 * trust level, execution is blocked and a security analysis is returned.
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

  // ── PR-15: Trust level permission grading ─────────────────────────────────
  const trustLevel = input.trustLevel ?? 'app-context';
  const trustConfig = input.trustConfig ?? TRUST_CONFIGS[trustLevel] ?? APP_CONTEXT_TRUST_CONFIG;

  const analysis = analyzeCode(input.code, trustConfig);

  if (!analysis.safe) {
    const blockedPatterns = analysis.findings
      .filter((f) => f.blocked)
      .map((f) => f.pattern);

    return {
      success: false,
      result: null,
      error: `Code execution blocked by trust level "${trustLevel}". Violations: ${blockedPatterns.join(', ')}`,
      securityAnalysis: {
        safe: false,
        blockedPatterns,
        trustLevel: analysis.trustLevel,
      },
    };
  }

  // ── Execute code via IPC bridge ───────────────────────────────────────────
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
