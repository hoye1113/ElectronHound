/**
 * EATA Compaction - Trigger Logic
 *
 * Detects when context has reached the threshold for compaction.
 * Based on Pi compaction architecture.
 */

/**
 * Configuration for compaction trigger.
 */
export interface CompactionTriggerConfig {
  /**
   * Total context window size in tokens.
   * @default 128000 (GPT-4o context window)
   */
  contextWindow: number;

  /**
   * Tokens to reserve for LLM response.
   * Compaction triggers when: contextTokens > contextWindow - reserveTokens
   * @default 16384
   */
  reserveTokens?: number;

  /**
   * Custom threshold percentage (0-1).
   * If provided, overrides reserveTokens calculation.
   * Example: 0.8 means trigger at 80% of context window.
   * @default undefined (uses reserveTokens)
   */
  thresholdPercentage?: number;

  /**
   * Enable/disable auto-compaction.
   * @default true
   */
  enabled?: boolean;
}

/**
 * Result of trigger check.
 */
export interface TriggerResult {
  /**
   * Whether compaction should be triggered.
   */
  shouldTrigger: boolean;

  /**
   * Current context token count.
   */
  contextTokens: number;

  /**
   * Threshold token count that triggers compaction.
   */
  threshold: number;

  /**
   * Remaining tokens before compaction threshold.
   * Negative if shouldTrigger is true.
   */
  remainingTokens: number;

  /**
   * Usage percentage (0-1).
   */
  usagePercentage: number;
}

/**
 * Create a compaction trigger with the given configuration.
 */
export function createCompactionTrigger(config: CompactionTriggerConfig): {
  /**
   * Check if compaction should be triggered based on current context tokens.
   */
  shouldTrigger: (contextTokens: number) => TriggerResult;

  /**
   * Get the threshold token count.
   */
  getThreshold: () => number;

  /**
   * Check if auto-compaction is enabled.
   */
  isEnabled: () => boolean;
} {
  const {
    contextWindow,
    reserveTokens = 16384,
    thresholdPercentage,
    enabled = true,
  } = config;

  // Calculate threshold
  const threshold =
    thresholdPercentage !== undefined
      ? Math.floor(contextWindow * thresholdPercentage)
      : contextWindow - reserveTokens;

  return {
    shouldTrigger(contextTokens: number): TriggerResult {
      const usagePercentage = contextTokens / contextWindow;
      const remainingTokens = threshold - contextTokens;
      const shouldTrigger = enabled && contextTokens >= threshold;

      return {
        shouldTrigger,
        contextTokens,
        threshold,
        remainingTokens,
        usagePercentage,
      };
    },

    getThreshold(): number {
      return threshold;
    },

    isEnabled(): boolean {
      return enabled;
    },
  };
}

/**
 * Simple check if compaction should trigger.
 * Convenience function for one-off checks.
 */
export function shouldTriggerCompaction(
  contextTokens: number,
  contextWindow: number,
  reserveTokens = 16384,
): boolean {
  const threshold = contextWindow - reserveTokens;
  return contextTokens >= threshold;
}

/**
 * Estimate token count from text.
 * Rough approximation: 1 token ≈ 4 characters for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Default configuration values.
 */
export const COMPACTION_DEFAULTS = {
  contextWindow: 128000,
  reserveTokens: 16384,
  keepRecentTokens: 20000,
  thresholdPercentage: 0.8,
  toolResultMaxChars: 2000,
} as const;
