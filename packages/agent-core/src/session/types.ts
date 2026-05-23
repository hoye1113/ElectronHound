/**
 * Session types for Pi migration — SQLite-persisted session management.
 *
 * SessionEntry   — individual message / tool-call entry within a session.
 * CompactionEntry — summary produced when a session is compacted.
 * SessionWithEntries — full session aggregate returned by SessionManager.
 */

// ── Entry types ──────────────────────────────────────────────────────────────

export interface SessionEntry {
  /** Unique entry ID (UUID v4) */
  id: string;
  /** Parent session ID */
  sessionId: string;
  /** Role of the entity that produced this entry */
  role: 'user' | 'assistant' | 'system';
  /** Text content of the entry */
  content: string;
  /** ISO 8601 timestamp of when the entry was created */
  timestamp: string;
  /** Semantic type — compaction entries are summaries rather than raw messages */
  type: 'user' | 'assistant' | 'system' | 'compaction';
}

// ── Compaction types ─────────────────────────────────────────────────────────

export interface BranchSummaryEntry {
  /** Name of the parallel branch that was compacted */
  branchName: string;
  /** Condensed summary of what the branch accomplished */
  summary: string;
}

export interface CompactionEntry {
  /** High-level summary of the session up to the compaction point */
  summary: string;
  /** Per-branch summaries captured during compaction */
  branchSummaries: BranchSummaryEntry[];
  /** ISO 8601 timestamp of when the compaction occurred */
  compactedAt: string;
}

// ── Aggregate types ──────────────────────────────────────────────────────────

export interface SessionWithEntries {
  /** Session ID (UUID v4) */
  id: string;
  /** Agent identifier that owns this session */
  agentId: string;
  /** Original task prompt that started the session */
  taskPrompt: string;
  /** ISO 8601 timestamp of session creation */
  createdAt: string;
  /** Ordered list of entries (messages, tool calls, compactions) */
  entries: SessionEntry[];
  /** Latest compaction, if the session has been compacted at least once */
  compaction?: CompactionEntry;
}
