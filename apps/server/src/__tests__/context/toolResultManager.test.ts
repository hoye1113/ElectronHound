import { describe, it, expect, beforeEach } from 'vitest';
import { ToolResultManager, defaultToolResultManager } from '../../context/toolResultManager.js';
import type { ProcessedResult } from '../../context/toolResultManager.js';

// ==========================================================================
// Helpers
// ==========================================================================

/** Build a string of repeated lines for truncation tests. */
function makeLogLines(count: number): string {
  return Array.from({ length: count }, (_, i) =>
    `[LOG] Line ${String(i).padStart(5, '0')}: ${'data'.repeat(10)}\n`,
  ).join(''); // ~58 chars per line
}

/** Repeat a character to the given length. */
function repeatChar(char: string, length: number): string {
  return char.repeat(length);
}

// ==========================================================================
// ToolResultManager
// ==========================================================================

describe('ToolResultManager', () => {
  let manager: ToolResultManager;

  beforeEach(() => {
    manager = new ToolResultManager();
  });

  // ========================================================================
  // process (7 tests)
  // ========================================================================
  describe('process', () => {
    it('returns unchanged for short text under limit', () => {
      const result = manager.process('Hello, world!');
      expect(result.truncated).toBe(false);
      expect(result.text).toBe('Hello, world!');
      expect(result.truncationRatio).toBe(0);
      expect(result.originalTokens).toBe(result.processedTokens);
    });

    it('returns unchanged for null input', () => {
      const result = manager.process(null);
      expect(result.text).toBe('');
      expect(result.truncated).toBe(false);
      expect(result.originalTokens).toBe(0);
      expect(result.processedTokens).toBe(0);
      expect(result.truncationRatio).toBe(0);
    });

    it('returns unchanged for undefined input', () => {
      const result = manager.process(undefined);
      expect(result.text).toBe('');
      expect(result.truncated).toBe(false);
      expect(result.originalTokens).toBe(0);
    });

    it('returns truncated result for text exceeding limit', () => {
      const longText = repeatChar('x', 60_001);
      const result = manager.process(longText); // default 50000 limit
      expect(result.truncated).toBe(true);
      expect(result.text.length).toBeLessThanOrEqual(60_001);
      expect(result.processedTokens).toBeLessThan(result.originalTokens);
    });

    it('originalTokens reflects pre-truncation estimate', () => {
      const longText = repeatChar('x', 60_001);
      const result = manager.process(longText);
      expect(result.originalTokens).toBe(Math.ceil(60_001 / 4));
    });

    it('truncationRatio is between 0 and 1', () => {
      const longText = repeatChar('y', 100_000);
      const result = manager.process(longText);
      expect(result.truncationRatio).toBeGreaterThanOrEqual(0);
      expect(result.truncationRatio).toBeLessThanOrEqual(1);
    });

    it('custom maxChars override works', () => {
      const text = repeatChar('z', 500);
      const result = manager.process(text, 100);
      expect(result.truncated).toBe(true);
      expect(result.text.length).toBeLessThan(500);
    });
  });

  // ========================================================================
  // truncate (8 tests)
  // ========================================================================
  describe('truncate', () => {
    it('empty string returns empty', () => {
      expect(manager.truncate('', 100)).toBe('');
    });

    it('null returns empty', () => {
      expect(manager.truncate(null, 100)).toBe('');
    });

    it('short text returns unchanged', () => {
      expect(manager.truncate('short text', 100)).toBe('short text');
    });

    it('long text uses head + marker + tail strategy', () => {
      const longText = repeatChar('A', 60_001);
      const result = manager.truncate(longText, 50_000);

      // Should start with head (first 1500 chars)
      expect(result.startsWith('A'.repeat(1500))).toBe(true);
      // Should end with tail (last 1500 chars)
      expect(result.endsWith('A'.repeat(1500))).toBe(true);
      // Should contain truncation marker
      expect(result).toContain('[truncated');
    });

    it('marker contains character count of removed content', () => {
      const longText = repeatChar('B', 60_000);
      const result = manager.truncate(longText, 50_000);
      // removedChars = 60000 - 1500 - 1500 = 57000
      expect(result).toContain('~57000 chars');
    });

    it('text exactly at maxChars boundary returns unchanged', () => {
      const text = repeatChar('C', 50_000);
      expect(manager.truncate(text, 50_000)).toBe(text);
    });

    it('works with custom maxChars (small max triggers scaled head)', () => {
      const text = repeatChar('D', 1000);
      const result = manager.truncate(text, 50);
      // When maxChars is very small, only head portion is kept
      expect(result.length).toBeLessThanOrEqual(1000);
      expect(result).toContain('[truncated');
      // Head should be ~80% of maxChars = floor(50 * 0.8) = 40
      expect(result.startsWith('D'.repeat(40))).toBe(true);
    });

    it('result length is reasonable relative to maxChars', () => {
      const longText = makeLogLines(2000); // ~116000 chars
      const maxChars = 10_000;
      const result = manager.truncate(longText, maxChars);
      // Result should be much shorter than original
      expect(result.length).toBeLessThan(longText.length);
      // But should contain meaningful content
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // estimateTokens (6 tests)
  // ========================================================================
  describe('estimateTokens', () => {
    it('returns 0 for empty string', () => {
      expect(manager.estimateTokens('')).toBe(0);
    });

    it('returns 0 for null', () => {
      expect(manager.estimateTokens(null)).toBe(0);
    });

    it('returns 0 for undefined', () => {
      expect(manager.estimateTokens(undefined)).toBe(0);
    });

    it('returns ceil(length/4) for normal text', () => {
      // 'Hello' = 5 chars → ceil(5/4) = 2
      expect(manager.estimateTokens('Hello')).toBe(2);
      // 16 chars → ceil(16/4) = 4
      expect(manager.estimateTokens('abcdefghijklmnop')).toBe(4);
      // 17 chars → ceil(17/4) = 5
      expect(manager.estimateTokens('abcdefghijklmnopq')).toBe(5);
    });

    it('always rounds up', () => {
      // 1 char → ceil(1/4) = 1
      expect(manager.estimateTokens('a')).toBe(1);
      // 3 chars → ceil(3/4) = 1
      expect(manager.estimateTokens('abc')).toBe(1);
    });

    it('custom charsPerToken ratio is respected', () => {
      const custom = new ToolResultManager({ charsPerToken: 3 });
      // 9 chars → ceil(9/3) = 3
      expect(custom.estimateTokens('123456789')).toBe(3);
      // 10 chars → ceil(10/3) = 4
      expect(custom.estimateTokens('1234567890')).toBe(4);
    });
  });

  // ========================================================================
  // getAggregateBudget (5 tests)
  // ========================================================================
  describe('getAggregateBudget', () => {
    it('returns contextWindow * 4 * 0.3', () => {
      // 128000 * 4 * 0.3 = 153600
      expect(manager.getAggregateBudget(128_000)).toBe(153_600);
    });

    it('returns 0 for 0 context window', () => {
      expect(manager.getAggregateBudget(0)).toBe(0);
    });

    it('returns 0 for negative context window', () => {
      expect(manager.getAggregateBudget(-1000)).toBe(0);
    });

    it('works with custom budget fraction', () => {
      const custom = new ToolResultManager({ budgetFraction: 0.5 });
      // 100000 * 4 * 0.5 = 200000
      expect(custom.getAggregateBudget(100_000)).toBe(200_000);
    });

    it('works with custom charsPerToken', () => {
      const custom = new ToolResultManager({ charsPerToken: 3, budgetFraction: 0.3 });
      // 100000 * 3 * 0.3 = 90000
      expect(custom.getAggregateBudget(100_000)).toBe(90_000);
    });
  });

  // ========================================================================
  // Custom configuration (3 tests)
  // ========================================================================
  describe('custom configuration', () => {
    it('custom maxChars changes truncation threshold', () => {
      const tiny = new ToolResultManager({ maxChars: 100 });
      const text = repeatChar('T', 200);
      const result = tiny.process(text);
      expect(result.truncated).toBe(true);
    });

    it('custom headChars and tailChars affect truncation', () => {
      const small = new ToolResultManager({
        maxChars: 100,
        headChars: 20,
        tailChars: 20,
      });
      const text = repeatChar('X', 1000);
      const result = small.truncate(text, 100);
      // Should preserve head of 20 chars
      expect(result.startsWith('X'.repeat(20))).toBe(true);
      // Should contain marker
      expect(result).toContain('[truncated');
    });

    it('default export instance exists and is functional', () => {
      expect(defaultToolResultManager).toBeInstanceOf(ToolResultManager);
      expect(defaultToolResultManager.estimateTokens('test')).toBe(1);
    });
  });
});
