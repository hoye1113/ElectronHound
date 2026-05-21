/**
 * EATA Compaction - File Tracker
 *
 * Tracks cumulative file operations across multiple compaction cycles.
 * Stores read and modified file paths, supporting merge with previous
 * compaction entries for persistent context.
 *
 * Key features:
 * - Track individual file operations (read or modified)
 * - Cumulative merge across multiple compaction entries
 * - Extract file operations directly from CompactionMessage arrays
 * - Deduplicated, sorted file lists
 * - Modified files take priority (removed from read list)
 */

import type { CompactionEntryDetails } from './types.js';
import type { CompactionMessage } from './cut-point.js';

/**
 * Tool call name categories for file extraction.
 */
const READ_TOOLS = new Set(['read']);
const MODIFY_TOOLS = new Set(['write', 'edit']);

/**
 * FileTracker class.
 *
 * Tracks file operations (read, modified) and supports cumulative
 * merging with previous compaction entries. Designed for use in
 * summary generation to persist file context across compaction cycles.
 *
 * Usage:
 * ```typescript
 * const tracker = new FileTracker();
 * tracker.trackFile('src/index.ts', 'read');
 * tracker.trackFile('src/utils.ts', 'modified');
 *
 * // Merge with previous entries for cumulative tracking
 * const details = tracker.merge(previousEntries);
 *
 * // Or extract directly from messages
 * const fromMsgs = FileTracker.fromMessages(messages);
 * ```
 */
export class FileTracker {
  private readonly readFiles: Set<string> = new Set();
  private readonly modifiedFiles: Set<string> = new Set();

  constructor() {
    /* empty — starts with no tracked files */
  }

  /**
   * Track a file operation.
   *
   * - 'read': adds to read set (unless already in modified set)
   * - 'modified': adds to modified set and removes from read set
   *
   * @param filePath - Absolute or relative path to the file
   * @param type - Whether the file was read or modified
   */
  trackFile(filePath: string, type: 'read' | 'modified'): void {
    if (type === 'modified') {
      this.modifiedFiles.add(filePath);
      this.readFiles.delete(filePath);
    } else {
      // Only track as read if not already modified
      if (!this.modifiedFiles.has(filePath)) {
        this.readFiles.add(filePath);
      }
    }
  }

  /**
   * Get files by type, sorted alphabetically.
   *
   * @param type - 'read' for read-only files, 'modified' for modified files
   * @returns Sorted array of file paths
   */
  getFilesByType(type: 'read' | 'modified'): string[] {
    const set = type === 'read' ? this.readFiles : this.modifiedFiles;
    return [...set].sort();
  }

  /**
   * Get all tracked files (read + modified), sorted and deduplicated.
   *
   * @returns Sorted array of all unique file paths
   */
  getAllFiles(): string[] {
    const all = new Set([...this.readFiles, ...this.modifiedFiles]);
    return [...all].sort();
  }

  /**
   * Merge current tracker with previous compaction entries.
   *
   * Accumulates all file operations from previous entries plus the
   * current tracker's files. Modified files take priority — any file
   * appearing in modifiedFiles across any entry is removed from readFiles.
   *
   * @param previousEntries - Previous compaction entry details to merge with
   * @returns New CompactionEntryDetails with cumulative file lists
   */
  merge(previousEntries: CompactionEntryDetails[]): CompactionEntryDetails {
    const readSet = new Set(this.readFiles);
    const modifiedSet = new Set(this.modifiedFiles);

    // Accumulate from all previous entries
    for (const entry of previousEntries) {
      for (const f of entry.readFiles) {
        readSet.add(f);
      }
      for (const f of entry.modifiedFiles) {
        modifiedSet.add(f);
      }
    }

    // Modified takes priority: remove from read set
    for (const f of modifiedSet) {
      readSet.delete(f);
    }

    const readFiles = [...readSet].sort();
    const modifiedFiles = [...modifiedSet].sort();
    const tokenCount = readFiles.length + modifiedFiles.length;

    return {
      entryType: 'compaction',
      readFiles,
      modifiedFiles,
      tokenCount,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create a FileTracker by extracting file operations from messages.
   *
   * Scans assistant messages for toolCall blocks (read, write, edit)
   * and extracts the file paths from their arguments.
   *
   * Tool calls recognized:
   * - 'read' → readFiles
   * - 'write', 'edit' → modifiedFiles
   *
   * @param messages - Array of CompactionMessage to extract from
   * @returns New FileTracker populated with extracted file operations
   */
  static fromMessages(messages: CompactionMessage[]): FileTracker {
    const tracker = new FileTracker();

    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      if (!Array.isArray(msg.content)) continue;

      for (const block of msg.content) {
        if (typeof block !== 'object' || block === null) continue;
        if (!('type' in block) || block.type !== 'toolCall') continue;
        if (!('arguments' in block) || !('name' in block)) continue;

        const args = block.arguments as Record<string, unknown> | undefined;
        if (!args) continue;

        const path = typeof args.path === 'string' ? args.path : undefined;
        if (!path) continue;

        const name = typeof block.name === 'string' ? block.name : '';
        if (READ_TOOLS.has(name)) {
          tracker.trackFile(path, 'read');
        } else if (MODIFY_TOOLS.has(name)) {
          tracker.trackFile(path, 'modified');
        }
      }
    }

    return tracker;
  }
}
