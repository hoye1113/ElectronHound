import { describe, it, expect } from 'vitest';
import { ToolResultTruncator, TRUNCATOR_DEFAULTS } from '../toolResultTruncator.js';
import type { ToolResult } from '../types.js';

// Helper: generate a string with approximately N characters
function repeatChar(char: string, count: number): string {
  return char.repeat(count);
}

// Helper: generate a realistic-looking tool result with line breaks
function makeLogLines(lineCount: number): string {
  const lines: string[] = [];
  for (let i = 1; i <= lineCount; i++) {
    lines.push(`[LOG ${i}] Processing step ${i} of ${lineCount}: completed successfully`);
  }
  return lines.join('\n');
}

describe('ToolResultTruncator', () => {
  const truncator = new ToolResultTruncator();

  // ==========================================================================
  // estimateTokens (4 tests)
  // ==========================================================================
  describe('estimateTokens', () => {
    it('returns 0 for empty string', () => {
      expect(truncator.estimateTokens('')).toBe(0);
    });

    it('returns 0 for null/undefined-like input', () => {
      expect(truncator.estimateTokens(null as unknown as string)).toBe(0);
      expect(truncator.estimateTokens(undefined as unknown as string)).toBe(0);
    });

    it('estimates ~1 token per 4 characters, rounds up', () => {
      // 1 char → ceil(1/4) = 1
      expect(truncator.estimateTokens('a')).toBe(1);
      // 4 chars → ceil(4/4) = 1
      expect(truncator.estimateTokens('abcd')).toBe(1);
      // 5 chars → ceil(5/4) = 2
      expect(truncator.estimateTokens('abcde')).toBe(2);
      // 100 chars → ceil(100/4) = 25
      expect(truncator.estimateTokens(repeatChar('x', 100))).toBe(25);
    });

    it('estimates multi-line text correctly', () => {
      const text = 'line one\nline two\nline three';
      // 28 chars → ceil(28/4) = 7
      expect(truncator.estimateTokens(text)).toBe(7);
    });
  });

  // ==========================================================================
  // shouldTruncate (3 tests)
  // ==========================================================================
  describe('shouldTruncate', () => {
    it('returns false when result is under budget', () => {
      // "Hello" = 5 chars → ceil(5/4) = 2 tokens
      expect(truncator.shouldTruncate('Hello', 10)).toBe(false);
    });

    it('returns true when result exceeds budget', () => {
      // 100 chars → ceil(100/4) = 25 tokens
      const text = repeatChar('x', 100);
      expect(truncator.shouldTruncate(text, 10)).toBe(true);
    });

    it('returns false when result exactly meets budget', () => {
      // 8 chars → ceil(8/4) = 2 tokens, budget = 2
      const text = repeatChar('x', 8);
      expect(truncator.shouldTruncate(text, 2)).toBe(false);
    });
  });

  // ==========================================================================
  // truncate (7 tests)
  // ==========================================================================
  describe('truncate', () => {
    it('returns empty string for empty input', () => {
      expect(truncator.truncate('', 100)).toBe('');
    });

    it('returns original text when under budget', () => {
      const text = 'Short result';
      expect(truncator.truncate(text, 100)).toBe(text);
    });

    it('truncates and inserts marker when over budget', () => {
      // Generate ~2000 chars → ~500 tokens needed
      const text = makeLogLines(25);
      const maxTokens = 50; // ~200 chars budget
      const result = truncator.truncate(text, maxTokens);

      // Should contain the truncation marker
      expect(result).toContain('[truncated');
      expect(result).toContain('tokens');
      // Result should be shorter than original
      expect(result.length).toBeLessThan(text.length);
    });

    it('preserves the head (beginning) of the result', () => {
      const text = 'START_MARKER_' + repeatChar('x', 1000) + '_END_MARKER';
      const maxTokens = 50; // ~200 chars
      const result = truncator.truncate(text, maxTokens);

      // Should start with the beginning of the original
      expect(result.startsWith('START_MARKER_')).toBe(true);
    });

    it('preserves the tail (end) of the result', () => {
      const text = 'START_' + repeatChar('x', 1000) + '_END_MARKER_TAIL';
      const maxTokens = 50; // ~200 chars
      const result = truncator.truncate(text, maxTokens);

      // Should end with the end of the original
      expect(result.endsWith('_END_MARKER_TAIL')).toBe(true);
    });

    it('produces result within token budget (approximately)', () => {
      const text = makeLogLines(100); // ~100 lines, each ~60 chars → ~6000 chars
      const maxTokens = 100; // ~400 chars
      const result = truncator.truncate(text, maxTokens);

      // The result token count should be close to maxTokens
      const resultTokens = truncator.estimateTokens(result);
      // Allow some slack for marker overhead but should not wildly exceed budget
      expect(resultTokens).toBeLessThanOrEqual(maxTokens + 20);
    });

    it('handles very small maxTokens gracefully', () => {
      const text = repeatChar('x', 500);
      // Very small budget: 5 tokens = ~20 chars
      const result = truncator.truncate(text, 5);

      // Should still return a string (not crash)
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
      // Should contain some form of truncation indicator
      expect(result).toContain('truncated');
    });

    it('handles maxTokens of 0 or 1', () => {
      const text = repeatChar('x', 100);
      // 1 token = ~4 chars
      const result = truncator.truncate(text, 1);
      expect(result).toBeTruthy();
      // Should be very short
      expect(result.length).toBeLessThanOrEqual(50);
    });
  });

  // ==========================================================================
  // getTruncatedResult (3 tests)
  // ==========================================================================
  describe('getTruncatedResult', () => {
    it('returns truncated=false for unchanged result', () => {
      const original = 'Short output';
      const result: ToolResult = truncator.getTruncatedResult(original, original);

      expect(result.text).toBe(original);
      expect(result.truncated).toBe(false);
      expect(result.tokenCount).toBeGreaterThan(0);
    });

    it('returns truncated=true for changed result', () => {
      const original = repeatChar('x', 1000);
      const truncated = truncator.truncate(original, 50);
      const result: ToolResult = truncator.getTruncatedResult(original, truncated);

      expect(result.text).toBe(truncated);
      expect(result.truncated).toBe(true);
      expect(result.tokenCount).toBeGreaterThan(0);
    });

    it('has reasonable tokenCount for truncated result', () => {
      const original = makeLogLines(50);
      const maxTokens = 100;
      const truncated = truncator.truncate(original, maxTokens);
      const result = truncator.getTruncatedResult(original, truncated);

      // Token count should be based on the truncated text
      expect(result.tokenCount).toBe(truncator.estimateTokens(truncated));
      // Should be well under the original token count
      expect(result.tokenCount).toBeLessThan(truncator.estimateTokens(original));
    });
  });

  // ==========================================================================
  // process convenience method (3 tests)
  // ==========================================================================
  describe('process', () => {
    it('returns non-truncated result for short text', () => {
      const text = 'Brief output';
      const result = truncator.process(text, 1000);

      expect(result.text).toBe(text);
      expect(result.truncated).toBe(false);
      expect(result.tokenCount).toBeGreaterThan(0);
    });

    it('truncates long text with default maxTokens', () => {
      // Generate text that exceeds default 2048 token budget
      // 2048 tokens * 4 chars = 8192 chars
      const text = makeLogLines(200); // ~200 lines * ~60 chars each = ~12000 chars
      const result = truncator.process(text);

      expect(result.truncated).toBe(true);
      expect(result.text.length).toBeLessThan(text.length);
      // Should use default maxTokens of 2048
    });

    it('returns empty result for empty input', () => {
      const result = truncator.process('', 100);

      expect(result.text).toBe('');
      expect(result.tokenCount).toBe(0);
      expect(result.truncated).toBe(false);
    });
  });

  // ==========================================================================
  // Custom configuration (2 tests)
  // ==========================================================================
  describe('custom configuration', () => {
    it('respects custom charsPerToken ratio', () => {
      const custom = new ToolResultTruncator({ charsPerToken: 2 });
      // 8 chars at 2 chars/token → ceil(8/2) = 4
      expect(custom.estimateTokens('12345678')).toBe(4);
      // 3 chars at 2 chars/token → ceil(3/2) = 2
      expect(custom.estimateTokens('abc')).toBe(2);
    });

    it('respects custom head/tail ratios', () => {
      // Use 0/1 ratio: all tail, no head
      const custom = new ToolResultTruncator({ headRatio: 0, tailRatio: 1 });
      const text = 'HEAD_' + repeatChar('x', 500) + '_TAIL_END';
      const maxTokens = 50;
      const result = custom.truncate(text, maxTokens);

      // With 0 head, it should still end with the tail
      expect(result.endsWith('_TAIL_END')).toBe(true);
      // The marker should still be present
      expect(result).toContain('[truncated');
    });
  });
});
