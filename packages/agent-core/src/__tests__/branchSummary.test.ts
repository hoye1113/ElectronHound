import { describe, it, expect } from 'vitest';
import {
  shouldGenerateBranchSummary,
  generateBranchSummary,
  injectBranchSummary,
} from '../compaction/branch-summary.js';
import type { CompactionMessage } from '../compaction/cut-point.js';

describe('shouldGenerateBranchSummary', () => {
  it('returns true when switching branches', () => {
    expect(shouldGenerateBranchSummary('main', 'feature', [])).toBe(true);
  });

  it('returns false when same branch and empty history', () => {
    expect(shouldGenerateBranchSummary('main', 'main', [])).toBe(false);
  });

  it('returns true when tokens exceed 500 threshold', () => {
    const longContent = 'x'.repeat(2100); // > 500 tokens (~4 chars each)
    const msgs: CompactionMessage[] = [{ role: 'user', content: longContent }];
    expect(shouldGenerateBranchSummary('main', 'main', msgs)).toBe(true);
  });

  it('returns true when contains key information (decisions)', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'We decided to use TypeScript' },
    ];
    expect(shouldGenerateBranchSummary('main', 'main', msgs)).toBe(true);
  });

  it('returns true when contains key information (problems)', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'Fixed a bug in the login flow' },
    ];
    expect(shouldGenerateBranchSummary('main', 'main', msgs)).toBe(true);
  });

  it('returns true when contains key information (TODO)', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'TODO: implement caching' },
    ];
    expect(shouldGenerateBranchSummary('main', 'main', msgs)).toBe(true);
  });

  it('returns true when contains key information (next steps)', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'Next: integrate the API' },
    ];
    expect(shouldGenerateBranchSummary('main', 'main', msgs)).toBe(true);
  });

  it('returns false for short non-key conversation', () => {
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    expect(shouldGenerateBranchSummary('main', 'main', msgs)).toBe(false);
  });
});

describe('generateBranchSummary', () => {
  it('returns markdown with branch name', () => {
    const summary = generateBranchSummary([], 'feature-auth');
    expect(summary).toContain('feature-auth Branch Summary');
  });

  it('includes Key Decisions section', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'We chose React for the frontend' },
    ];
    const summary = generateBranchSummary(msgs, 'main');
    expect(summary).toContain('## Key Decisions');
    expect(summary).toContain('chose React');
  });

  it('includes File Operations section', () => {
    const msgs: CompactionMessage[] = [
      {
        role: 'assistant',
        content: [{ type: 'toolCall', name: 'write', arguments: { path: '/src/app.ts' } }],
      },
    ];
    const summary = generateBranchSummary(msgs, 'main');
    expect(summary).toContain('## File Operations');
    expect(summary).toContain('/src/app.ts');
  });

  it('includes Problems & Solutions section', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'Fixed the race condition' },
    ];
    const summary = generateBranchSummary(msgs, 'main');
    expect(summary).toContain('## Problems & Solutions');
    expect(summary).toContain('Fixed');
  });

  it('includes Unfinished Tasks section', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'TODO: add tests' },
    ];
    const summary = generateBranchSummary(msgs, 'main');
    expect(summary).toContain('## Unfinished Tasks');
    expect(summary).toContain('add tests');
  });

  it('includes Next Steps section', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'Next step: deploy' },
    ];
    const summary = generateBranchSummary(msgs, 'main');
    expect(summary).toContain('## Next Steps');
    expect(summary).toContain('deploy');
  });

  it('shows "None" for empty sections', () => {
    const summary = generateBranchSummary([], 'empty');
    expect(summary).toMatch(/## Key Decisions\n- None/);
  });

  it('tracks read vs modified files separately', () => {
    const msgs: CompactionMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'toolCall', name: 'read', arguments: { path: '/read.ts' } },
          { type: 'toolCall', name: 'write', arguments: { path: '/write.ts' } },
        ],
      },
    ];
    const summary = generateBranchSummary(msgs, 'main');
    expect(summary).toContain('/read.ts');
    expect(summary).toContain('/write.ts');
  });

  it('options parameter is accepted but reserved', () => {
    const summary = generateBranchSummary([], 'main', { model: 'gpt-4', temperature: 0.5, maxTokens: 1000 });
    expect(summary).toBeDefined();
  });
});

describe('injectBranchSummary', () => {
  it('returns single system message', () => {
    const msgs = injectBranchSummary('feature', 'Summary content here');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('system');
  });

  it('includes branch name in message', () => {
    const msgs = injectBranchSummary('feature-auth', 'Context...');
    expect(msgs[0].content).toContain('feature-auth');
  });

  it('includes summary content', () => {
    const summary = '# Branch Summary\n\nSome content';
    const msgs = injectBranchSummary('main', summary);
    expect(msgs[0].content).toContain('Some content');
  });

  it('sets messageType to branch_summary', () => {
    const msgs = injectBranchSummary('main', 'x');
    expect(msgs[0].messageType).toBe('branch_summary');
  });
});
