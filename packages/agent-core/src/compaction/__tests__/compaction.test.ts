import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Trigger
  createCompactionTrigger,
  shouldTriggerCompaction,
  estimateTokens,
  COMPACTION_DEFAULTS,

  // Cut point
  findCutPoint,
  isValidCutPoint,
  isTurnBoundary,
  getTurnMessages,
  groupByTurns,
  type CompactionMessage,
  type MessageWithTokens,

  // Summary
  serializeConversation,
  prepareSummarizationPrompt,
  createSummaryResult,
  extractFileOpsFromMessage,
  computeFileLists,
  formatFileOperations,
  parseFileOperations,
  createFileOps,
  mergeFileTracking,
} from '../index.js';

describe('Compaction Module', () => {
  // ==========================================================================
  // Trigger Tests
  // ==========================================================================
  describe('Trigger', () => {
    describe('shouldTriggerCompaction', () => {
      it('returns true when context exceeds threshold', () => {
        const result = shouldTriggerCompaction(120000, 128000, 16384);
        expect(result).toBe(true);
      });

      it('returns false when context is below threshold', () => {
        const result = shouldTriggerCompaction(100000, 128000, 16384);
        expect(result).toBe(false);
      });

      it('returns true at exact threshold', () => {
        const contextWindow = 128000;
        const reserveTokens = 16384;
        const threshold = contextWindow - reserveTokens;
        const result = shouldTriggerCompaction(threshold, contextWindow, reserveTokens);
        expect(result).toBe(true);
      });

      it('uses default reserveTokens of 16384', () => {
        const contextWindow = 128000;
        const threshold = contextWindow - 16384;
        expect(shouldTriggerCompaction(threshold, contextWindow)).toBe(true);
        expect(shouldTriggerCompaction(threshold - 1, contextWindow)).toBe(false);
      });
    });

    describe('createCompactionTrigger', () => {
      it('creates trigger with default config', () => {
        const trigger = createCompactionTrigger({
          contextWindow: 128000,
        });

        expect(trigger.isEnabled()).toBe(true);
        expect(trigger.getThreshold()).toBe(128000 - 16384);
      });

      it('creates trigger with custom reserveTokens', () => {
        const trigger = createCompactionTrigger({
          contextWindow: 100000,
          reserveTokens: 10000,
        });

        expect(trigger.getThreshold()).toBe(90000);
      });

      it('creates trigger with threshold percentage', () => {
        const trigger = createCompactionTrigger({
          contextWindow: 100000,
          thresholdPercentage: 0.75,
        });

        expect(trigger.getThreshold()).toBe(75000);
      });

      it('respects enabled=false', () => {
        const trigger = createCompactionTrigger({
          contextWindow: 128000,
          enabled: false,
        });

        expect(trigger.isEnabled()).toBe(false);

        const result = trigger.shouldTrigger(200000);
        expect(result.shouldTrigger).toBe(false);
      });

      it('returns correct trigger result', () => {
        const trigger = createCompactionTrigger({
          contextWindow: 100000,
          reserveTokens: 20000,
        });

        const result = trigger.shouldTrigger(50000);
        expect(result.shouldTrigger).toBe(false);
        expect(result.contextTokens).toBe(50000);
        expect(result.threshold).toBe(80000);
        expect(result.remainingTokens).toBe(30000);
        expect(result.usagePercentage).toBe(0.5);
      });

      it('triggers when context exceeds threshold', () => {
        const trigger = createCompactionTrigger({
          contextWindow: 100000,
          reserveTokens: 20000,
        });

        const result = trigger.shouldTrigger(90000);
        expect(result.shouldTrigger).toBe(true);
        expect(result.remainingTokens).toBeLessThan(0);
      });
    });

    describe('estimateTokens', () => {
      it('estimates tokens as ~4 chars per token', () => {
        const text = 'This is a test sentence.';
        const tokens = estimateTokens(text);
        expect(tokens).toBe(Math.ceil(text.length / 4));
      });

      it('returns 0 for empty string', () => {
        expect(estimateTokens('')).toBe(0);
      });
    });

    describe('COMPACTION_DEFAULTS', () => {
      it('has correct default values', () => {
        expect(COMPACTION_DEFAULTS.contextWindow).toBe(128000);
        expect(COMPACTION_DEFAULTS.reserveTokens).toBe(16384);
        expect(COMPACTION_DEFAULTS.keepRecentTokens).toBe(20000);
        expect(COMPACTION_DEFAULTS.thresholdPercentage).toBe(0.8);
        expect(COMPACTION_DEFAULTS.toolResultMaxChars).toBe(2000);
      });
    });
  });

  // ==========================================================================
  // Cut Point Tests
  // ==========================================================================
  describe('Cut Point', () => {
    const createMessages = (): MessageWithTokens[] => [
      { id: '1', role: 'user', content: 'Hello', tokenCount: 10 },
      { id: '2', role: 'assistant', content: 'Hi there!', tokenCount: 20 },
      { id: '3', role: 'user', content: 'Do something', tokenCount: 30 },
      { id: '4', role: 'assistant', content: 'Okay', tokenCount: 15 },
      { id: '5', role: 'tool', content: 'Tool call', tokenCount: 25 },
      { id: '6', role: 'toolResult', content: 'Result', tokenCount: 50 },
      { id: '7', role: 'assistant', content: 'Done', tokenCount: 15 },
      { id: '8', role: 'user', content: 'Next task', tokenCount: 20 },
      { id: '9', role: 'assistant', content: 'Working on it', tokenCount: 25 },
    ];

    describe('isValidCutPoint', () => {
      it('accepts user messages', () => {
        expect(isValidCutPoint({ role: 'user', content: 'test' })).toBe(true);
      });

      it('accepts assistant messages', () => {
        expect(isValidCutPoint({ role: 'assistant', content: 'test' })).toBe(true);
      });

      it('rejects toolResult messages', () => {
        expect(isValidCutPoint({ role: 'toolResult', content: 'test' })).toBe(false);
      });

      it('rejects tool messages', () => {
        expect(isValidCutPoint({ role: 'tool', content: 'test' })).toBe(false);
      });

      it('rejects system messages', () => {
        expect(isValidCutPoint({ role: 'system', content: 'test' })).toBe(false);
      });
    });

    describe('isTurnBoundary', () => {
      it('returns true for user messages', () => {
        expect(isTurnBoundary({ role: 'user', content: 'test' })).toBe(true);
      });

      it('returns false for non-user messages', () => {
        expect(isTurnBoundary({ role: 'assistant', content: 'test' })).toBe(false);
        expect(isTurnBoundary({ role: 'toolResult', content: 'test' })).toBe(false);
      });
    });

    describe('findCutPoint', () => {
      it('returns empty messagesToSummarize for small conversations', () => {
        const messages = createMessages().slice(0, 3);
        const result = findCutPoint(messages, { keepRecentTokens: 100000 });

        expect(result.messagesToSummarize).toHaveLength(0);
        expect(result.messagesToKeep).toHaveLength(3);
      });

      it('finds cut point based on token budget', () => {
        const messages = createMessages();
        const result = findCutPoint(messages, { keepRecentTokens: 50 });

        expect(result.messagesToKeep.length).toBeGreaterThan(0);
        expect(result.cutIndex).toBeGreaterThan(0);
      });

      it('prefers cutting at user message boundaries', () => {
        // Create messages where user boundaries are available in cut range
        const messages: MessageWithTokens[] = [
          { id: '1', role: 'user', content: 'Hello', tokenCount: 50 },
          { id: '2', role: 'assistant', content: 'Help 1', tokenCount: 50 },
          { id: '3', role: 'user', content: 'Task 2', tokenCount: 50 }, // Turn boundary at index 2
          { id: '4', role: 'assistant', content: 'Help 2', tokenCount: 50 },
          { id: '5', role: 'user', content: 'Task 3', tokenCount: 50 }, // Turn boundary at index 4
          { id: '6', role: 'assistant', content: 'Help 3', tokenCount: 50 },
        ];

        // With keepRecentTokens: 100, we need to cut from index 4 backwards
        const result = findCutPoint(messages, { keepRecentTokens: 100 });

        // Should cut at a user message (turn boundary)
        if (result.messagesToKeep.length > 0) {
          const firstKept = result.messagesToKeep[0];
          expect(['user', 'assistant']).toContain(firstKept.role);
        }
      });

      it('respects minMessagesToKeep', () => {
        const messages = createMessages();
        const result = findCutPoint(messages, {
          keepRecentTokens: 0,
          minMessagesToKeep: 4,
        });

        expect(result.messagesToKeep.length).toBeGreaterThanOrEqual(4);
      });

      it('handles empty messages array', () => {
        const result = findCutPoint([], { keepRecentTokens: 1000 });

        expect(result.cutIndex).toBe(0);
        expect(result.messagesToSummarize).toHaveLength(0);
        expect(result.messagesToKeep).toHaveLength(0);
      });
    });

    describe('getTurnMessages', () => {
      it('gets messages in a single turn', () => {
        const messages: CompactionMessage[] = [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' },
          { role: 'tool', content: 'Call' },
          { role: 'toolResult', content: 'Result' },
          { role: 'user', content: 'Next' },
        ];

        const result = getTurnMessages(messages, 0);
        expect(result.messages).toHaveLength(4);
        expect(result.endIndex).toBe(3);
      });

      it('handles single user message at end', () => {
        const messages: CompactionMessage[] = [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' },
          { role: 'user', content: 'Last' },
        ];

        const result = getTurnMessages(messages, 2);
        expect(result.messages).toHaveLength(1);
      });
    });

    describe('groupByTurns', () => {
      it('groups messages by turns', () => {
        const messages: CompactionMessage[] = [
          { role: 'user', content: 'Turn 1' },
          { role: 'assistant', content: 'Response 1' },
          { role: 'user', content: 'Turn 2' },
          { role: 'assistant', content: 'Response 2' },
          { role: 'user', content: 'Turn 3' },
        ];

        const turns = groupByTurns(messages);
        expect(turns).toHaveLength(3);
        expect(turns[0]).toHaveLength(2);
        expect(turns[1]).toHaveLength(2);
        expect(turns[2]).toHaveLength(1);
      });

      it('handles empty messages', () => {
        const turns = groupByTurns([]);
        expect(turns).toHaveLength(0);
      });

      it('handles single message', () => {
        const turns = groupByTurns([{ role: 'user', content: 'Hello' }]);
        expect(turns).toHaveLength(1);
      });
    });
  });

  // ==========================================================================
  // Summary Tests
  // ==========================================================================
  describe('Summary', () => {
    describe('serializeConversation', () => {
      it('serializes user messages', () => {
        const messages: CompactionMessage[] = [
          { role: 'user', content: 'Hello there' },
        ];

        const result = serializeConversation(messages);
        expect(result).toContain('[User]: Hello there');
      });

      it('serializes assistant messages', () => {
        const messages: CompactionMessage[] = [
          { role: 'assistant', content: 'Hi how can I help?' },
        ];

        const result = serializeConversation(messages);
        expect(result).toContain('[Assistant]: Hi how can I help?');
      });

      it('serializes tool results with truncation', () => {
        const longContent = 'x'.repeat(3000);
        const messages: CompactionMessage[] = [
          { role: 'toolResult', content: longContent },
        ];

        const result = serializeConversation(messages, 2000);
        expect(result).toContain('[Tool result]:');
        expect(result).toContain('truncated');
        expect(result.length).toBeLessThan(longContent.length);
      });

      it('handles array content with thinking blocks', () => {
        const messages: CompactionMessage[] = [
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'Internal reasoning' },
              { type: 'text', text: 'My response' },
            ],
          },
        ];

        const result = serializeConversation(messages);
        expect(result).toContain('[Assistant thinking]: Internal reasoning');
        expect(result).toContain('[Assistant]: My response');
      });

      it('handles array content with tool calls', () => {
        const messages: CompactionMessage[] = [
          {
            role: 'assistant',
            content: [
              { type: 'toolCall', name: 'read', arguments: { path: 'file.ts' } },
            ],
          },
        ];

        const result = serializeConversation(messages);
        expect(result).toContain('[Assistant tool calls]: read(path="file.ts")');
      });

      it('handles multiple messages', () => {
        const messages: CompactionMessage[] = [
          { role: 'user', content: 'Start' },
          { role: 'assistant', content: 'Middle' },
          { role: 'user', content: 'End' },
        ];

        const result = serializeConversation(messages);
        const parts = result.split('\n\n');
        expect(parts).toHaveLength(3);
      });
    });

    describe('prepareSummarizationPrompt', () => {
      it('creates basic summarization prompt', () => {
        const messages: CompactionMessage[] = [
          { role: 'user', content: 'Build a feature' },
          { role: 'assistant', content: 'Working on it' },
        ];

        const { systemPrompt, userPrompt } = prepareSummarizationPrompt(messages);

        expect(systemPrompt).toContain('summarization');
        expect(userPrompt).toContain('[User]: Build a feature');
        expect(userPrompt).toContain('[Assistant]: Working on it');
      });

      it('includes previous summary when provided', () => {
        const messages: CompactionMessage[] = [
          { role: 'user', content: 'Continue work' },
        ];

        const { userPrompt } = prepareSummarizationPrompt(messages, {
          previousSummary: '## Goal\nPrevious task',
        });

        expect(userPrompt).toContain('Previous summary');
        expect(userPrompt).toContain('Previous task');
        expect(userPrompt).toContain('New conversation');
      });

      it('uses custom prompt when provided', () => {
        const messages: CompactionMessage[] = [
          { role: 'user', content: 'Task' },
        ];

        const { systemPrompt } = prepareSummarizationPrompt(messages, {
          customPrompt: 'Custom summarization instructions',
        });

        expect(systemPrompt).toBe('Custom summarization instructions');
      });
    });

    describe('createSummaryResult', () => {
      it('creates result with file tracking', () => {
        const messages: CompactionMessage[] = [
          { role: 'user', content: 'Edit file' },
          {
            role: 'assistant',
            content: [
              { type: 'toolCall', name: 'read', arguments: { path: 'src/a.ts' } },
              { type: 'toolCall', name: 'edit', arguments: { path: 'src/b.ts' } },
            ],
          },
        ];

        const result = createSummaryResult('Summary', messages);

        expect(result.summary).toBe('Summary');
        expect(result.fileTracking.readFiles).toContain('src/a.ts');
        expect(result.fileTracking.modifiedFiles).toContain('src/b.ts');
      });

      it('excludes modified files from readFiles', () => {
        const messages: CompactionMessage[] = [
          {
            role: 'assistant',
            content: [
              { type: 'toolCall', name: 'read', arguments: { path: 'src/a.ts' } },
              { type: 'toolCall', name: 'edit', arguments: { path: 'src/a.ts' } },
            ],
          },
        ];

        const result = createSummaryResult('Summary', messages);

        // File was both read and edited, should only appear in modifiedFiles
        expect(result.fileTracking.readFiles).not.toContain('src/a.ts');
        expect(result.fileTracking.modifiedFiles).toContain('src/a.ts');
      });
    });

    describe('extractFileOpsFromMessage', () => {
      it('extracts read operations', () => {
        const fileOps = createFileOps();
        const message: CompactionMessage = {
          role: 'assistant',
          content: [{ type: 'toolCall', name: 'read', arguments: { path: 'file.ts' } }],
        };

        extractFileOpsFromMessage(message, fileOps);

        expect(fileOps.read.has('file.ts')).toBe(true);
      });

      it('extracts write operations', () => {
        const fileOps = createFileOps();
        const message: CompactionMessage = {
          role: 'assistant',
          content: [
            { type: 'toolCall', name: 'write', arguments: { path: 'new.ts', content: '' } },
          ],
        };

        extractFileOpsFromMessage(message, fileOps);

        expect(fileOps.written.has('new.ts')).toBe(true);
      });

      it('extracts edit operations', () => {
        const fileOps = createFileOps();
        const message: CompactionMessage = {
          role: 'assistant',
          content: [
            { type: 'toolCall', name: 'edit', arguments: { path: 'file.ts', edits: [] } },
          ],
        };

        extractFileOpsFromMessage(message, fileOps);

        expect(fileOps.edited.has('file.ts')).toBe(true);
      });

      it('ignores non-assistant messages', () => {
        const fileOps = createFileOps();
        const message: CompactionMessage = {
          role: 'user',
          content: [{ type: 'toolCall', name: 'read', arguments: { path: 'file.ts' } }],
        };

        extractFileOpsFromMessage(message, fileOps);

        expect(fileOps.read.size).toBe(0);
      });

      it('ignores tool calls without path', () => {
        const fileOps = createFileOps();
        const message: CompactionMessage = {
          role: 'assistant',
          content: [{ type: 'toolCall', name: 'bash', arguments: { command: 'ls' } }],
        };

        extractFileOpsFromMessage(message, fileOps);

        expect(fileOps.read.size).toBe(0);
        expect(fileOps.written.size).toBe(0);
        expect(fileOps.edited.size).toBe(0);
      });
    });

    describe('computeFileLists', () => {
      it('computes correct read and modified lists', () => {
        const fileOps = createFileOps();
        fileOps.read.add('src/a.ts');
        fileOps.read.add('src/b.ts');
        fileOps.edited.add('src/b.ts');
        fileOps.read.add('src/c.ts');
        fileOps.written.add('src/d.ts');

        const { readFiles, modifiedFiles } = computeFileLists(fileOps);

        expect(readFiles).toEqual(['src/a.ts', 'src/c.ts']);
        expect(modifiedFiles).toEqual(['src/b.ts', 'src/d.ts']);
      });
    });

    describe('formatFileOperations', () => {
      it('formats both sections', () => {
        const result = formatFileOperations(['a.ts', 'b.ts'], ['c.ts']);

        expect(result).toContain('<read-files>');
        expect(result).toContain('a.ts');
        expect(result).toContain('b.ts');
        expect(result).toContain('<modified-files>');
        expect(result).toContain('c.ts');
      });

      it('omits empty sections', () => {
        const result = formatFileOperations([], ['c.ts']);
        expect(result).not.toContain('<read-files>');
        expect(result).toContain('<modified-files>');
      });

      it('returns empty for no files', () => {
        const result = formatFileOperations([], []);
        expect(result).toBe('');
      });
    });

    describe('parseFileOperations', () => {
      it('parses read-files section', () => {
        const summary = `## Goal
Task

<read-files>
src/a.ts
src/b.ts
</read-files>`;

        const { readFiles, modifiedFiles } = parseFileOperations(summary);

        expect(readFiles).toEqual(['src/a.ts', 'src/b.ts']);
        expect(modifiedFiles).toEqual([]);
      });

      it('parses modified-files section', () => {
        const summary = `## Goal
Task

<modified-files>
src/c.ts
</modified-files>`;

        const { readFiles, modifiedFiles } = parseFileOperations(summary);

        expect(readFiles).toEqual([]);
        expect(modifiedFiles).toEqual(['src/c.ts']);
      });

      it('parses both sections', () => {
        const summary = `## Goal
Task

<read-files>
src/a.ts
</read-files>

<modified-files>
src/b.ts
</modified-files>`;

        const { readFiles, modifiedFiles } = parseFileOperations(summary);

        expect(readFiles).toEqual(['src/a.ts']);
        expect(modifiedFiles).toEqual(['src/b.ts']);
      });

      it('returns empty for no sections', () => {
        const summary = `## Goal
Just a task`;

        const { readFiles, modifiedFiles } = parseFileOperations(summary);

        expect(readFiles).toEqual([]);
        expect(modifiedFiles).toEqual([]);
      });
    });

    describe('mergeFileTracking', () => {
      it('merges multiple trackings', () => {
        const result = mergeFileTracking(
          { readFiles: ['a.ts'], modifiedFiles: ['b.ts'] },
          { readFiles: ['c.ts'], modifiedFiles: ['d.ts'] },
        );

        expect(result.readFiles).toEqual(['a.ts', 'c.ts']);
        expect(result.modifiedFiles).toEqual(['b.ts', 'd.ts']);
      });

      it('deduplicates files', () => {
        const result = mergeFileTracking(
          { readFiles: ['a.ts', 'b.ts'], modifiedFiles: [] },
          { readFiles: ['b.ts', 'c.ts'], modifiedFiles: [] },
        );

        expect(result.readFiles).toEqual(['a.ts', 'b.ts', 'c.ts']);
      });

      it('moves read files to modified when later modified', () => {
        const result = mergeFileTracking(
          { readFiles: ['a.ts'], modifiedFiles: [] },
          { readFiles: [], modifiedFiles: ['a.ts'] },
        );

        expect(result.readFiles).not.toContain('a.ts');
        expect(result.modifiedFiles).toContain('a.ts');
      });
    });
  });
});
