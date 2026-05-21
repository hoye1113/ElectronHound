/**
 * EATA Compaction - Token Counter
 *
 * Provides token counting and estimation for context compaction decisions.
 * Uses a character-based approximation model (~4 characters per token for
 * English text) with per-message overhead accounting for chat-format framing.
 *
 * Key features:
 * - Precise (estimated) token counting for text strings
 * - Message-level token counting with per-role breakdown
 * - Character-to-token estimation with configurable ratio
 * - Budget checking helpers for compaction thresholds
 *
 * Why no real tokenizer?
 * Tokenizer libraries (tiktoken, etc.) add ~50 MB of WASM/data overhead.
 * For compaction trigger purposes, an estimate within 10-15% is sufficient.
 * The 4-chars-per-token ratio is the standard approximation used across
 * the industry for GPT-family models on English text.
 */

import type { CompactionMessage, MessageRole } from './cut-point.js';
import type { TokenCount, TokenCountBreakdown } from './types.js';

/**
 * Default configuration for TokenCounter.
 */
export const TOKEN_COUNTER_DEFAULTS = {
  /** Characters per token ratio for estimation */
  charsPerToken: 4,
  /** Overhead tokens per message (for chat-format framing) */
  messageOverhead: 3,
  /** Overhead tokens for top-level message array framing */
  arrayOverhead: 3,
} as const;

/**
 * Configuration options for TokenCounter.
 */
export interface TokenCounterConfig {
  /**
   * Characters per token ratio for estimation.
   * Lower values produce higher (more conservative) counts.
   * @default 4
   */
  charsPerToken?: number;

  /**
   * Overhead tokens added per message to account for chat-format
   * delimiters (role prefix, newlines, etc.).
   * @default 3
   */
  messageOverhead?: number;

  /**
   * Overhead tokens for the top-level message array framing.
   * @default 3
   */
  arrayOverhead?: number;
}

/**
 * TokenCounter class.
 *
 * Provides token counting and estimation methods for context compaction.
 * All counting is approximate, using character-based heuristics.
 *
 * Usage:
 * ```typescript
 * const counter = new TokenCounter();
 *
 * // Count tokens in raw text
 * const tokens = counter.countTokens('Hello, world!');
 *
 * // Count tokens across messages with breakdown
 * const count = counter.countMessageTokens(messages);
 * console.log(count.total, count.breakdown);
 *
 * // Budget checking
 * if (counter.isOverBudget(count.total, contextWindow)) {
 *   // trigger compaction
 * }
 * ```
 */
export class TokenCounter {
  private readonly charsPerToken: number;
  private readonly messageOverhead: number;
  private readonly arrayOverhead: number;

  constructor(config: TokenCounterConfig = {}) {
    this.charsPerToken = config.charsPerToken ?? TOKEN_COUNTER_DEFAULTS.charsPerToken;
    this.messageOverhead = config.messageOverhead ?? TOKEN_COUNTER_DEFAULTS.messageOverhead;
    this.arrayOverhead = config.arrayOverhead ?? TOKEN_COUNTER_DEFAULTS.arrayOverhead;
  }

  /**
   * Count estimated tokens in a text string.
   *
   * Uses the configured charsPerToken ratio (default: 4 chars/token).
   * Always rounds up to be conservative (never under-counts).
   *
   * @param text - The text to count tokens for
   * @returns Estimated token count (always >= 0)
   */
  countTokens(text: string): number {
    if (!text || text.length === 0) {
      return 0;
    }
    return Math.ceil(text.length / this.charsPerToken);
  }

  /**
   * Count tokens across an array of messages, returning total and breakdown.
   *
   * Processes each message by:
   * 1. Extracting text content (handles string and array content)
   * 2. Estimating tokens from text length
   * 3. Adding per-message overhead for chat-format framing
   * 4. Accumulating into role-based breakdown
   *
   * @param messages - Array of CompactionMessage to count
   * @returns TokenCount with total and per-role breakdown
   */
  countMessageTokens(messages: CompactionMessage[]): TokenCount {
    const breakdown: TokenCountBreakdown = {
      system: 0,
      user: 0,
      assistant: 0,
      tool: 0,
    };

    let total = 0;

    for (const message of messages) {
      const text = this.extractMessageText(message);
      const tokens = this.countTokens(text) + this.messageOverhead;

      total += tokens;

      const category = this.mapRoleToCategory(message.role);
      breakdown[category] += tokens;
    }

    total += this.arrayOverhead;

    return { total, breakdown };
  }

  /**
   * Estimate token count from a character count.
   *
   * Pure arithmetic — no text needed. Useful when you already know
   * the character count (e.g., from file sizes or API responses).
   *
   * @param charCount - Number of characters
   * @returns Estimated token count (always >= 0)
   */
  estimateTokensFromChars(charCount: number): number {
    if (charCount <= 0) {
      return 0;
    }
    return Math.ceil(charCount / this.charsPerToken);
  }

  /**
   * Check if current token usage exceeds the given budget.
   *
   * @param currentTokens - Current token count
   * @param budget - Maximum allowed token budget
   * @returns true if currentTokens >= budget
   */
  isOverBudget(currentTokens: number, budget: number): boolean {
    return currentTokens >= budget;
  }

  /**
   * Get remaining token budget.
   *
   * Returns the difference between budget and current tokens.
   * Negative values indicate over-budget status.
   *
   * @param currentTokens - Current token count
   * @param budget - Maximum allowed token budget
   * @returns Remaining tokens (negative if over budget)
   */
  getRemainingBudget(currentTokens: number, budget: number): number {
    return budget - currentTokens;
  }

  /**
   * Extract all text content from a message.
   *
   * Handles both string content and array content (multi-part messages).
   * For array content, iterates over blocks and extracts text from
   * known block types (text, toolCall arguments, result).
   *
   * @param message - CompactionMessage to extract text from
   * @returns Concatenated text content
   */
  private extractMessageText(message: CompactionMessage): string {
    if (typeof message.content === 'string') {
      return message.content;
    }

    if (!Array.isArray(message.content)) {
      return '';
    }

    const parts: string[] = [];

    for (const block of message.content) {
      if (typeof block === 'string') {
        parts.push(block);
        continue;
      }

      if (typeof block !== 'object' || block === null) {
        continue;
      }

      const obj = block as Record<string, unknown>;

      // Text blocks: { type: 'text', text: '...' }
      if (obj.type === 'text' && typeof obj.text === 'string') {
        parts.push(obj.text);
        continue;
      }

      // Tool call blocks: { type: 'toolCall', name: '...', arguments: {...} }
      if (obj.type === 'toolCall') {
        if (typeof obj.name === 'string') {
          parts.push(obj.name);
        }
        if (typeof obj.arguments === 'object' && obj.arguments !== null) {
          parts.push(JSON.stringify(obj.arguments));
        } else if (typeof obj.arguments === 'string') {
          parts.push(obj.arguments);
        }
        continue;
      }

      // Tool result blocks: { type: 'result', ... }
      if (obj.type === 'result' && typeof obj.output === 'string') {
        parts.push(obj.output);
        continue;
      }

      // Catch-all: stringify the block
      parts.push(JSON.stringify(obj));
    }

    return parts.join('\n');
  }

  /**
   * Map a message role to a breakdown category.
   *
   * Collapses non-standard roles into the appropriate category:
   * - toolResult, tool → 'tool'
   * - system → 'system'
   * - user → 'user'
   * - assistant → 'assistant'
   */
  private mapRoleToCategory(role: MessageRole): keyof TokenCountBreakdown {
    switch (role) {
      case 'system':
        return 'system';
      case 'user':
        return 'user';
      case 'assistant':
        return 'assistant';
      case 'tool':
      case 'toolResult':
        return 'tool';
      default:
        return 'user';
    }
  }
}
