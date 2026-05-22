/**
 * Server Context Management — Type Definitions
 *
 * Types for the multi-level context compression system.
 * Aligns with agent-core's compaction module but provides
 * a four-level compression model for server-side decisions.
 *
 * @see packages/agent-core/src/compaction/trigger.ts
 */

/**
 * Four-level compression trigger indicating which compression
 * strategy should be applied to the conversation context.
 *
 * - `'collapse'`   — Critical: context near capacity, aggressively collapse messages
 * - `'auto-compact'` — High: trigger automatic compaction with summary generation
 * - `'compact'`     — Moderate: perform lightweight compaction (truncate old tool results)
 * - `'none'`        — No compression needed; context usage is within safe bounds
 */
export type CompressionLevel = 'collapse' | 'auto-compact' | 'compact' | 'none';

/**
 * Threshold percentages (0–1) for each compression level.
 * Each value represents the context-window utilization ratio (usedTokens / contextWindow)
 * at which the corresponding compression level activates.
 *
 * Thresholds are checked from highest to lowest:
 *   collapse > auto-compact > compact > none
 *
 * @example
 * If `collapse` is 0.95 and the context window is 128000 tokens,
 * collapse triggers at 121600 tokens.
 */
export interface ThresholdConfig {
  /**
   * Utilization ratio that triggers aggressive message collapse.
   * @default 0.95
   */
  collapse: number;

  /**
   * Utilization ratio that triggers automatic compaction with summary.
   * @default 0.93
   */
  autoCompact: number;

  /**
   * Utilization ratio that triggers lightweight compaction.
   * @default 0.80
   */
  compact: number;
}

/**
 * Model context window configuration.
 * Represents the token budget constraints for a specific LLM model.
 *
 * @example
 * ```ts
 * const gpt4o: ModelContextWindow = {
 *   modelName: 'gpt-4o',
 *   contextWindow: 128000,
 *   maxOutputTokens: 16384,
 * };
 * ```
 */
export interface ModelContextWindow {
  /** Identifier of the LLM model (e.g., `'gpt-4o'`, `'deepseek-chat'`) */
  modelName: string;

  /**
   * Total context window size in tokens.
   * @default 128000
   */
  contextWindow: number;

  /**
   * Maximum tokens reserved for model output/response.
   * @default 16384
   */
  maxOutputTokens: number;
}

/**
 * Immutable snapshot of token usage at a specific point in time.
 * Captured after each agent step to enable threshold checking
 * and historical tracking.
 */
export interface TokenSnapshot {
  /** Current total token count across all messages in the context */
  usedTokens: number;

  /** Total context window size in tokens (from the model config) */
  contextWindow: number;

  /**
   * Utilization ratio (0–1).
   * Computed as `usedTokens / contextWindow`.
   */
  usagePercentage: number;

  /** Tokens reserved for model output */
  reservedTokens: number;

  /**
   * Remaining tokens available before hitting the context limit.
   * Computed as `contextWindow - usedTokens - reservedTokens`.
   */
  availableTokens: number;

  /** ISO 8601 timestamp of when this snapshot was taken */
  timestamp: string;

  /** Optional step/metadata tag for the snapshot (e.g., step number) */
  label?: string;
}

/**
 * Decision result from a threshold check, indicating which compression
 * level should be applied and why.
 */
export interface CompressionDecision {
  /** The compression level that should be applied */
  level: CompressionLevel;

  /** The token snapshot that was evaluated */
  snapshot: TokenSnapshot;

  /** Whether compression is needed (true when level !== 'none') */
  needsCompression: boolean;

  /**
   * Human-readable reason explaining why this decision was reached.
   * @example "Context at 82% utilization — exceeds auto-compact threshold of 80%"
   */
  reason: string;

  /** ISO 8601 timestamp of when the decision was made */
  timestamp: string;
}

// ──────────────────────────────────────────────────────────
// Default Constants
// ──────────────────────────────────────────────────────────

/**
 * Default threshold percentages for each compression level.
 * Values are utilization ratios (0–1).
 *
 * Ordered: collapse > auto-compact > compact.
 */
export const DEFAULT_THRESHOLDS: Readonly<ThresholdConfig> = {
  collapse: 0.95,
  autoCompact: 0.93,
  compact: 0.80,
} as const;

/**
 * Default model context window configuration.
 * Based on GPT-4o specifications.
 */
export const DEFAULT_MODEL_CONTEXT_WINDOW: Readonly<ModelContextWindow> = {
  modelName: 'gpt-4o',
  contextWindow: 128_000,
  maxOutputTokens: 16_384,
} as const;
