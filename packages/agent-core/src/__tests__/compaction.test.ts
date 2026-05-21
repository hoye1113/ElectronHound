import { describe, it, expect } from 'vitest';
import {
  shouldTriggerCompaction,
  estimateTokens,
  createCompactionTrigger,
  COMPACTION_DEFAULTS,
  isValidCutPoint,
  findCutPoint,
  isToolResult,
  isToolCall,
  isTurnBoundary,
  getTurnMessages,
  groupByTurns,
  serializeConversation,
  prepareSummarizationPrompt,
  createFileOps,
  extractFileOpsFromMessage,
  computeFileLists,
  formatFileOperations,
  parseFileOperations,
  mergeFileTracking,
  generateSummary,
  extractGoal,
  extractProgress,
  extractKeyDecisions,
  extractNextSteps,
  extractCriticalContext,
  extractFileOperations,
  buildSummaryMarkdown,
  SUMMARIZATION_SYSTEM_PROMPT,
  DEFAULT_CUT_POINT_CONFIG,
} from '../compaction/index.js';
import type { CompactionMessage, MessageWithTokens } from '../compaction/cut-point.js';

describe('compaction trigger', () => {
  it('shouldTriggerCompaction returns false below threshold', () => {
    expect(shouldTriggerCompaction(50000, 128000, 16384)).toBe(false);
  });

  it('shouldTriggerCompaction returns true at threshold', () => {
    expect(shouldTriggerCompaction(111616, 128000, 16384)).toBe(true);
  });

  it('shouldTriggerCompaction returns true above threshold', () => {
    expect(shouldTriggerCompaction(120000, 128000, 16384)).toBe(true);
  });

  it('estimateTokens approximates 1 token per 4 chars', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });

  it('estimateTokens rounds up', () => {
    expect(estimateTokens('abc')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });

  it('createCompactionTrigger returns trigger object', () => {
    const trigger = createCompactionTrigger({ contextWindow: 100000 });
    expect(trigger.shouldTrigger).toBeDefined();
    expect(trigger.getThreshold).toBeDefined();
    expect(trigger.isEnabled).toBeDefined();
  });

  it('trigger.isEnabled returns true by default', () => {
    const trigger = createCompactionTrigger({ contextWindow: 100000 });
    expect(trigger.isEnabled()).toBe(true);
  });

  it('trigger.isEnabled returns false when disabled', () => {
    const trigger = createCompactionTrigger({ contextWindow: 100000, enabled: false });
    expect(trigger.isEnabled()).toBe(false);
  });

  it('trigger.getThreshold uses reserveTokens', () => {
    const trigger = createCompactionTrigger({ contextWindow: 100000, reserveTokens: 10000 });
    expect(trigger.getThreshold()).toBe(90000);
  });

  it('trigger.getThreshold uses thresholdPercentage override', () => {
    const trigger = createCompactionTrigger({ contextWindow: 100000, thresholdPercentage: 0.9 });
    expect(trigger.getThreshold()).toBe(90000);
  });

  it('trigger.shouldTrigger returns result object', () => {
    const trigger = createCompactionTrigger({ contextWindow: 100000 });
    const result = trigger.shouldTrigger(50000);
    expect(result.shouldTrigger).toBe(false);
    expect(result.contextTokens).toBe(50000);
    expect(result.usagePercentage).toBe(0.5);
    expect(result.remainingTokens).toBeGreaterThan(0);
  });

  it('COMPACTION_DEFAULTS exports expected values', () => {
    expect(COMPACTION_DEFAULTS.contextWindow).toBe(128000);
    expect(COMPACTION_DEFAULTS.reserveTokens).toBe(16384);
    expect(COMPACTION_DEFAULTS.keepRecentTokens).toBe(20000);
  });
});

describe('cut point rules', () => {
  it('isValidCutPoint accepts user messages', () => {
    expect(isValidCutPoint({ role: 'user', content: 'hi' })).toBe(true);
  });

  it('isValidCutPoint accepts assistant messages', () => {
    expect(isValidCutPoint({ role: 'assistant', content: 'reply' })).toBe(true);
  });

  it('isValidCutPoint rejects tool results', () => {
    expect(isValidCutPoint({ role: 'toolResult', content: 'result' })).toBe(false);
  });

  it('isValidCutPoint rejects tool messages', () => {
    expect(isValidCutPoint({ role: 'tool', content: 'tool' })).toBe(false);
  });

  it('isValidCutPoint rejects system messages', () => {
    expect(isValidCutPoint({ role: 'system', content: 'sys' })).toBe(false);
  });

  it('isToolResult identifies tool results', () => {
    expect(isToolResult({ role: 'toolResult', content: 'r' })).toBe(true);
    expect(isToolResult({ role: 'user', content: 'u' })).toBe(false);
  });

  it('isToolCall identifies tool calls', () => {
    expect(isToolCall({ role: 'tool', content: 't' })).toBe(true);
    expect(isToolCall({ role: 'user', content: 'u' })).toBe(false);
  });

  it('isTurnBoundary identifies user messages', () => {
    expect(isTurnBoundary({ role: 'user', content: 'u' })).toBe(true);
    expect(isTurnBoundary({ role: 'assistant', content: 'a' })).toBe(false);
  });

  it('findCutPoint returns all messages when too few', () => {
    const msgs: MessageWithTokens[] = [
      { role: 'user', content: 'a', tokenCount: 10 },
      { role: 'assistant', content: 'b', tokenCount: 10 },
    ];
    const result = findCutPoint(msgs);
    expect(result.cutIndex).toBe(0);
    expect(result.messagesToSummarize).toHaveLength(0);
  });

  it('findCutPoint respects keepRecentTokens', () => {
    const msgs: MessageWithTokens[] = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as any,
      content: `msg${i}`,
      tokenCount: 5000,
    }));
    const result = findCutPoint(msgs, { keepRecentTokens: 20000 });
    expect(result.messagesToKeep.length).toBeGreaterThanOrEqual(4);
  });

  it('DEFAULT_CUT_POINT_CONFIG has expected values', () => {
    expect(DEFAULT_CUT_POINT_CONFIG.keepRecentTokens).toBe(20000);
    expect(DEFAULT_CUT_POINT_CONFIG.minMessagesToKeep).toBe(4);
  });

  it('getTurnMessages groups messages until next user', () => {
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'assistant', content: 'c' },
      { role: 'user', content: 'd' },
    ];
    const { messages, endIndex } = getTurnMessages(msgs, 0);
    expect(messages).toHaveLength(3);
    expect(endIndex).toBe(2);
  });

  it('groupByTurns creates turn groups', () => {
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
    ];
    const turns = groupByTurns(msgs);
    expect(turns).toHaveLength(2);
  });
});

describe('summary generation utilities', () => {
  it('serializeConversation joins messages', () => {
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ];
    const result = serializeConversation(msgs);
    expect(result).toContain('hello');
    expect(result).toContain('world');
  });

  it('createFileOps returns empty tracker', () => {
    const ops = createFileOps();
    expect(ops.read.size).toBe(0);
    expect(ops.written.size).toBe(0);
    expect(ops.edited.size).toBe(0);
  });

  it('extractFileOpsFromMessage tracks read files', () => {
    const ops = createFileOps();
    const msg: CompactionMessage = {
      role: 'assistant',
      content: [{ type: 'toolCall', name: 'read', arguments: { path: '/a.ts' } }],
    };
    extractFileOpsFromMessage(msg, ops);
    expect(ops.read.has('/a.ts')).toBe(true);
  });

  it('extractFileOpsFromMessage tracks written files', () => {
    const ops = createFileOps();
    const msg: CompactionMessage = {
      role: 'assistant',
      content: [{ type: 'toolCall', name: 'write', arguments: { path: '/b.ts' } }],
    };
    extractFileOpsFromMessage(msg, ops);
    expect(ops.written.has('/b.ts')).toBe(true);
  });

  it('extractFileOpsFromMessage tracks edited files', () => {
    const ops = createFileOps();
    const msg: CompactionMessage = {
      role: 'assistant',
      content: [{ type: 'toolCall', name: 'edit', arguments: { path: '/c.ts' } }],
    };
    extractFileOpsFromMessage(msg, ops);
    expect(ops.edited.has('/c.ts')).toBe(true);
  });

  it('computeFileLists separates read-only from modified', () => {
    const ops = createFileOps();
    ops.read.add('/read.ts');
    ops.read.add('/both.ts');
    ops.edited.add('/both.ts');
    const { readFiles, modifiedFiles } = computeFileLists(ops);
    expect(readFiles).toContain('/read.ts');
    expect(readFiles).not.toContain('/both.ts');
    expect(modifiedFiles).toContain('/both.ts');
  });

  it('formatFileOperations generates XML tags', () => {
    const result = formatFileOperations(['/a.ts'], ['/b.ts']);
    expect(result).toContain('<read-files>');
    expect(result).toContain('/a.ts');
    expect(result).toContain('<modified-files>');
    expect(result).toContain('/b.ts');
  });

  it('formatFileOperations returns empty for no files', () => {
    expect(formatFileOperations([], [])).toBe('');
  });

  it('parseFileOperations extracts read files', () => {
    const summary = '<read-files>\n/a.ts\n/b.ts\n</read-files>';
    const { readFiles } = parseFileOperations(summary);
    expect(readFiles).toEqual(['/a.ts', '/b.ts']);
  });

  it('parseFileOperations extracts modified files', () => {
    const summary = '<modified-files>\n/c.ts\n</modified-files>';
    const { modifiedFiles } = parseFileOperations(summary);
    expect(modifiedFiles).toEqual(['/c.ts']);
  });

  it('mergeFileTracking combines multiple trackings', () => {
    const merged = mergeFileTracking(
      { readFiles: ['/a.ts'], modifiedFiles: ['/b.ts'] },
      { readFiles: ['/c.ts'], modifiedFiles: ['/d.ts'] },
    );
    expect(merged.readFiles).toContain('/a.ts');
    expect(merged.readFiles).toContain('/c.ts');
    expect(merged.modifiedFiles).toContain('/b.ts');
    expect(merged.modifiedFiles).toContain('/d.ts');
  });

  it('mergeFileTracking removes read files that were later modified', () => {
    const merged = mergeFileTracking(
      { readFiles: ['/x.ts'], modifiedFiles: [] },
      { readFiles: [], modifiedFiles: ['/x.ts'] },
    );
    expect(merged.readFiles).not.toContain('/x.ts');
    expect(merged.modifiedFiles).toContain('/x.ts');
  });

  it('SUMMARIZATION_SYSTEM_PROMPT is a non-empty string', () => {
    expect(typeof SUMMARIZATION_SYSTEM_PROMPT).toBe('string');
    expect(SUMMARIZATION_SYSTEM_PROMPT.length).toBeGreaterThan(50);
  });

  it('prepareSummarizationPrompt returns system and user prompt', () => {
    const msgs: CompactionMessage[] = [{ role: 'user', content: 'goal: build X' }];
    const { systemPrompt, userPrompt } = prepareSummarizationPrompt(msgs);
    expect(systemPrompt).toBeTruthy();
    expect(userPrompt).toContain('goal: build X');
  });
});

describe('Pi summary generation', () => {
  it('extractGoal finds explicit goal pattern', () => {
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'goal: implement login feature' },
    ];
    expect(extractGoal(msgs)).toContain('implement login feature');
  });

  it('extractGoal falls back to first user message', () => {
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'Help me with this project' },
    ];
    expect(extractGoal(msgs)).toContain('Help me with this project');
  });

  it('extractProgress finds completed items', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'done: implemented auth' },
    ];
    const p = extractProgress(msgs);
    expect(p.done.length).toBeGreaterThan(0);
  });

  it('extractKeyDecisions finds decision keywords', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'we decided to use PostgreSQL' },
    ];
    const decisions = extractKeyDecisions(msgs);
    expect(decisions.length).toBeGreaterThan(0);
  });

  it('extractNextSteps finds next patterns', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'next: deploy to staging' },
    ];
    const steps = extractNextSteps(msgs);
    expect(steps.length).toBeGreaterThan(0);
  });

  it('extractCriticalContext finds critical patterns', () => {
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: 'important: API key rotation needed' },
    ];
    const ctx = extractCriticalContext(msgs);
    expect(ctx).toContain('important');
  });

  it('buildSummaryMarkdown produces valid markdown', () => {
    const md = buildSummaryMarkdown({
      goal: 'Test goal',
      progress: { done: ['task1'], inProgress: [], blocked: [] },
      keyDecisions: ['used React'],
      nextSteps: ['deploy'],
      criticalContext: '- none',
      readFiles: [],
      modifiedFiles: [],
    });
    expect(md).toContain('## Goal');
    expect(md).toContain('Test goal');
    expect(md).toContain('## Progress');
    expect(md).toContain('## Key Decisions');
    expect(md).toContain('## Next Steps');
  });

  it('generateSummary returns markdown string', async () => {
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'goal: build dashboard' },
      { role: 'assistant', content: 'done: set up project' },
    ];
    const summary = await generateSummary(msgs);
    expect(typeof summary).toBe('string');
    expect(summary).toContain('## Goal');
    expect(summary.length).toBeGreaterThan(50);
  });

  it('generateSummary merges with previous summary file ops', async () => {
    const prevSummary = '<read-files>\n/prev.ts\n</read-files>';
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'continue work' },
    ];
    const summary = await generateSummary(msgs, { previousSummary: prevSummary });
    expect(summary).toContain('/prev.ts');
  });

  it('generateSummary with custom instructions prepends note', async () => {
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'goal: test' },
    ];
    const summary = await generateSummary(msgs, { customInstructions: 'Be brief' });
    expect(summary).toContain('Be brief');
  });
});
