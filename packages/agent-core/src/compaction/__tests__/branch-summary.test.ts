import { describe, it, expect } from 'vitest';
import {
  shouldGenerateBranchSummary,
  generateBranchSummary,
  injectBranchSummary,
  BRANCH_SUMMARY_DEFAULTS,
  type CompactionMessage,
} from '../index.js';

describe('Branch Summary', () => {
  // ==========================================================================
  // shouldGenerateBranchSummary Tests (7 cases)
  // ==========================================================================
  describe('shouldGenerateBranchSummary', () => {
    const createMessages = (count: number, charLength = 100): CompactionMessage[] => {
      return Array.from({ length: count }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'x'.repeat(charLength),
      }));
    };

    it('returns true when branch has sufficient messages and tokens', () => {
      const messages = createMessages(5, 500); // 5 msgs * 500 chars = 2500 chars ≈ 625 tokens
      const result = shouldGenerateBranchSummary({
        sourceBranchMessages: messages,
      });
      expect(result).toBe(true);
    });

    it('returns false when source branch has fewer messages than minMessages', () => {
      const messages = createMessages(2, 200);
      const result = shouldGenerateBranchSummary({
        sourceBranchMessages: messages,
      });
      expect(result).toBe(false);
    });

    it('returns false when source branch has insufficient tokens', () => {
      // 3 messages but only 60 chars total = ~15 tokens (below 500 threshold)
      const messages = createMessages(3, 20);
      const result = shouldGenerateBranchSummary({
        sourceBranchMessages: messages,
      });
      expect(result).toBe(false);
    });

    it('returns false when existingSummary is true', () => {
      const messages = createMessages(5, 200);
      const result = shouldGenerateBranchSummary({
        sourceBranchMessages: messages,
        existingSummary: true,
      });
      expect(result).toBe(false);
    });

    it('respects custom minMessages config', () => {
      const messages = createMessages(4, 300); // 4 msgs * 300 chars = 1200 chars ≈ 300 tokens (low)
      const result = shouldGenerateBranchSummary(
        { sourceBranchMessages: messages },
        { minMessages: 5, minTokens: 100 },
      );
      expect(result).toBe(false);

      const result2 = shouldGenerateBranchSummary(
        { sourceBranchMessages: messages },
        { minMessages: 3, minTokens: 100 },
      );
      expect(result2).toBe(true);
    });

    it('respects custom minTokens config', () => {
      // 4 messages * 100 chars = 400 chars = ~100 tokens
      const messages = createMessages(4, 100);

      const resultHigh = shouldGenerateBranchSummary(
        { sourceBranchMessages: messages },
        { minTokens: 200 },
      );
      expect(resultHigh).toBe(false);

      const resultLow = shouldGenerateBranchSummary(
        { sourceBranchMessages: messages },
        { minTokens: 50 },
      );
      expect(resultLow).toBe(true);
    });

    it('returns false for empty messages array', () => {
      const result = shouldGenerateBranchSummary({
        sourceBranchMessages: [],
      });
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // generateBranchSummary Tests (6 cases)
  // ==========================================================================
  describe('generateBranchSummary', () => {
    const createMessages = (): CompactionMessage[] => [
      { role: 'user', content: 'Fix the login button' },
      { role: 'assistant', content: 'I will fix the login button.' },
      { role: 'tool', content: 'read(path="src/login.ts")' },
      {
        role: 'toolResult',
        content: 'function login() { ... }',
        toolCallId: 'tc1',
      },
      { role: 'assistant', content: 'Fixed the login button in src/login.ts' },
    ];

    it('generates summary with default title', () => {
      const messages = createMessages();
      const result = generateBranchSummary(messages);

      expect(result.summary).toContain('Source Branch Context');
      expect(result.summary).toContain('Fix the login button');
      expect(result.summary).toContain('---');
    });

    it('respects custom branchTitle option', () => {
      const messages = createMessages();
      const result = generateBranchSummary(messages, {
        branchTitle: 'Feature Branch: Login Fix',
      });

      expect(result.summary).toContain('Feature Branch: Login Fix');
    });

    it('extracts read files from tool calls', () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Read some files' },
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              name: 'read',
              arguments: { path: 'src/file1.ts' },
            },
            {
              type: 'toolCall',
              name: 'read',
              arguments: { path: 'src/file2.ts' },
            },
          ],
        },
      ];

      const result = generateBranchSummary(messages);

      expect(result.readFiles).toContain('src/file1.ts');
      expect(result.readFiles).toContain('src/file2.ts');
      expect(result.summary).toContain('<read-files>');
    });

    it('extracts modified files from tool calls', () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Edit a file' },
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              name: 'edit',
              arguments: { path: 'src/main.ts' },
            },
            {
              type: 'toolCall',
              name: 'write',
              arguments: { path: 'src/new.ts' },
            },
          ],
        },
      ];

      const result = generateBranchSummary(messages);

      expect(result.modifiedFiles).toContain('src/main.ts');
      expect(result.modifiedFiles).toContain('src/new.ts');
      expect(result.summary).toContain('<modified-files>');
    });

    it('files only read are not in modifiedFiles even if also edited', () => {
      const messages: CompactionMessage[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              name: 'read',
              arguments: { path: 'src/common.ts' },
            },
            {
              type: 'toolCall',
              name: 'edit',
              arguments: { path: 'src/common.ts' },
            },
          ],
        },
      ];

      const result = generateBranchSummary(messages);

      // File that was both read and edited should only be in modifiedFiles
      expect(result.modifiedFiles).toContain('src/common.ts');
      expect(result.readFiles).not.toContain('src/common.ts');
    });

    it('calculates token estimate from summary length', () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'x'.repeat(100) },
        { role: 'assistant', content: 'y'.repeat(100) },
      ];

      const result = generateBranchSummary(messages);

      // Token estimate should be roughly summary.length / 4
      expect(result.tokenEstimate).toBeGreaterThan(0);
      expect(result.tokenEstimate).toBeLessThanOrEqual(Math.ceil(result.summary.length / 4) + 10);
    });
  });

  // ==========================================================================
  // injectBranchSummary Tests (2 cases)
  // ==========================================================================
  describe('injectBranchSummary', () => {
    it('injects summary as system message at the beginning', () => {
      const targetMessages: CompactionMessage[] = [
        { role: 'user', content: 'New task' },
        { role: 'assistant', content: 'Starting work' },
      ];

      const summary = {
        summary: '## Branch Context\nPrevious work context...',
        readFiles: [],
        modifiedFiles: [],
        tokenEstimate: 100,
      };

      const result = injectBranchSummary(targetMessages, summary);

      expect(result).toHaveLength(3);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toBe('## Branch Context\nPrevious work context...');
      expect(result[0].messageType).toBe('branch_summary');
      expect(result[1].content).toBe('New task');
      expect(result[2].content).toBe('Starting work');
    });

    it('accepts string summary directly', () => {
      const targetMessages: CompactionMessage[] = [
        { role: 'user', content: 'Continue task' },
      ];

      const summaryString = '## Simple Summary\nContent here...';

      const result = injectBranchSummary(targetMessages, summaryString);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toBe('## Simple Summary\nContent here...');
      expect(result[0].messageType).toBe('branch_summary');
    });
  });
});
