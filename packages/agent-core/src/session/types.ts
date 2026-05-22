/**
 * Session types for Pi migration
 */

export interface BaseSessionEntry {
  id: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface MessageEntry extends BaseSessionEntry {
  type: 'user' | 'assistant' | 'tool' | 'summary';
  content: string;
}

export interface SessionCompactionEntry extends BaseSessionEntry {
  type: 'compaction';
  summary: string;
  readFiles: string[];
  modifiedFiles: string[];
  tokenCount: number;
}

export interface SessionBranchSummaryEntry extends BaseSessionEntry {
  type: 'branch_summary';
  branchName: string;
  summary: string;
  readFiles: string[];
  modifiedFiles: string[];
  tokenCount: number;
}

export type SessionEntry = MessageEntry | SessionCompactionEntry | SessionBranchSummaryEntry;
