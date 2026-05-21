import { describe, it, expect } from 'vitest';
import {
  isSplitTurn,
  splitTurnAtMessage,
  mergeSummaries,
  type CompactionMessage,
  type MessageWithTokens,
} from '../index.js';

describe('Split Turn Detection', () => {
  // ==========================================================================
  // isSplitTurn Tests (4 cases)
  // ==========================================================================
  describe('isSplitTurn', () => {
    it('returns false for empty messages', () => {
      expect(isSplitTurn([], 20000)).toBe(false);
    });

    it('returns false when last turn fits within budget', () => {
      const messages: MessageWithTokens[] = [
        { id: '1', role: 'user', content: 'Hello', tokenCount: 100 },
        { id: '2', role: 'assistant', content: 'Hi', tokenCount: 200 },
        { id: '3', role: 'user', content: 'Next', tokenCount: 150 },
        { id: '4', role: 'assistant', content: 'OK', tokenCount: 100 },
      ];
      // Last turn (index 2-3) = 250 tokens, budget = 1000
      expect(isSplitTurn(messages, 1000)).toBe(false);
    });

    it('returns true when last turn exceeds budget', () => {
      const messages: MessageWithTokens[] = [
        { id: '1', role: 'user', content: 'Hello', tokenCount: 100 },
        { id: '2', role: 'assistant', content: 'Hi', tokenCount: 200 },
        { id: '3', role: 'user', content: 'Big task', tokenCount: 5000 },
        { id: '4', role: 'assistant', content: 'Working...', tokenCount: 10000 },
        { id: '5', role: 'tool', content: 'Tool call', tokenCount: 500 },
        { id: '6', role: 'toolResult', content: 'Result', tokenCount: 8000 },
      ];
      // Last turn (index 2-5) = 23500 tokens, budget = 20000
      expect(isSplitTurn(messages, 20000)).toBe(true);
    });

    it('returns false at exactly the budget boundary', () => {
      const messages: MessageWithTokens[] = [
        { id: '1', role: 'user', content: 'Task', tokenCount: 10000 },
        { id: '2', role: 'assistant', content: 'Done', tokenCount: 10000 },
      ];
      // Turn = 20000 tokens, budget = 20000 → NOT exceeding
      expect(isSplitTurn(messages, 20000)).toBe(false);
    });
  });

  // ==========================================================================
  // splitTurnAtMessage Tests (4 cases)
  // ==========================================================================
  describe('splitTurnAtMessage', () => {
    const baseMessages: CompactionMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Turn 1' },
      { role: 'assistant', content: 'Response 1' },
      { role: 'tool', content: 'Tool call 1' },
      { role: 'toolResult', content: 'Result 1' },
      { role: 'user', content: 'Turn 2 (big)' }, // index 5 = turn start
      { role: 'assistant', content: 'Working on it...', id: 'a2' },
      { role: 'tool', content: 'Tool call 2', id: 't2' },
      { role: 'toolResult', content: 'Result 2', id: 'r2' },
      { role: 'assistant', content: 'Still working...', id: 'a3' },
    ];

    it('returns [empty, empty, messages] for messageIndex=0', () => {
      const [history, prefix, suffix] = splitTurnAtMessage(baseMessages, 0);

      expect(history).toHaveLength(0);
      expect(prefix).toHaveLength(0);
      expect(suffix).toHaveLength(baseMessages.length);
    });

    it('splits correctly mid-turn (index=8)', () => {
      // Turn 2 starts at index 5 (user message)
      // Split at index 8: history=[0-4], prefix=[5-7], suffix=[8-9]
      const [history, prefix, suffix] = splitTurnAtMessage(baseMessages, 8);

      expect(history).toHaveLength(5); // system, user1, assistant1, tool1, result1
      expect(prefix).toHaveLength(3); // user2, assistant2, tool2
      expect(suffix).toHaveLength(2); // result2, assistant3
    });

    it('splits at turn start (index=5)', () => {
      const [history, prefix, suffix] = splitTurnAtMessage(baseMessages, 5);

      expect(history).toHaveLength(5); // everything before turn 2
      expect(prefix).toHaveLength(0); // nothing before index 5 within turn
      expect(suffix).toHaveLength(5); // indices 5-9
    });

    it('handles empty messages array', () => {
      const [history, prefix, suffix] = splitTurnAtMessage([], 5);

      expect(history).toHaveLength(0);
      expect(prefix).toHaveLength(0);
      expect(suffix).toHaveLength(0);
    });
  });

  // ==========================================================================
  // mergeSummaries Tests (3 cases)
  // ==========================================================================
  describe('mergeSummaries', () => {
    it('merges both summaries with section headers', () => {
      const result = mergeSummaries(
        'User wants to build a feature.\nDone: explored code.',
        'Working on implementation.\nIn progress: writing tests.',
      );

      expect(result).toContain('## History Summary');
      expect(result).toContain('## Current Turn Summary');
      expect(result).toContain('User wants to build a feature.');
      expect(result).toContain('Working on implementation.');
    });

    it('returns only history when turnPrefix is empty', () => {
      const result = mergeSummaries('History summary content', '');

      expect(result).toContain('## History Summary');
      expect(result).toContain('History summary content');
      expect(result).not.toContain('## Current Turn Summary');
    });

    it('returns only turnPrefix when history is empty', () => {
      const result = mergeSummaries('', 'Turn prefix content');

      expect(result).not.toContain('## History Summary');
      expect(result).toContain('## Current Turn Summary');
      expect(result).toContain('Turn prefix content');
    });

    it('returns empty string when both are empty', () => {
      expect(mergeSummaries('', '')).toBe('');
      expect(mergeSummaries('  ', '  ')).toBe('');
    });
  });
});
