import { describe, it, expect } from 'vitest';
import {
  generateSummary,
  extractGoal,
  extractProgress,
  extractKeyDecisions,
  extractNextSteps,
  extractCriticalContext,
  extractFileOperations,
  buildSummaryMarkdown,
  serializeConversation,
  parseFileOperations,
  mergeFileTracking,
  formatFileOperations,
  createFileOps,
  extractFileOpsFromMessage,
  computeFileLists,
} from '../compaction/summary.js';
import { isSplitTurn, splitTurnAtMessage, mergeSummaries } from '../compaction/splitTurn.js';
import type { CompactionMessage, MessageWithTokens } from '../compaction/cut-point.js';

// ── extractGoal tests ──────────────────────────────────────────────────

describe('extractGoal', () => {
  it('extracts goal: pattern', () => {
    const msgs: CompactionMessage[] = [{ role: 'user', content: 'goal: add dark mode' }];
    expect(extractGoal(msgs)).toContain('add dark mode');
  });

  it('extracts objective: pattern', () => {
    const msgs: CompactionMessage[] = [{ role: 'user', content: 'objective: migrate DB' }];
    expect(extractGoal(msgs)).toContain('migrate DB');
  });

  it('extracts task: pattern', () => {
    const msgs: CompactionMessage[] = [{ role: 'user', content: 'task: write unit tests' }];
    expect(extractGoal(msgs)).toContain('write unit tests');
  });

  it('extracts implement pattern', () => {
    const msgs: CompactionMessage[] = [{ role: 'user', content: 'implement authentication' }];
    expect(extractGoal(msgs)).toContain('authentication');
  });

  it('falls back to first user message', () => {
    const msgs: CompactionMessage[] = [{ role: 'user', content: 'Just start building' }];
    expect(extractGoal(msgs)).toContain('Just start building');
  });

  it('returns default when no user messages', () => {
    expect(extractGoal([])).toBe('No goal identified');
  });

  it('truncates very long goals', () => {
    const msgs: CompactionMessage[] = [{ role: 'user', content: 'x'.repeat(300) }];
    const goal = extractGoal(msgs);
    expect(goal.length).toBeLessThanOrEqual(205);
  });
});

// ── extractProgress tests ──────────────────────────────────────────────

describe('extractProgress', () => {
  it('finds completed items', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'completed: set up CI pipeline' },
    ];
    const p = extractProgress(msgs);
    expect(p.done.length).toBeGreaterThan(0);
  });

  it('finds in-progress items', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'working on API integration' },
    ];
    const p = extractProgress(msgs);
    expect(p.inProgress.length).toBeGreaterThan(0);
  });

  it('finds blocked items', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'blocked: waiting for API key' },
    ];
    const p = extractProgress(msgs);
    expect(p.blocked.length).toBeGreaterThan(0);
  });

  it('returns empty arrays when no matches', () => {
    const msgs: CompactionMessage[] = [{ role: 'user', content: 'hello world' }];
    const p = extractProgress(msgs);
    expect(p.done).toHaveLength(0);
    expect(p.inProgress).toHaveLength(0);
    expect(p.blocked).toHaveLength(0);
  });
});

// ── extractKeyDecisions tests ──────────────────────────────────────────

describe('extractKeyDecisions', () => {
  it('finds decided keyword', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'We decided on PostgreSQL' },
    ];
    expect(extractKeyDecisions(msgs).length).toBeGreaterThan(0);
  });

  it('finds chose keyword', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'We chose TypeScript over JavaScript' },
    ];
    expect(extractKeyDecisions(msgs).length).toBeGreaterThan(0);
  });

  it('deduplicates decisions', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'Decided to use React\nDecided to use React' },
    ];
    const d = extractKeyDecisions(msgs);
    expect(d).toHaveLength(1);
  });
});

// ── extractNextSteps tests ──────────────────────────────────────────────

describe('extractNextSteps', () => {
  it('finds next: pattern', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'next: deploy to production' },
    ];
    expect(extractNextSteps(msgs).length).toBeGreaterThan(0);
  });

  it('finds TODO: pattern', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'TODO: add error handling' },
    ];
    expect(extractNextSteps(msgs).length).toBeGreaterThan(0);
  });
});

// ── extractCriticalContext tests ────────────────────────────────────────

describe('extractCriticalContext', () => {
  it('finds important: pattern', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'important: API rate limit is 100/min' },
    ];
    expect(extractCriticalContext(msgs)).toContain('important');
  });

  it('finds warning: pattern', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'warning: database migration required' },
    ];
    expect(extractCriticalContext(msgs)).toContain('warning');
  });

  it('returns default when no matches', () => {
    const msgs: CompactionMessage[] = [{ role: 'user', content: 'nothing critical' }];
    expect(extractCriticalContext(msgs)).toContain('No critical context');
  });
});

// ── buildSummaryMarkdown tests ──────────────────────────────────────────

describe('buildSummaryMarkdown', () => {
  it('includes all sections', () => {
    const md = buildSummaryMarkdown({
      goal: 'Test', progress: { done: [], inProgress: [], blocked: [] },
      keyDecisions: [], nextSteps: [], criticalContext: '- none',
      readFiles: [], modifiedFiles: [],
    });
    expect(md).toContain('## Goal');
    expect(md).toContain('## Progress');
    expect(md).toContain('## Key Decisions');
    expect(md).toContain('## Next Steps');
    expect(md).toContain('## Critical Context');
  });

  it('includes read files section', () => {
    const md = buildSummaryMarkdown({
      goal: 'X', progress: { done: [], inProgress: [], blocked: [] },
      keyDecisions: [], nextSteps: [], criticalContext: '- none',
      readFiles: ['/a.ts'], modifiedFiles: [],
    });
    expect(md).toContain('<read-files>');
    expect(md).toContain('/a.ts');
  });

  it('includes modified files section', () => {
    const md = buildSummaryMarkdown({
      goal: 'X', progress: { done: [], inProgress: [], blocked: [] },
      keyDecisions: [], nextSteps: [], criticalContext: '- none',
      readFiles: [], modifiedFiles: ['/b.ts'],
    });
    expect(md).toContain('<modified-files>');
  });

  it('shows default text for empty sections', () => {
    const md = buildSummaryMarkdown({
      goal: 'G', progress: { done: [], inProgress: [], blocked: [] },
      keyDecisions: [], nextSteps: [], criticalContext: '- none',
      readFiles: [], modifiedFiles: [],
    });
    expect(md).toContain('No completed tasks');
    expect(md).toContain('No key decisions');
  });

  it('numbers next steps', () => {
    const md = buildSummaryMarkdown({
      goal: 'G', progress: { done: [], inProgress: [], blocked: [] },
      keyDecisions: [], nextSteps: ['deploy', 'test'],
      criticalContext: '- none', readFiles: [], modifiedFiles: [],
    });
    expect(md).toContain('1. deploy');
    expect(md).toContain('2. test');
  });
});

// ── generateSummary integration tests ───────────────────────────────────

describe('generateSummary integration', () => {
  it('generates complete summary from messages', async () => {
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'goal: build a dashboard' },
      { role: 'assistant', content: 'completed: set up project structure' },
      { role: 'assistant', content: 'Decided to use Vite' },
      { role: 'assistant', content: 'next: implement auth' },
    ];
    const s = await generateSummary(msgs);
    expect(s).toContain('## Goal');
    expect(s).toContain('build a dashboard');
    expect(s).toContain('## Key Decisions');
  });

  it('tracks file operations in summary', async () => {
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'goal: build X' },
      {
        role: 'assistant',
        content: [
          { type: 'toolCall', name: 'read', arguments: { path: '/src/main.ts' } },
          { type: 'toolCall', name: 'write', arguments: { path: '/src/app.ts' } },
        ],
      },
    ];
    const s = await generateSummary(msgs);
    expect(s).toContain('/src/app.ts');
  });

  it('merges file tracking from previous summary', async () => {
    const prev = '<read-files>\n/old.ts\n</read-files>\n<modified-files>\n/chg.ts\n</modified-files>';
    const msgs: CompactionMessage[] = [{ role: 'user', content: 'goal: continue' }];
    const s = await generateSummary(msgs, { previousSummary: prev });
    expect(s).toContain('/old.ts');
    expect(s).toContain('/chg.ts');
  });

  it('custom instructions prepend note', async () => {
    const msgs: CompactionMessage[] = [{ role: 'user', content: 'goal: test' }];
    const s = await generateSummary(msgs, { customInstructions: 'Be concise' });
    expect(s).toContain('Be concise');
  });
});

// ── Split turn tests ───────────────────────────────────────────────────

describe('isSplitTurn', () => {
  it('returns false for empty messages', () => {
    expect(isSplitTurn([])).toBe(false);
  });

  it('returns true when last turn exceeds budget', () => {
    const msgs: MessageWithTokens[] = [
      { role: 'user', content: 'start', tokenCount: 10 },
      { role: 'assistant', content: 'a'.repeat(100000), tokenCount: 25000 },
    ];
    expect(isSplitTurn(msgs, 20000)).toBe(true);
  });

  it('returns false when last turn is within budget', () => {
    const msgs: MessageWithTokens[] = [
      { role: 'user', content: 'hi', tokenCount: 5 },
      { role: 'assistant', content: 'hi', tokenCount: 5 },
    ];
    expect(isSplitTurn(msgs, 20000)).toBe(false);
  });
});

describe('splitTurnAtMessage', () => {
  it('returns empty history for index 0', () => {
    const msgs: CompactionMessage[] = [{ role: 'user', content: 'a' }];
    const [history, prefix, suffix] = splitTurnAtMessage(msgs, 0);
    expect(history).toHaveLength(0);
    expect(suffix).toHaveLength(1);
  });

  it('splits at user message boundary', () => {
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ];
    const [history, prefix, suffix] = splitTurnAtMessage(msgs, 2);
    expect(history).toHaveLength(2);
    expect(suffix).toHaveLength(1);
  });
});

describe('mergeSummaries', () => {
  it('merges both summaries', () => {
    const m = mergeSummaries('History content', 'Turn prefix');
    expect(m).toContain('## History Summary');
    expect(m).toContain('History content');
    expect(m).toContain('## Current Turn Summary');
    expect(m).toContain('Turn prefix');
  });

  it('handles empty history', () => {
    const m = mergeSummaries('', 'Only prefix');
    expect(m).toContain('## Current Turn Summary');
    expect(m).not.toContain('## History Summary');
  });

  it('handles empty prefix', () => {
    const m = mergeSummaries('Only history', '');
    expect(m).toContain('## History Summary');
  });

  it('returns empty for both empty', () => {
    expect(mergeSummaries('', '')).toBe('');
  });
});
