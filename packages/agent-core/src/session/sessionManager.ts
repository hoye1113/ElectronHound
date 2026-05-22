import type { SessionEntry } from './types.js';

export class SessionManager {
  private entries: SessionEntry[] = [];

  addEntry(entry: SessionEntry): void {
    this.entries.push(entry);
  }

  getEntries(): SessionEntry[] {
    return [...this.entries];
  }

  serializeConversation(): string {
    return this.entries
      .map((e) => {
        if (e.type === 'compaction' || e.type === 'branch_summary') {
          return `[${e.type}] ${e.summary}`;
        }
        return `[${e.type}] ${e.content}`;
      })
      .join('\n');
  }

  extractFileOperations(): { read: string[]; modified: string[] } {
    const read = new Set<string>();
    const modified = new Set<string>();

    for (const entry of this.entries) {
      if (entry.type === 'compaction' || entry.type === 'branch_summary') {
        entry.readFiles?.forEach((f) => read.add(f));
        entry.modifiedFiles?.forEach((f) => modified.add(f));
      }
    }

    return { read: Array.from(read), modified: Array.from(modified) };
  }

  clear(): void {
    this.entries = [];
  }
}
