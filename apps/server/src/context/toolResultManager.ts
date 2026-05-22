/**
 * Tool Result Manager
 *
 * Manages truncation of tool results for context window budgeting.
 * Uses a character-based head + tail preservation strategy to keep
 * the most informative portions of tool output while discarding
 * repetitive middle content.
 *
 * Truncation strategy:
 * - Single tool result limit: 50,000 characters (configurable)
 * - Head preservation: first 1,500 characters
 * - Tail preservation: last 1,500 characters
 * - Truncation marker inserted in the middle showing removed char count
 *
 * Aggregate budget:
 * - Tool results should occupy at most 30% of the total context window
 * - Formula: contextWindow * 4 * 0.3 (assuming 4 chars per token)
 */

/**
 * Result of processing a tool result through the truncation pipeline.
 */
export interface ProcessedResult {
  /** The (possibly truncated) text content */
  text: string;
  /** Estimated token count of the original text */
  originalTokens: number;
  /** Estimated token count of the processed text */
  processedTokens: number;
  /** Whether the result was truncated from the original */
  truncated: boolean;
  /** Ratio of tokens removed (0 = no truncation, 1 = fully removed) */
  truncationRatio: number;
}

/**
 * Default configuration values for ToolResultManager.
 */
const DEFAULTS = {
  /** Maximum characters for a single tool result before truncation */
  maxChars: 50_000,
  /** Number of characters to preserve at the start of truncated output */
  headChars: 1_500,
  /** Number of characters to preserve at the end of truncated output */
  tailChars: 1_500,
  /** Characters per token ratio used for estimation */
  charsPerToken: 4,
  /** Fraction of total context window reserved for tool results */
  toolResultBudgetFraction: 0.3,
} as const;

/**
 * Manages tool result truncation for context window budgeting.
 *
 * Provides character-based truncation with a head + tail preservation
 * strategy. Also tracks aggregate budget across all tool results
 * to keep tool output within a configurable fraction of the context window.
 *
 * Usage:
 * ```typescript
 * const manager = new ToolResultManager();
 *
 * // Process a single tool result
 * const result = manager.process(longText);
 * console.log(result.truncated, result.truncationRatio);
 *
 * // Check aggregate budget
 * const budget = manager.getAggregateBudget(128000); // context window in tokens
 * ```
 */
export class ToolResultManager {
  private readonly maxChars: number;
  private readonly headChars: number;
  private readonly tailChars: number;
  private readonly charsPerToken: number;
  private readonly budgetFraction: number;

  constructor(config?: {
    maxChars?: number;
    headChars?: number;
    tailChars?: number;
    charsPerToken?: number;
    budgetFraction?: number;
  }) {
    this.maxChars = config?.maxChars ?? DEFAULTS.maxChars;
    this.headChars = config?.headChars ?? DEFAULTS.headChars;
    this.tailChars = config?.tailChars ?? DEFAULTS.tailChars;
    this.charsPerToken = config?.charsPerToken ?? DEFAULTS.charsPerToken;
    this.budgetFraction = config?.budgetFraction ?? DEFAULTS.toolResultBudgetFraction;
  }

  /**
   * Process a tool result text, truncating if it exceeds the character limit.
   *
   * Returns a ProcessedResult containing the (possibly truncated) text,
   * original and processed token estimates, and truncation metadata.
   *
   * @param text - The tool result text to process
   * @param maxChars - Override for the maximum character limit (defaults to 50,000)
   * @returns ProcessedResult with truncation metadata
   */
  process(text: string | null | undefined, maxChars?: number): ProcessedResult {
    const safeText = text ?? '';
    const limit = maxChars ?? this.maxChars;
    const originalTokens = this.estimateTokens(safeText);

    if (safeText.length <= limit) {
      return {
        text: safeText,
        originalTokens,
        processedTokens: originalTokens,
        truncated: false,
        truncationRatio: 0,
      };
    }

    const truncatedText = this.truncate(safeText, limit);
    const processedTokens = this.estimateTokens(truncatedText);
    const ratio = originalTokens > 0
      ? 1 - processedTokens / originalTokens
      : 0;

    return {
      text: truncatedText,
      originalTokens,
      processedTokens,
      truncated: true,
      truncationRatio: Math.max(0, Math.min(1, ratio)),
    };
  }

  /**
   * Truncate text using the head + tail preservation strategy.
   *
   * Preserves the first `headChars` (1,500) and last `tailChars` (1,500)
   * characters, inserting a truncation marker in between that reports
   * how many characters were removed.
   *
   * If the text fits within maxChars, it is returned unchanged.
   *
   * @param text - The text to truncate
   * @param maxChars - Maximum allowed character count
   * @returns Truncated text with head + marker + tail, or original if within limit
   */
  truncate(text: string | null | undefined, maxChars: number): string {
    const safeText = text ?? '';

    if (safeText.length === 0) {
      return '';
    }

    if (safeText.length <= maxChars) {
      return safeText;
    }

    // Calculate effective head/tail sizes.
    // When maxChars is very small, scale down proportionally.
    const markerTemplate = (removedChars: number): string =>
      `\n\n... [truncated ~${removedChars} chars] ...\n\n`;

    // Estimate marker size using a generous removed-chars value
    const estimatedRemoved = safeText.length - this.headChars - this.tailChars;
    const sampleMarker = markerTemplate(Math.max(estimatedRemoved, 0));
    const markerChars = sampleMarker.length;

    // Minimum space needed for head + marker + tail
    const minNeeded = this.headChars + this.tailChars + markerChars;

    // If maxChars is too small for the standard strategy, scale down
    if (maxChars < minNeeded) {
      // Allocate 80% to head, 20% to marker (no tail)
      const headChars = Math.max(Math.floor(maxChars * 0.8), 1);
      const head = safeText.slice(0, headChars);
      const removedChars = safeText.length - head.length;
      return head + markerTemplate(removedChars);
    }

    // Standard head + tail strategy
    const head = safeText.slice(0, this.headChars);
    const tail = safeText.slice(safeText.length - this.tailChars);
    const removedChars = safeText.length - this.headChars - this.tailChars;

    return head + markerTemplate(removedChars) + tail;
  }

  /**
   * Estimate the token count for a given text string.
   *
   * Uses a character-to-token ratio approximation (default: 4 chars per token).
   * Always rounds up to avoid under-counting.
   *
   * @param text - The text to estimate tokens for
   * @returns Estimated token count (always >= 0)
   */
  estimateTokens(text: string | null | undefined): number {
    if (!text || text.length === 0) {
      return 0;
    }
    return Math.ceil(text.length / this.charsPerToken);
  }

  /**
   * Calculate the maximum character budget for all tool results combined.
   *
   * Tool results should occupy at most 30% of the total context window
   * to leave room for system prompts, conversation history, and the
   * model's own output.
   *
   * Formula: contextWindow * charsPerToken * budgetFraction
   *
   * @param contextWindow - The model's context window size in tokens
   * @returns Maximum characters allowed for all tool results combined
   */
  getAggregateBudget(contextWindow: number): number {
    if (contextWindow <= 0) {
      return 0;
    }
    return Math.floor(contextWindow * this.charsPerToken * this.budgetFraction);
  }
}

/**
 * Default singleton instance of ToolResultManager.
 *
 * Configured with standard defaults:
 * - 50,000 character limit per tool result
 * - 1,500 character head preservation
 * - 1,500 character tail preservation
 * - 4 characters per token estimation
 * - 30% context window budget for tool results
 */
export const defaultToolResultManager = new ToolResultManager();
