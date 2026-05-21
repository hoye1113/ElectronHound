import { describe, it, expect } from 'vitest';
import {
  shouldGenerateBranchSummary,
  generateBranchSummary,
  injectBranchSummary,
  type CompactionMessage,
} from '../index.js';

describe('Branch Summary', () => {
  // ==========================================================================
  // shouldGenerateBranchSummary Tests (7 cases)
  // ==========================================================================
  describe('shouldGenerateBranchSummary', () => {
    const msg = (content: string, role: CompactionMessage['role'] = 'user'): CompactionMessage => ({
      role,
      content,
    });

    it('returns true when currentBranch !== targetBranch (branch switch)', () => {
      const history = [msg('hello'), msg('hi there', 'assistant')];
      expect(shouldGenerateBranchSummary('feature-a', 'main', history)).toBe(true);
    });

    it('returns true when switching branches even with empty history', () => {
      expect(shouldGenerateBranchSummary('feature-a', 'main', [])).toBe(true);
    });

    it('returns false when same branch and empty history', () => {
      expect(shouldGenerateBranchSummary('main', 'main', [])).toBe(false);
    });

    it('returns false when same branch, small content, no keywords', () => {
      // 3 short messages, ~12 tokens total, no keywords
      const history = [
        msg('abc'),
        msg('def', 'assistant'),
        msg('ghi'),
      ];
      expect(shouldGenerateBranchSummary('feature', 'feature', history)).toBe(false);
    });

    it('returns true when token estimate exceeds 500 threshold', () => {
      // 2100 chars ≈ 525 tokens (above 500 threshold)
      const longContent = 'a'.repeat(2100);
      const history = [msg(longContent)];
      expect(shouldGenerateBranchSummary('feature', 'feature', history)).toBe(true);
    });

    it('returns true when messages contain decision keywords', () => {
      const history = [msg('I decided to use PostgreSQL because it supports JSONB')];
      // Small token count but has keywords → true
      expect(shouldGenerateBranchSummary('feature', 'feature', history)).toBe(true);
    });

    it('returns true when messages contain unfinished task keywords', () => {
      const history = [msg('TODO: fix the authentication flow')];
      expect(shouldGenerateBranchSummary('feature', 'feature', history)).toBe(true);
    });
  });

  // ==========================================================================
  // generateBranchSummary Tests (6 cases)
  // ==========================================================================
  describe('generateBranchSummary', () => {
    it('returns a string (synchronous, not object)', () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Fix the bug' },
        { role: 'assistant', content: 'Done' },
      ];
      const result = generateBranchSummary(messages, 'feature/fix-bug');
      expect(typeof result).toBe('string');
    });

    it('includes branch name in the header', () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Work on feature' },
      ];
      const result = generateBranchSummary(messages, 'feature/auth');
      expect(result).toContain('# feature/auth Branch Summary');
    });

    it('includes all 5 section headers', () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Some work' },
      ];
      const result = generateBranchSummary(messages, 'dev');
      expect(result).toContain('## Key Decisions');
      expect(result).toContain('## File Operations');
      expect(result).toContain('## Problems & Solutions');
      expect(result).toContain('## Unfinished Tasks');
      expect(result).toContain('## Next Steps');
    });

    it('extracts read files from tool calls', () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Read the file' },
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              name: 'read',
              arguments: { path: 'src/login.ts' },
            },
            {
              type: 'toolCall',
              name: 'read',
              arguments: { path: 'src/auth.ts' },
            },
          ],
        },
      ];
      const result = generateBranchSummary(messages, 'feature');
      expect(result).toContain('<read-files>');
      expect(result).toContain('- src/auth.ts');
      expect(result).toContain('- src/login.ts');
      expect(result).toContain('</read-files>');
    });

    it('extracts modified files from tool calls', () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Edit the file' },
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
              arguments: { path: 'src/new-file.ts' },
            },
          ],
        },
      ];
      const result = generateBranchSummary(messages, 'feature');
      expect(result).toContain('<modified-files>');
      expect(result).toContain('- src/main.ts');
      expect(result).toContain('- src/new-file.ts');
      expect(result).toContain('</modified-files>');
    });

    it('extracts decision keywords into Key Decisions section', () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'What database should we use?' },
        { role: 'assistant', content: 'We chose PostgreSQL because it handles JSON well.' },
      ];
      const result = generateBranchSummary(messages, 'feature');
      const decisionsSection = result.split('## Key Decisions')[1].split('##')[0];
      expect(decisionsSection).toContain('chose');
      expect(decisionsSection).not.toContain('- None');
    });
  });

  // ==========================================================================
  // injectBranchSummary Tests (2 cases)
  // ==========================================================================
  describe('injectBranchSummary', () => {
    it('returns single-element array with system message and branch_summary messageType', () => {
      const result = injectBranchSummary('main', 'Previous work context...');

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('system');
      expect(result[0].messageType).toBe('branch_summary');
      expect(result[0].content).toContain('Previous work context...');
    });

    it('includes branch prefix wrapper in content', () => {
      const result = injectBranchSummary('feature/login', 'Summary here');

      expect(result[0].content).toBe(
        'You are continuing work from the feature/login branch. Here is the previous context:\n\nSummary here',
      );
    });
  });
});
