import { describe, it, expect, beforeEach } from 'vitest';
import { BranchSummarization } from '../branchSummarization.js';
import type { CompactionMessage } from '../cut-point.js';
import type { BranchSummaryResult, BranchSummaryEntry } from '../types.js';
import type { ToolRegistry } from '../../tools/types.js';

/**
 * Minimal ToolRegistry stub for testing.
 */
function createStubRegistry(): ToolRegistry {
  const tools = new Map<string, unknown>();
  return {
    tools: tools as Map<string, any>,
    register: () => {},
    get: (name: string) => tools.get(name) as any,
    invoke: async () => ({ success: true }),
    streamInvoke: async function* () {},
  };
}

describe('BranchSummarization', () => {
  let summarizer: BranchSummarization;
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createStubRegistry();
    summarizer = new BranchSummarization(registry);
  });

  // ==========================================================================
  // Constructor & basic behavior (3 tests)
  // ==========================================================================
  describe('constructor', () => {
    it('creates instance with empty summaries', () => {
      expect(summarizer.listBranches()).toEqual([]);
    });

    it('hasSummary returns false for unknown branch', () => {
      expect(summarizer.hasSummary('unknown')).toBe(false);
    });

    it('getBranchSummary returns undefined for unknown branch', () => {
      expect(summarizer.getBranchSummary('unknown')).toBeUndefined();
    });
  });

  // ==========================================================================
  // summarizeBranch (7 tests)
  // ==========================================================================
  describe('summarizeBranch', () => {
    it('returns BranchSummaryResult with correct fields', async () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Fix the bug' },
        { role: 'assistant', content: 'Done' },
      ];
      const result = await summarizer.summarizeBranch('feature-a', messages);

      expect(result.branchName).toBe('feature-a');
      expect(typeof result.summary).toBe('string');
      expect(Array.isArray(result.readFiles)).toBe(true);
      expect(Array.isArray(result.modifiedFiles)).toBe(true);
      expect(typeof result.tokenCount).toBe('number');
      expect(typeof result.timestamp).toBe('string');
    });

    it('summary contains branch name in header', async () => {
      const result = await summarizer.summarizeBranch('feature/auth', [
        { role: 'user', content: 'Work on auth' },
      ]);
      expect(result.summary).toContain('# feature/auth Branch Summary');
    });

    it('summary contains all 5 section headers', async () => {
      const result = await summarizer.summarizeBranch('dev', [
        { role: 'user', content: 'Some work' },
      ]);
      expect(result.summary).toContain('## Key Decisions');
      expect(result.summary).toContain('## File Operations');
      expect(result.summary).toContain('## Problems & Solutions');
      expect(result.summary).toContain('## Unfinished Tasks');
      expect(result.summary).toContain('## Next Steps');
    });

    it('extracts read files from tool calls', async () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Read files' },
        {
          role: 'assistant',
          content: [
            { type: 'toolCall', name: 'read', arguments: { path: 'src/file1.ts' } },
            { type: 'toolCall', name: 'read', arguments: { path: 'src/file2.ts' } },
          ],
        },
      ];
      const result = await summarizer.summarizeBranch('feature', messages);

      expect(result.readFiles).toContain('src/file1.ts');
      expect(result.readFiles).toContain('src/file2.ts');
      expect(result.summary).toContain('<read-files>');
      expect(result.summary).toContain('- src/file1.ts');
    });

    it('extracts modified files from tool calls', async () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Edit files' },
        {
          role: 'assistant',
          content: [
            { type: 'toolCall', name: 'write', arguments: { path: 'src/new.ts' } },
            { type: 'toolCall', name: 'edit', arguments: { path: 'src/old.ts' } },
          ],
        },
      ];
      const result = await summarizer.summarizeBranch('feature', messages);

      expect(result.modifiedFiles).toContain('src/new.ts');
      expect(result.modifiedFiles).toContain('src/old.ts');
      expect(result.summary).toContain('<modified-files>');
    });

    it('extracts decision keywords into Key Decisions section', async () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Which database?' },
        { role: 'assistant', content: 'I decided to use PostgreSQL because it supports JSONB.' },
      ];
      const result = await summarizer.summarizeBranch('feature', messages);

      const decisionsSection = result.summary.split('## Key Decisions')[1]?.split('##')[0] ?? '';
      expect(decisionsSection).toContain('decided');
      expect(decisionsSection).not.toContain('- None');
    });

    it('stores summary entry for the branch', async () => {
      await summarizer.summarizeBranch('feature-x', [
        { role: 'user', content: 'Some work' },
      ]);

      expect(summarizer.hasSummary('feature-x')).toBe(true);
      const entry = summarizer.getBranchSummary('feature-x');
      expect(entry).toBeDefined();
      expect(entry?.entryType).toBe('branch_summary');
      expect(entry?.branchName).toBe('feature-x');
    });
  });

  // ==========================================================================
  // injectBranchSummary (3 tests)
  // ==========================================================================
  describe('injectBranchSummary', () => {
    it('returns single-element array with system message', async () => {
      const result = await summarizer.injectBranchSummary('main', 'Context here...');

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('system');
      expect(result[0].messageType).toBe('branch_summary');
    });

    it('includes target branch name in content', async () => {
      const result = await summarizer.injectBranchSummary('feature/login', 'Summary');
      expect(result[0].content).toContain('feature/login');
    });

    it('includes the summary in content', async () => {
      const result = await summarizer.injectBranchSummary('dev', 'Detailed context...');
      expect(result[0].content).toContain('Detailed context...');
    });
  });

  // ==========================================================================
  // /tree navigation context preservation (4 tests)
  // ==========================================================================
  describe('navigateBranch (/tree navigation)', () => {
    it('summarizes current branch and returns injected messages when switching', async () => {
      // First, store a summary for the target branch
      await summarizer.summarizeBranch('main', [
        { role: 'user', content: 'Main branch work' },
      ]);

      const currentMessages: CompactionMessage[] = [
        { role: 'user', content: 'I decided to refactor auth module' },
      ];
      const result = await summarizer.navigateBranch(
        'feature-auth',
        'main',
        currentMessages,
      );

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('system');
      expect(result[0].messageType).toBe('branch_summary');
      expect(result[0].content).toContain('main');
    });

    it('returns empty array when target branch has no stored summary', async () => {
      const result = await summarizer.navigateBranch(
        'feature-a',
        'unknown-branch',
        [{ role: 'user', content: 'Some work' }],
      );

      expect(result).toEqual([]);
    });

    it('supports multi-branch navigation', async () => {
      // Summarize feature-A
      await summarizer.summarizeBranch('feature-A', [
        { role: 'user', content: 'Feature A work decided to use React' },
      ]);
      // Navigate from feature-A to feature-B
      await summarizer.navigateBranch('feature-A', 'feature-B', [
        { role: 'user', content: 'Feature A work' },
      ]);
      // Summarize feature-B (now it has a summary)
      await summarizer.summarizeBranch('feature-B', [
        { role: 'user', content: 'Feature B work' },
      ]);

      // Navigate from feature-B to feature-A
      const result = await summarizer.navigateBranch('feature-B', 'feature-A', [
        { role: 'user', content: 'Feature B work' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('feature-A');
    });

    it('does not generate summary for same branch navigation', async () => {
      const result = await summarizer.navigateBranch('main', 'main', [
        { role: 'user', content: 'Same branch work' },
      ]);

      // No stored summary for 'main' yet, so returns empty
      expect(result).toEqual([]);
      expect(summarizer.hasSummary('main')).toBe(false);
    });
  });

  // ==========================================================================
  // Cumulative file tracking (5 tests)
  // ==========================================================================
  describe('cumulative file tracking', () => {
    it('first summarization captures initial file lists', async () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Read file1' },
        {
          role: 'assistant',
          content: [{ type: 'toolCall', name: 'read', arguments: { path: 'src/file1.ts' } }],
        },
      ];
      const result = await summarizer.summarizeBranch('feature', messages);

      expect(result.readFiles).toEqual(['src/file1.ts']);
    });

    it('second summarization merges new files with previous', async () => {
      // First compaction
      await summarizer.summarizeBranch('feature', [
        {
          role: 'assistant',
          content: [{ type: 'toolCall', name: 'read', arguments: { path: 'src/file1.ts' } }],
        },
      ]);

      // Second compaction: new file read
      const result = await summarizer.summarizeBranch('feature', [
        {
          role: 'assistant',
          content: [{ type: 'toolCall', name: 'read', arguments: { path: 'src/file2.ts' } }],
        },
      ]);

      expect(result.readFiles).toContain('src/file1.ts');
      expect(result.readFiles).toContain('src/file2.ts');
    });

    it('read files become modified when later modified', async () => {
      // First: read file1.ts
      await summarizer.summarizeBranch('feature', [
        {
          role: 'assistant',
          content: [{ type: 'toolCall', name: 'read', arguments: { path: 'src/file1.ts' } }],
        },
      ]);

      // Second: modify file1.ts (should move from readFiles to modifiedFiles)
      const result = await summarizer.summarizeBranch('feature', [
        {
          role: 'assistant',
          content: [{ type: 'toolCall', name: 'edit', arguments: { path: 'src/file1.ts' } }],
        },
      ]);

      expect(result.readFiles).not.toContain('src/file1.ts');
      expect(result.modifiedFiles).toContain('src/file1.ts');
    });

    it('modified files accumulate across compactions', async () => {
      await summarizer.summarizeBranch('feature', [
        {
          role: 'assistant',
          content: [{ type: 'toolCall', name: 'write', arguments: { path: 'src/new1.ts' } }],
        },
      ]);

      const result = await summarizer.summarizeBranch('feature', [
        {
          role: 'assistant',
          content: [{ type: 'toolCall', name: 'write', arguments: { path: 'src/new2.ts' } }],
        },
      ]);

      expect(result.modifiedFiles).toContain('src/new1.ts');
      expect(result.modifiedFiles).toContain('src/new2.ts');
    });

    it('clearSummaries resets cumulative tracking', async () => {
      await summarizer.summarizeBranch('feature', [
        {
          role: 'assistant',
          content: [
            { type: 'toolCall', name: 'read', arguments: { path: 'src/old.ts' } },
            { type: 'toolCall', name: 'write', arguments: { path: 'src/modified.ts' } },
          ],
        },
      ]);

      summarizer.clearSummaries();
      expect(summarizer.listBranches()).toEqual([]);

      const result = await summarizer.summarizeBranch('feature', [
        {
          role: 'assistant',
          content: [{ type: 'toolCall', name: 'read', arguments: { path: 'src/new.ts' } }],
        },
      ]);

      expect(result.readFiles).toEqual(['src/new.ts']);
      expect(result.modifiedFiles).toEqual([]);
    });
  });

  // ==========================================================================
  // BranchSummaryEntry type verification (2 tests)
  // ==========================================================================
  describe('BranchSummaryEntry', () => {
    it('entry has correct entryType discriminator', async () => {
      await summarizer.summarizeBranch('feature', [
        { role: 'user', content: 'Some work' },
      ]);

      const entry: BranchSummaryEntry | undefined = summarizer.getBranchSummary('feature');
      expect(entry?.entryType).toBe('branch_summary');
    });

    it('entry contains cumulative file tracking details', async () => {
      await summarizer.summarizeBranch('feature', [
        {
          role: 'assistant',
          content: [
            { type: 'toolCall', name: 'read', arguments: { path: 'src/a.ts' } },
            { type: 'toolCall', name: 'write', arguments: { path: 'src/b.ts' } },
          ],
        },
      ]);

      const entry = summarizer.getBranchSummary('feature');
      expect(entry?.readFiles).toEqual(['src/a.ts']);
      expect(entry?.modifiedFiles).toEqual(['src/b.ts']);
      expect(entry?.details?.compactionCount).toBe(1);
    });
  });
});
