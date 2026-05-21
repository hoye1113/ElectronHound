import { describe, it, expect } from 'vitest';
import { TokenCounter, TOKEN_COUNTER_DEFAULTS } from '../tokenCounter.js';
import type { CompactionMessage } from '../cut-point.js';

// Helper: build a CompactionMessage shortcut
function msg(role: CompactionMessage['role'], content: CompactionMessage['content']): CompactionMessage {
  return { role, content };
}

describe('TokenCounter', () => {
  const counter = new TokenCounter();

  // ==========================================================================
  // countTokens (5 tests)
  // ==========================================================================
  describe('countTokens', () => {
    it('returns 0 for empty string', () => {
      expect(counter.countTokens('')).toBe(0);
    });

    it('returns 1 for single character (rounds up)', () => {
      expect(counter.countTokens('a')).toBe(1);
    });

    it('estimates ~1 token per 4 characters', () => {
      // "Hello" = 5 chars → ceil(5/4) = 2
      expect(counter.countTokens('Hello')).toBe(2);
      // "Hello, world!" = 13 chars → ceil(13/4) = 4
      expect(counter.countTokens('Hello, world!')).toBe(4);
    });

    it('always rounds up (conservative counting)', () => {
      // 5 chars at 4 chars/token → 1.25 → ceil = 2
      expect(counter.countTokens('12345')).toBe(2);
      // Exact multiple: 8 chars → ceil(8/4) = 2
      expect(counter.countTokens('12345678')).toBe(2);
    });

    it('handles multi-line text', () => {
      const text = 'line one\nline two\nline three';
      // 28 chars → ceil(28/4) = 7
      expect(counter.countTokens(text)).toBe(7);
    });
  });

  // ==========================================================================
  // countMessageTokens (5 tests)
  // ==========================================================================
  describe('countMessageTokens', () => {
    it('returns zero breakdown for empty messages', () => {
      const result = counter.countMessageTokens([]);
      expect(result.total).toBe(TOKEN_COUNTER_DEFAULTS.arrayOverhead);
      expect(result.breakdown.system).toBe(0);
      expect(result.breakdown.user).toBe(0);
      expect(result.breakdown.assistant).toBe(0);
      expect(result.breakdown.tool).toBe(0);
    });

    it('counts a single user message with string content', () => {
      const messages: CompactionMessage[] = [msg('user', 'Hello')];
      const result = counter.countMessageTokens(messages);

      // "Hello" = 5 chars → ceil(5/4) = 2 tokens + 3 overhead = 5
      // Plus array overhead = 8
      expect(result.breakdown.user).toBe(5);
      expect(result.total).toBe(5 + TOKEN_COUNTER_DEFAULTS.arrayOverhead);
    });

    it('breaks down tokens by role', () => {
      const messages: CompactionMessage[] = [
        msg('system', 'You are helpful'),
        msg('user', 'Hi'),
        msg('assistant', 'Hello there'),
        msg('toolResult', 'result data'),
      ];
      const result = counter.countMessageTokens(messages);

      expect(result.breakdown.system).toBeGreaterThan(0);
      expect(result.breakdown.user).toBeGreaterThan(0);
      expect(result.breakdown.assistant).toBeGreaterThan(0);
      expect(result.breakdown.tool).toBeGreaterThan(0);

      // Sum of breakdowns + array overhead = total
      const sumOfParts =
        result.breakdown.system +
        result.breakdown.user +
        result.breakdown.assistant +
        result.breakdown.tool;
      expect(result.total).toBe(sumOfParts + TOKEN_COUNTER_DEFAULTS.arrayOverhead);
    });

    it('handles array content with text and toolCall blocks', () => {
      const messages: CompactionMessage[] = [
        msg('assistant', [
          { type: 'text', text: 'Let me read that file.' },
          {
            type: 'toolCall',
            name: 'read',
            arguments: { path: 'src/index.ts' },
          },
        ]),
      ];
      const result = counter.countMessageTokens(messages);

      // Both text and toolCall content should be counted
      expect(result.breakdown.assistant).toBeGreaterThan(3); // more than just overhead
      expect(result.total).toBeGreaterThan(6); // overhead + content
    });

    it('handles array content with toolResult blocks', () => {
      const messages: CompactionMessage[] = [
        msg('tool', [
          { type: 'result', output: 'file contents here' },
        ]),
      ];
      const result = counter.countMessageTokens(messages);

      expect(result.breakdown.tool).toBeGreaterThan(3);
    });

    it('maps tool and toolResult roles to tool category', () => {
      const messages: CompactionMessage[] = [
        msg('tool', 'tool call content'),
        msg('toolResult', 'tool result content'),
      ];
      const result = counter.countMessageTokens(messages);

      // Both roles should accumulate in the 'tool' breakdown
      expect(result.breakdown.tool).toBeGreaterThan(0);
      expect(result.breakdown.system).toBe(0);
      expect(result.breakdown.user).toBe(0);
      expect(result.breakdown.assistant).toBe(0);
    });
  });

  // ==========================================================================
  // estimateTokensFromChars (3 tests)
  // ==========================================================================
  describe('estimateTokensFromChars', () => {
    it('estimates tokens from character count', () => {
      // 100 chars → ceil(100/4) = 25
      expect(counter.estimateTokensFromChars(100)).toBe(25);
      // 1 char → ceil(1/4) = 1
      expect(counter.estimateTokensFromChars(1)).toBe(1);
    });

    it('returns 0 for zero character count', () => {
      expect(counter.estimateTokensFromChars(0)).toBe(0);
    });

    it('returns 0 for negative character count', () => {
      expect(counter.estimateTokensFromChars(-10)).toBe(0);
    });
  });

  // ==========================================================================
  // isOverBudget (3 tests)
  // ==========================================================================
  describe('isOverBudget', () => {
    it('returns true when current exceeds budget', () => {
      expect(counter.isOverBudget(100, 50)).toBe(true);
    });

    it('returns true when current equals budget', () => {
      expect(counter.isOverBudget(100, 100)).toBe(true);
    });

    it('returns false when current is under budget', () => {
      expect(counter.isOverBudget(50, 100)).toBe(false);
    });
  });

  // ==========================================================================
  // getRemainingBudget (3 tests)
  // ==========================================================================
  describe('getRemainingBudget', () => {
    it('returns positive value when under budget', () => {
      expect(counter.getRemainingBudget(50, 100)).toBe(50);
    });

    it('returns zero when exactly at budget', () => {
      expect(counter.getRemainingBudget(100, 100)).toBe(0);
    });

    it('returns negative value when over budget', () => {
      expect(counter.getRemainingBudget(150, 100)).toBe(-50);
    });
  });

  // ==========================================================================
  // Custom configuration (2 tests)
  // ==========================================================================
  describe('custom configuration', () => {
    it('respects custom charsPerToken ratio', () => {
      const customCounter = new TokenCounter({ charsPerToken: 3 });
      // "Hello" = 5 chars → ceil(5/3) = 2
      expect(customCounter.countTokens('Hello')).toBe(2);
      // 9 chars → ceil(9/3) = 3
      expect(customCounter.countTokens('123456789')).toBe(3);
    });

    it('respects custom message overhead', () => {
      const customCounter = new TokenCounter({ messageOverhead: 10 });
      const messages: CompactionMessage[] = [msg('user', 'Hi')];
      const result = customCounter.countMessageTokens(messages);

      // "Hi" → 1 token + 10 overhead = 11 + arrayOverhead(3) = 14
      expect(result.total).toBe(14);
    });

    it('respects custom array overhead', () => {
      const customCounter = new TokenCounter({ arrayOverhead: 0, messageOverhead: 0 });
      const messages: CompactionMessage[] = [msg('user', 'Hi')];
      const result = customCounter.countMessageTokens(messages);

      // "Hi" → 1 token, no overhead = 1
      expect(result.total).toBe(1);
    });
  });

  // ==========================================================================
  // Edge cases (1 test)
  // ==========================================================================
  describe('edge cases', () => {
    it('handles non-string, non-array content gracefully', () => {
      // Content that is neither string nor array (type says unknown[])
      const messages: CompactionMessage[] = [
        { role: 'user', content: undefined as unknown as string },
      ];
      const result = counter.countMessageTokens(messages);

      // Should still count the message overhead
      expect(result.total).toBeGreaterThanOrEqual(
        TOKEN_COUNTER_DEFAULTS.messageOverhead + TOKEN_COUNTER_DEFAULTS.arrayOverhead,
      );
    });
  });
});
