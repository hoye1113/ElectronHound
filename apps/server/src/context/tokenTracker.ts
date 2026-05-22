/**
 * Server Context Management — Token Tracker
 *
 * Provides precise token counting using js-tiktoken with a four-level
 * compression threshold system. Implements the OpenClaw-style 20%
 * safety margin for output token reservation.
 *
 * Compression levels:
 * - `collapse`:     >= 95% of effective context window
 * - `auto-compact`: >= 93% of effective context window
 * - `compact`:      >= 80% of effective context window
 * - `none`:         <  80% of effective context window
 *
 * Effective context = rawContextWindow × 0.8 (20% safety margin).
 */

import { Tiktoken } from 'js-tiktoken';
import type { TiktokenBPE } from 'js-tiktoken';
import cl100k_baseRank from 'js-tiktoken/ranks/cl100k_base';
import type { CompressionLevel } from './types.js';
import { DEFAULT_THRESHOLDS } from './types.js';

/**
 * Supported tiktoken encoding names.
 */
type EncodingName = 'cl100k_base' | 'o200k_base';

/**
 * Safety margin multiplier applied to contextWindow to reserve output tokens.
 * Follows the OpenClaw practice of reserving 20% of the context window.
 */
const SAFETY_MARGIN = 0.8;

/**
 * Resolves a model name to the appropriate tiktoken encoding.
 *
 * @param model - Optional model identifier (e.g., 'gpt-4o', 'qwen-plus', 'deepseek-chat')
 * @returns The encoding name to use for tokenization
 *
 * Mapping:
 * - gpt-4o, gpt-4o-mini, deepseek-*: cl100k_base
 * - qwen-*: o200k_base (with cl100k_base fallback)
 * - groq, llama-*: cl100k_base
 * - default: cl100k_base
 */
function resolveEncoding(model: string | undefined): EncodingName {
  if (!model) return 'cl100k_base';
  const lower = model.toLowerCase();
  if (lower.includes('qwen')) return 'o200k_base';
  return 'cl100k_base';
}

/**
 * Tracks and analyzes token usage for LLM context management.
 *
 * Implements the OpenClaw-style 4-level compression threshold system
 * with a 20% safety margin for output token reservation.
 *
 * Encoder instances are cached to avoid the overhead of re-initializing
 * BPE tables on every call.
 */
export class TokenTracker {
  private readonly encoders = new Map<EncodingName, Tiktoken>();

  /**
   * Lazily initializes and caches a Tiktoken encoder for the given encoding.
   * For `o200k_base`, uses dynamic import to gracefully handle environments
   * where the encoding may not be available, falling back to `cl100k_base`.
   */
  private async getEncoder(name: EncodingName): Promise<Tiktoken> {
    const cached = this.encoders.get(name);
    if (cached) return cached;

    let rankData: TiktokenBPE;

    if (name === 'o200k_base') {
      try {
        const module = await import('js-tiktoken/ranks/o200k_base') as {
          default: TiktokenBPE;
        };
        rankData = module.default;
      } catch {
        // Fallback to cl100k_base if o200k_base is not available
        return this.getEncoder('cl100k_base');
      }
    } else {
      rankData = cl100k_baseRank;
    }

    const encoder = new Tiktoken(rankData);
    this.encoders.set(name, encoder);
    return encoder;
  }

  /**
   * Counts the number of tokens in the given text for the specified model.
   *
   * Uses js-tiktoken for precise tokenization. Encoder instances are cached
   * for reuse to avoid the overhead of re-initializing BPE tables.
   *
   * @param text  - The text to tokenize
   * @param model - Optional LLM model identifier; determines which encoding to use
   * @returns     - The number of tokens in the text
   */
  async countTokens(text: string, model?: string): Promise<number> {
    if (!text || text.length === 0) return 0;
    const encodingName = resolveEncoding(model);
    const encoder = await this.getEncoder(encodingName);
    return encoder.encode(text).length;
  }

  /**
   * Determines the appropriate compression level based on current token usage.
   *
   * Thresholds are computed against the effective context window
   * (contextWindow × SAFETY_MARGIN):
   * - `collapse`:     >= 95%
   * - `auto-compact`: >= 93%
   * - `compact`:      >= 80%
   * - `none`:         <  80%
   *
   * @param currentTokens  - Current number of tokens in use
   * @param contextWindow  - Total context window size of the model
   * @returns              - The recommended compression level
   */
  checkThreshold(currentTokens: number, contextWindow: number): CompressionLevel {
    const effectiveWindow = contextWindow * SAFETY_MARGIN;
    if (effectiveWindow <= 0 || currentTokens <= 0) return 'none';
    const ratio = currentTokens / effectiveWindow;
    if (ratio >= DEFAULT_THRESHOLDS.collapse) return 'collapse';
    if (ratio >= DEFAULT_THRESHOLDS.autoCompact) return 'auto-compact';
    if (ratio >= DEFAULT_THRESHOLDS.compact) return 'compact';
    return 'none';
  }

  /**
   * Calculates how many tokens remain before hitting the effective context limit.
   *
   * @param currentTokens  - Current number of tokens in use
   * @param contextWindow  - Total context window size of the model
   * @returns              - Number of tokens remaining (floored, minimum 0)
   */
  getRemainingTokens(currentTokens: number, contextWindow: number): number {
    const effectiveWindow = contextWindow * SAFETY_MARGIN;
    return Math.max(0, Math.floor(effectiveWindow - currentTokens));
  }

  /**
   * Returns the current context usage as a percentage (0-100) of the effective window.
   *
   * @param currentTokens  - Current number of tokens in use
   * @param contextWindow  - Total context window size of the model
   * @returns              - Usage percentage (0-100, capped at 100)
   */
  getUsagePercentage(currentTokens: number, contextWindow: number): number {
    const effectiveWindow = contextWindow * SAFETY_MARGIN;
    if (effectiveWindow <= 0) return 100;
    return Math.min(100, (currentTokens / effectiveWindow) * 100);
  }

  /**
   * Creates a full token snapshot with decision analysis.
   * Convenience method that combines countTokens, checkThreshold, and metadata.
   *
   * @param currentTokens  - Current number of tokens in use
   * @param contextWindow  - Total context window size of the model
   * @param label          - Optional label for the snapshot (e.g., step number)
   * @returns              - TokenSnapshot with usage analysis
   */
  createSnapshot(
    currentTokens: number,
    contextWindow: number,
    label?: string,
  ): {
    usedTokens: number;
    contextWindow: number;
    usagePercentage: number;
    reservedTokens: number;
    availableTokens: number;
    timestamp: string;
    label?: string;
  } {
    const effectiveWindow = contextWindow * SAFETY_MARGIN;
    const reservedTokens = contextWindow - effectiveWindow;

    return {
      usedTokens: currentTokens,
      contextWindow,
      usagePercentage: this.getUsagePercentage(currentTokens, contextWindow),
      reservedTokens,
      availableTokens: this.getRemainingTokens(currentTokens, contextWindow),
      timestamp: new Date().toISOString(),
      label,
    };
  }
}

/** Default singleton instance for convenient access. */
export const defaultTokenTracker = new TokenTracker();
