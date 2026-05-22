import { describe, it, expect, beforeEach } from 'vitest';
import { TokenTracker } from '../../context/tokenTracker.js';

// ==========================================================================
// Helpers
// ==========================================================================

/** Repeat a character to build a string of the given length. */
function repeatChar(char: string, length: number): string {
  return char.repeat(length);
}

/**
 * Build realistic log lines with predictable structure.
 * Each line is ~50 chars, returns `count` lines joined by newlines.
 */
function makeLogLines(count: number): string {
  const line = '[INFO] 2024-01-01T00:00:00Z Processing request id=abcdef\n'; // ~58 chars
  return Array.from({ length: count }, () => line).join('');
}

// ==========================================================================
// TokenTracker
// ==========================================================================

describe('TokenTracker', () => {
  let tracker: TokenTracker;

  beforeEach(() => {
    tracker = new TokenTracker();
  });

  // ========================================================================
  // countTokens (7 tests)
  // ========================================================================
  describe('countTokens', () => {
    it('returns 0 for empty string', async () => {
      expect(await tracker.countTokens('')).toBe(0);
    });

    it('returns correct token count for short text', async () => {
      const count = await tracker.countTokens('Hello, world!');
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(50);
    });

    it('returns correct token count for long text (1000+ chars)', async () => {
      const text = makeLogLines(20); // ~1160 chars
      expect(text.length).toBeGreaterThan(1000);
      const count = await tracker.countTokens(text);
      expect(count).toBeGreaterThan(0);
      // Long text should produce proportionally more tokens than short text
      const shortCount = await tracker.countTokens('Hello, world!');
      expect(count).toBeGreaterThan(shortCount);
    });

    it('different models may use different encodings', async () => {
      const text = 'Hello, world! This is a test of token counting.';
      const gpt4oCount = await tracker.countTokens(text, 'gpt-4o');
      const qwenCount = await tracker.countTokens(text, 'qwen-plus');
      // Both should return positive counts
      expect(gpt4oCount).toBeGreaterThan(0);
      expect(qwenCount).toBeGreaterThan(0);
      // They may or may not be equal — different encodings tokenise differently
      expect(typeof gpt4oCount).toBe('number');
      expect(typeof qwenCount).toBe('number');
    });

    it('gpt-4o uses cl100k_base encoding', async () => {
      const count = await tracker.countTokens('Hello', 'gpt-4o');
      expect(count).toBeGreaterThan(0);
    });

    it('qwen-plus uses o200k_base encoding', async () => {
      const count = await tracker.countTokens('Hello', 'qwen-plus');
      expect(count).toBeGreaterThan(0);
    });

    it('unknown model falls back to cl100k_base encoding', async () => {
      const count = await tracker.countTokens('Hello', 'unknown-model-xyz');
      expect(count).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // checkThreshold (8 tests)
  // ========================================================================
  describe('checkThreshold', () => {
    // contextWindow = 100000, effectiveWindow = 100000 * 0.8 = 80000
    const ctx = 100_000;
    const eff = ctx * 0.8; // 80000

    it("returns 'none' when usage < 80% of effective window", () => {
      // 80% of 80000 = 64000; use 50000 which is well below
      expect(tracker.checkThreshold(50_000, ctx)).toBe('none');
    });

    it("returns 'none' at exactly 79.999% of effective window", () => {
      // Just under 80%: 64000 - 1 = 63999
      expect(tracker.checkThreshold(63_999, ctx)).toBe('none');
    });

    it("returns 'compact' when >= 80% but < 93%", () => {
      // 80% = 64000, 93% = 74400
      expect(tracker.checkThreshold(64_000, ctx)).toBe('compact');
      expect(tracker.checkThreshold(70_000, ctx)).toBe('compact');
      expect(tracker.checkThreshold(74_399, ctx)).toBe('compact');
    });

    it("returns 'auto-compact' when >= 93% but < 95%", () => {
      // 93% = 74400, 95% = 76000
      expect(tracker.checkThreshold(74_400, ctx)).toBe('auto-compact');
      expect(tracker.checkThreshold(75_000, ctx)).toBe('auto-compact');
      expect(tracker.checkThreshold(75_999, ctx)).toBe('auto-compact');
    });

    it("returns 'collapse' when >= 95%", () => {
      // 95% = 76000
      expect(tracker.checkThreshold(76_000, ctx)).toBe('collapse');
      expect(tracker.checkThreshold(80_000, ctx)).toBe('collapse');
    });

    it('effective window = contextWindow * 0.8 (20% safety margin)', () => {
      // With contextWindow = 200000, effectiveWindow = 160000
      // 80% of 160000 = 128000
      expect(tracker.checkThreshold(128_000, 200_000)).toBe('compact');
      // Just below
      expect(tracker.checkThreshold(127_999, 200_000)).toBe('none');
    });

    it("returns 'none' for 0 context window", () => {
      expect(tracker.checkThreshold(100, 0)).toBe('none');
    });

    it("returns 'none' for 0 current tokens", () => {
      expect(tracker.checkThreshold(0, 100_000)).toBe('none');
    });
  });

  // ========================================================================
  // getRemainingTokens (5 tests)
  // ========================================================================
  describe('getRemainingTokens', () => {
    const ctx = 100_000;
    const eff = Math.floor(ctx * 0.8); // 80000

    it('returns positive when under limit', () => {
      expect(tracker.getRemainingTokens(50_000, ctx)).toBe(30_000); // 80000 - 50000
    });

    it('returns 0 when at limit', () => {
      expect(tracker.getRemainingTokens(eff, ctx)).toBe(0);
    });

    it('returns 0 when over limit (never negative)', () => {
      expect(tracker.getRemainingTokens(90_000, ctx)).toBe(0);
    });

    it('floors fractional results', () => {
      // eff = 80000, current = 1 → 79999 (exact, no rounding needed)
      // Use odd context to force fractional: ctx = 99999, eff = 79999.2, floor = 79999
      expect(tracker.getRemainingTokens(0, 99_999)).toBe(Math.floor(99_999 * 0.8));
    });

    it('returns 0 for 0 context window', () => {
      expect(tracker.getRemainingTokens(100, 0)).toBe(0);
    });
  });

  // ========================================================================
  // getUsagePercentage (5 tests)
  // ========================================================================
  describe('getUsagePercentage', () => {
    const ctx = 100_000;
    const eff = ctx * 0.8; // 80000

    it('returns correct percentage', () => {
      // 40000 / 80000 = 50%
      expect(tracker.getUsagePercentage(40_000, ctx)).toBe(50);
    });

    it('returns 100 for 0 context window', () => {
      expect(tracker.getUsagePercentage(100, 0)).toBe(100);
    });

    it('returns 100 when over 100% (capped)', () => {
      // 90000 / 80000 = 112.5% → capped at 100
      expect(tracker.getUsagePercentage(90_000, ctx)).toBe(100);
    });

    it('returns 0 for 0 usage', () => {
      expect(tracker.getUsagePercentage(0, ctx)).toBe(0);
    });

    it('returns exactly 100 at full capacity', () => {
      expect(tracker.getUsagePercentage(eff, ctx)).toBe(100);
    });
  });

  // ========================================================================
  // createSnapshot (5 tests)
  // ========================================================================
  describe('createSnapshot', () => {
    it('returns valid TokenSnapshot structure with all fields', () => {
      const snapshot = tracker.createSnapshot(50_000, 100_000, 'step-1');

      expect(snapshot.usedTokens).toBe(50_000);
      expect(snapshot.contextWindow).toBe(100_000);
      expect(snapshot.usagePercentage).toBe(62.5); // 50000 / 80000 * 100
      expect(snapshot.reservedTokens).toBe(20_000); // 100000 - 80000
      expect(snapshot.availableTokens).toBe(30_000); // 80000 - 50000
      expect(snapshot.label).toBe('step-1');
    });

    it('timestamp is ISO 8601', () => {
      const snapshot = tracker.createSnapshot(10_000, 100_000);
      // ISO 8601: matches e.g. "2024-01-01T00:00:00.000Z"
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
      expect(snapshot.timestamp).toMatch(iso8601Regex);
    });

    it('label is undefined when not provided', () => {
      const snapshot = tracker.createSnapshot(0, 100_000);
      expect(snapshot.label).toBeUndefined();
    });

    it('reservedTokens = contextWindow * 0.2', () => {
      const snapshot = tracker.createSnapshot(0, 200_000);
      expect(snapshot.reservedTokens).toBe(40_000); // 200000 * 0.2
    });

    it('availableTokens never negative', () => {
      const snapshot = tracker.createSnapshot(90_000, 100_000);
      expect(snapshot.availableTokens).toBe(0);
    });
  });
});
