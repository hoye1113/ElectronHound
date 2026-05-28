/**
 * SQLite persistence layer for Session management.
 *
 * Stores sessions, entries, and compactions in a single SQLite database.
 * Uses synchronous better-sqlite3 for all operations.
 *
 * Database path: ~/.eata/sessions.db
 * Tables: sessions, entries, compactions
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import type {
  SessionEntry,
  CompactionEntry,
  BranchSummaryEntry,
  SessionWithEntries,
} from './types.js';

// ── Database location ────────────────────────────────────────────────────────

export const DEFAULT_SESSIONS_DB_PATH = join(homedir(), '.eata', 'sessions.db');

// ── Schema ───────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  task_prompt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,
  UNIQUE(id, session_id)
);

CREATE TABLE IF NOT EXISTS compactions (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  branch_summaries TEXT NOT NULL,
  compacted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_session_id ON entries(session_id);
`;

// ── Row shapes (raw DB rows) ─────────────────────────────────────────────────

interface SessionRow {
  id: string;
  agent_id: string;
  task_prompt: string;
  created_at: string;
}

interface EntryRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: string;
  type: string;
}

interface CompactionRow {
  session_id: string;
  summary: string;
  branch_summaries: string; // JSON string
  compacted_at: string;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise (or open) the sessions SQLite database.
 * Runs schema migration automatically.
 */
export function initSessionDb(dbPath?: string): Database.Database {
  const path = dbPath ?? DEFAULT_SESSIONS_DB_PATH;
  const dir = dirname(path);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(path);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  db.exec(SCHEMA_SQL);

  return db;
}

// ── Prepared-statements cache (bound to a single Database) ───────────────────

export function createSessionQueries(db: Database.Database): SessionQueries {
  const insertSession = db.prepare(
    'INSERT INTO sessions (id, agent_id, task_prompt, created_at) VALUES (?, ?, ?, ?)'
  );
  const selectSession = db.prepare(
    'SELECT * FROM sessions WHERE id = ?'
  );
  const insertEntry = db.prepare(
    'INSERT INTO entries (id, session_id, role, content, timestamp, type) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const selectEntriesBySession = db.prepare(
    'SELECT * FROM entries WHERE session_id = ? ORDER BY timestamp ASC'
  );
  const upsertCompaction = db.prepare(
    `INSERT INTO compactions (session_id, summary, branch_summaries, compacted_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       summary = excluded.summary,
       branch_summaries = excluded.branch_summaries,
       compacted_at = excluded.compacted_at`
  );
  const selectCompaction = db.prepare(
    'SELECT * FROM compactions WHERE session_id = ?'
  );
  const deleteSession = db.prepare(
    'DELETE FROM sessions WHERE id = ?'
  );

  return {
    insertSession,
    selectSession,
    insertEntry,
    selectEntriesBySession,
    upsertCompaction,
    selectCompaction,
    deleteSession,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rowToEntry(row: EntryRow): SessionEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as SessionEntry['role'],
    content: row.content,
    timestamp: row.timestamp,
    type: row.type as SessionEntry['type'],
  };
}

function rowToCompaction(row: CompactionRow): CompactionEntry {
  let branchSummaries: BranchSummaryEntry[] = [];
  try {
    branchSummaries = JSON.parse(row.branch_summaries) as BranchSummaryEntry[];
  } catch (err) {
    process.stderr.write(`[persistence] Warning: ${err instanceof Error ? err.message : String(err)}\n`);
    branchSummaries = [];
  }
  return {
    summary: row.summary,
    branchSummaries,
    compactedAt: row.compacted_at,
  };
}

// ── High-level CRUD helpers ──────────────────────────────────────────────────

export interface SessionQueries {
  insertSession: Database.Statement;
  selectSession: Database.Statement;
  insertEntry: Database.Statement;
  selectEntriesBySession: Database.Statement;
  upsertCompaction: Database.Statement;
  selectCompaction: Database.Statement;
  deleteSession: Database.Statement;
}

/** Generate a new UUID v4 string */
export function generateId(): string {
  return randomUUID();
}

/** Generate an ISO 8601 timestamp */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Create a new session row and return its ID.
 */
export function createSession(
  q: SessionQueries,
  agentId: string,
  taskPrompt: string,
): string {
  const id = generateId();
  q.insertSession.run(id, agentId, taskPrompt, nowISO());
  return id;
}

/**
 * Retrieve a full session with all entries and optional compaction.
 * Returns null if the session does not exist.
 */
export function getSession(
  q: SessionQueries,
  sessionId: string,
): SessionWithEntries | null {
  const sessionRow = q.selectSession.get(sessionId) as SessionRow | undefined;
  if (!sessionRow) return null;

  const entryRows = q.selectEntriesBySession.all(sessionId) as EntryRow[];
  const compactionRow = q.selectCompaction.get(sessionId) as CompactionRow | undefined;

  return {
    id: sessionRow.id,
    agentId: sessionRow.agent_id,
    taskPrompt: sessionRow.task_prompt,
    createdAt: sessionRow.created_at,
    entries: entryRows.map(rowToEntry),
    compaction: compactionRow ? rowToCompaction(compactionRow) : undefined,
  };
}

/**
 * Append an entry to an existing session.
 * Returns the new entry ID.
 */
export function addEntry(
  q: SessionQueries,
  sessionId: string,
  entry: Omit<SessionEntry, 'id' | 'sessionId' | 'timestamp'> & {
    id?: string;
    timestamp?: string;
  },
): string {
  const id = entry.id ?? generateId();
  const timestamp = entry.timestamp ?? nowISO();
  q.insertEntry.run(id, sessionId, entry.role, entry.content, timestamp, entry.type);
  return id;
}

/**
 * Compact (summarize) a session.
 * Replaces any existing compaction for this session.
 */
export function compactSession(
  q: SessionQueries,
  sessionId: string,
  summary: string,
  branchSummaries: BranchSummaryEntry[],
): void {
  q.upsertCompaction.run(
    sessionId,
    summary,
    JSON.stringify(branchSummaries),
    nowISO(),
  );
}

/**
 * Delete a session and all associated entries / compactions (cascading).
 */
export function deleteSession(
  q: SessionQueries,
  sessionId: string,
): void {
  q.deleteSession.run(sessionId);
}
