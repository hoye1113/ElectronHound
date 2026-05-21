/**
 * EATA Compaction - Tool Result Truncator
 *
 * Provides intelligent truncation of tool results to stay within token budgets.
 * When truncation is needed, it preserves both the beginning and end of the
 * result (where key information typically lives) and replaces the middle with
 * a clear truncation marker.
 *
 * Key features:
 * - Character-based token estimation (~4 chars/token for English text)
 * - Head + tail preservation strategy (40% head, 60% tail by default)
 * - Clear truncation markers showing removed token count
 * - Safe handling of empty/edge-case inputs
 *
 * Why head + tail?
 * Tool results often contain context/setup at the start and the actual
 * output/errors at the end. Preserving both sides retains the most
 * actionable information while discarding repetitive middle content
 * (e.g., file listings, repeated log lines).
 */

import type { ToolResult } from './types.js';

/**
 * Default configuration for ToolResultTruncator.
 */
export const TRUNCATOR_DEFAULTS = {
  /** Default maximum tokens for a tool result */
  maxTokens: 2048,
  /** Characters per token ratio for estimation */
  charsPerToken: 4,
  /** Fraction of available chars allocated to the head (beginning) */
  headRatio: 0.4,
  /** Fraction of available chars allocated to the tail (end) */
  tailRatio: 0.6,
} as const;

/**
 * Configuration options for ToolResultTruncator.
 */
export interface ToolResultTruncatorConfig {
  /**
   * Characters per token ratio for estimation.
   * Lower values produce higher (more conservative) counts.
   * @default 4
   */
  charsPerToken?: number;

  /**
   * Fraction of the truncated output allocated to the head portion.
   * Must be between 0 and 1. The remainder goes to the tail.
   * @default 0.4
   */
  headRatio?: number;

  /**
   * Fraction of the truncated output allocated to the tail portion.
   * Must be between 0 and 1.
   * @default 0.6
   */
  tailRatio?: number;
}

/**
 * ToolResultTruncator class.
 *
 * Intelligently truncates tool results to fit within a token budget.
 * Uses a head + tail strategy to preserve key information from both
 * the beginning and end of results.
 *
 * Usage:
 * ```typescript
 * const truncator = new ToolResultTruncator();
 *
 * // Check if truncation is needed
 * if (truncator.shouldTruncate(result, 2048)) {
 *   const truncated = truncator.truncate(result, 2048);
 *   // truncated contains head + marker + tail
 * }
 *
 * // Or use the convenience method that returns a ToolResult
 * const toolResult = truncator.getTruncatedResult(original, truncated);
 * console.log(toolResult.truncated, toolResult.tokenCount);
 * ```
 */
export class ToolResultTruncator {
  private readonly charsPerToken: number;
  private readonly headRatio: number;
  private readonly tailRatio: number;

  constructor(config: ToolResultTruncatorConfig = {}) {
    this.charsPerToken = config.charsPerToken ?? TRUNCATOR_DEFAULTS.charsPerToken;
    this.headRatio = config.headRatio ?? TRUNCATOR_DEFAULTS.headRatio;
    this.tailRatio = config.tailRatio ?? TRUNCATOR_DEFAULTS.tailRatio;
  }

  /**
   * Estimate the token count of a text string.
   *
   * Uses character-based approximation with the configured charsPerToken ratio.
   * Always rounds up to be conservative (never under-counts).
   *
   * @param text - The text to estimate tokens for
   * @returns Estimated token count (always >= 0)
   */
  estimateTokens(text: string): number {
    if (!text || text.length === 0) {
      return 0;
    }
    return Math.ceil(text.length / this.charsPerToken);
  }

  /**
   * Determine whether a result exceeds the token budget and needs truncation.
   *
   * @param result - The tool result text to check
   * @param maxTokens - Maximum allowed token count
   * @returns true if the result needs truncation
   */
  shouldTruncate(result: string, maxTokens: number): boolean {
    return this.estimateTokens(result) > maxTokens;
  }

  /**
   * Truncate a tool result to fit within the token budget.
   *
   * Strategy:
   * 1. If the result fits within budget, return it unchanged.
   * 2. Otherwise, reserve space for a truncation marker (~40 tokens).
   * 3. Split remaining space between head (beginning) and tail (end).
   * 4. Replace the middle with a marker showing the original token count
   *    and how many tokens were removed.
   *
   * Edge cases:
   * - Empty/null input returns empty string.
   * - If maxTokens is too small to accommodate both marker and content,
   *   returns a head-only truncation or the marker alone.
   *
   * @param result - The tool result text to truncate
   * @param maxTokens - Maximum allowed token budget
   * @returns Truncated text with head + marker + tail, or original if it fits
   */
  truncate(result: string, maxTokens: number): string {
    if (!result || result.length === 0) {
      return '';
    }

    if (!this.shouldTruncate(result, maxTokens)) {
      return result;
    }

    const originalTokens = this.estimateTokens(result);
    const maxChars = Math.floor(maxTokens * this.charsPerToken);

    // Marker template: we need to reserve space for it
    const markerTemplate = (removedTokens: number) =>
      `\n\n... [truncated ~${removedTokens} tokens] ...\n\n`;

    // Estimate marker size (with a generous removedTokens number for budgeting)
    const sampleMarker = markerTemplate(originalTokens);
    const markerChars = sampleMarker.length;

    // Calculate available space for content (head + tail)
    const contentChars = maxChars - markerChars;

    // If we don't have enough space for both marker and meaningful content,
    // return just a head portion
    const minContentChars = 20; // At least 20 chars of content
    if (contentChars < minContentChars) {
      const headChars = Math.max(Math.floor(maxChars * 0.8), 10);
      const head = result.slice(0, headChars);
      const removedTokens = originalTokens - this.estimateTokens(head);
      const marker = markerTemplate(removedTokens);
      return head + marker;
    }

    // Split content between head and tail
    const headChars = Math.floor(contentChars * this.headRatio);
    const tailChars = contentChars - headChars;

    const head = result.slice(0, headChars);
    const tail = tailChars > 0 ? result.slice(result.length - tailChars) : '';

    // Calculate actual removed tokens based on what we're keeping
    const keptChars = head.length + tail.length;
    const keptTokens = this.estimateTokens(head) + this.estimateTokens(tail);
    const removedTokens = originalTokens - keptTokens;

    const marker = markerTemplate(removedTokens);

    // If tail is empty (result too short), just use head + marker
    if (!tail) {
      return head + marker;
    }

    return head + marker + tail;
  }

  /**
   * Create a ToolResult from an original result and its truncated version.
   *
   * Convenience method that wraps the truncation output with metadata:
   * token count and truncation status.
   *
   * @param originalResult - The original (untruncated) tool result text
   * @param truncatedResult - The truncated text (from truncate() method)
   * @returns ToolResult with text, tokenCount, and truncated flag
   */
  getTruncatedResult(originalResult: string, truncatedResult: string): ToolResult {
    const tokenCount = this.estimateTokens(truncatedResult);
    const truncated = originalResult !== truncatedResult;

    return {
      text: truncatedResult,
      tokenCount,
      truncated,
    };
  }

  /**
   * Full pipeline: check, truncate if needed, and return a ToolResult.
   *
   * Combines shouldTruncate + truncate + getTruncatedResult into a
   * single call for convenience.
   *
   * @param result - The tool result text to process
   * @param maxTokens - Maximum allowed token budget
   * @returns ToolResult with text, tokenCount, and truncated flag
   */
  process(result: string, maxTokens: number = TRUNCATOR_DEFAULTS.maxTokens): ToolResult {
    if (!result || result.length === 0) {
      return { text: '', tokenCount: 0, truncated: false };
    }

    const truncated = this.truncate(result, maxTokens);
    const wasTruncated = truncated !== result;

    return {
      text: truncated,
      tokenCount: this.estimateTokens(truncated),
      truncated: wasTruncated,
    };
  }
}
