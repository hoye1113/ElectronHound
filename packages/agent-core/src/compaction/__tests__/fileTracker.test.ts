import { describe, it, expect, beforeEach } from 'vitest';
import { FileTracker } from '../fileTracker.js';
import type { CompactionEntryDetails } from '../types.js';
import type { CompactionMessage } from '../cut-point.js';

describe('FileTracker', () => {
  let tracker: FileTracker;

  beforeEach(() => {
    tracker = new FileTracker();
  });

  // ==========================================================================
  // trackFile (4 tests)
  // ==========================================================================
  describe('trackFile', () => {
    it('tracks a file as read', () => {
      tracker.trackFile('src/index.ts', 'read');
      expect(tracker.getFilesByType('read')).toEqual(['src/index.ts']);
      expect(tracker.getFilesByType('modified')).toEqual([]);
    });

    it('tracks a file as modified', () => {
      tracker.trackFile('src/index.ts', 'modified');
      expect(tracker.getFilesByType('modified')).toEqual(['src/index.ts']);
      expect(tracker.getFilesByType('read')).toEqual([]);
    });

    it('demotes read to modified when file is later modified', () => {
      tracker.trackFile('src/index.ts', 'read');
      expect(tracker.getFilesByType('read')).toEqual(['src/index.ts']);

      tracker.trackFile('src/index.ts', 'modified');
      expect(tracker.getFilesByType('read')).toEqual([]);
      expect(tracker.getFilesByType('modified')).toEqual(['src/index.ts']);
    });

    it('does not add to read if already modified', () => {
      tracker.trackFile('src/index.ts', 'modified');
      tracker.trackFile('src/index.ts', 'read');

      expect(tracker.getFilesByType('read')).toEqual([]);
      expect(tracker.getFilesByType('modified')).toEqual(['src/index.ts']);
    });
  });

  // ==========================================================================
  // getFilesByType (2 tests)
  // ==========================================================================
  describe('getFilesByType', () => {
    it('returns sorted files', () => {
      tracker.trackFile('z-file.ts', 'read');
      tracker.trackFile('a-file.ts', 'read');
      tracker.trackFile('m-file.ts', 'read');

      expect(tracker.getFilesByType('read')).toEqual([
        'a-file.ts',
        'm-file.ts',
        'z-file.ts',
      ]);
    });

    it('returns empty array when no files tracked', () => {
      expect(tracker.getFilesByType('read')).toEqual([]);
      expect(tracker.getFilesByType('modified')).toEqual([]);
    });
  });

  // ==========================================================================
  // getAllFiles (2 tests)
  // ==========================================================================
  describe('getAllFiles', () => {
    it('returns all files sorted and deduplicated', () => {
      tracker.trackFile('src/utils.ts', 'read');
      tracker.trackFile('src/index.ts', 'modified');
      tracker.trackFile('src/config.ts', 'read');

      expect(tracker.getAllFiles()).toEqual([
        'src/config.ts',
        'src/index.ts',
        'src/utils.ts',
      ]);
    });

    it('returns empty array when no files tracked', () => {
      expect(tracker.getAllFiles()).toEqual([]);
    });
  });

  // ==========================================================================
  // merge (5 tests)
  // ==========================================================================
  describe('merge', () => {
    it('returns CompactionEntryDetails with current files when no previous entries', () => {
      tracker.trackFile('src/a.ts', 'read');
      tracker.trackFile('src/b.ts', 'modified');

      const result = tracker.merge([]);

      expect(result.entryType).toBe('compaction');
      expect(result.readFiles).toEqual(['src/a.ts']);
      expect(result.modifiedFiles).toEqual(['src/b.ts']);
      expect(typeof result.tokenCount).toBe('number');
      expect(typeof result.timestamp).toBe('string');
    });

    it('accumulates files from previous entries', () => {
      tracker.trackFile('src/new.ts', 'read');

      const previousEntries: CompactionEntryDetails[] = [
        {
          entryType: 'compaction',
          readFiles: ['src/old.ts'],
          modifiedFiles: ['src/edited.ts'],
          tokenCount: 2,
          timestamp: '2025-01-01T00:00:00.000Z',
        },
      ];

      const result = tracker.merge(previousEntries);

      expect(result.readFiles).toEqual(['src/new.ts', 'src/old.ts']);
      expect(result.modifiedFiles).toEqual(['src/edited.ts']);
    });

    it('merges across multiple previous entries', () => {
      tracker.trackFile('src/current.ts', 'modified');

      const previousEntries: CompactionEntryDetails[] = [
        {
          entryType: 'compaction',
          readFiles: ['src/a.ts'],
          modifiedFiles: [],
          tokenCount: 1,
          timestamp: '2025-01-01T00:00:00.000Z',
        },
        {
          entryType: 'compaction',
          readFiles: ['src/b.ts'],
          modifiedFiles: ['src/c.ts'],
          tokenCount: 2,
          timestamp: '2025-01-02T00:00:00.000Z',
        },
      ];

      const result = tracker.merge(previousEntries);

      expect(result.readFiles).toEqual(['src/a.ts', 'src/b.ts']);
      expect(result.modifiedFiles).toEqual(['src/c.ts', 'src/current.ts']);
    });

    it('modified takes priority: demotes reads from previous entries', () => {
      tracker.trackFile('src/prev-read.ts', 'modified');

      const previousEntries: CompactionEntryDetails[] = [
        {
          entryType: 'compaction',
          readFiles: ['src/prev-read.ts', 'src/other.ts'],
          modifiedFiles: [],
          tokenCount: 2,
          timestamp: '2025-01-01T00:00:00.000Z',
        },
      ];

      const result = tracker.merge(previousEntries);

      expect(result.readFiles).toEqual(['src/other.ts']);
      expect(result.modifiedFiles).toEqual(['src/prev-read.ts']);
    });

    it('deduplicates files across entries', () => {
      tracker.trackFile('src/shared.ts', 'read');

      const previousEntries: CompactionEntryDetails[] = [
        {
          entryType: 'compaction',
          readFiles: ['src/shared.ts'],
          modifiedFiles: [],
          tokenCount: 1,
          timestamp: '2025-01-01T00:00:00.000Z',
        },
      ];

      const result = tracker.merge(previousEntries);

      expect(result.readFiles).toEqual(['src/shared.ts']);
      expect(result.readFiles.length).toBe(1);
    });
  });

  // ==========================================================================
  // fromMessages (3 tests)
  // ==========================================================================
  describe('fromMessages', () => {
    it('extracts read files from toolCall blocks', () => {
      const messages: CompactionMessage[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              name: 'read',
              arguments: { path: 'src/index.ts' },
            },
          ],
        },
      ];

      const result = FileTracker.fromMessages(messages);

      expect(result.getFilesByType('read')).toEqual(['src/index.ts']);
      expect(result.getFilesByType('modified')).toEqual([]);
    });

    it('extracts modified files from write and edit tool calls', () => {
      const messages: CompactionMessage[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              name: 'write',
              arguments: { path: 'src/new.ts' },
            },
            {
              type: 'toolCall',
              name: 'edit',
              arguments: { path: 'src/config.ts' },
            },
          ],
        },
      ];

      const result = FileTracker.fromMessages(messages);

      expect(result.getFilesByType('modified')).toEqual([
        'src/config.ts',
        'src/new.ts',
      ]);
      expect(result.getFilesByType('read')).toEqual([]);
    });

    it('ignores non-assistant messages and non-toolCall blocks', () => {
      const messages: CompactionMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'toolCall',
              name: 'read',
              arguments: { path: 'ignored.ts' },
            },
          ],
        },
        {
          role: 'assistant',
          content: 'Just a text message, no tool calls.',
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Some reasoning...',
            },
            {
              type: 'toolCall',
              name: 'read',
              arguments: { path: 'src/valid.ts' },
            },
          ],
        },
      ];

      const result = FileTracker.fromMessages(messages);

      expect(result.getFilesByType('read')).toEqual(['src/valid.ts']);
      expect(result.getAllFiles()).toEqual(['src/valid.ts']);
    });
  });
});
