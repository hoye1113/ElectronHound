/**
 * SessionManager — SQLite-backed session lifecycle manager.
 *
 * Usage:
 *   const sm = new SessionManager();                          // defaults to ~/.eata/sessions.db
 *   const sm = new SessionManager('/custom/path/sessions.db'); // custom path
 *   const sm = new SessionManager(':memory:');                 // in-memory (testing)
 *
 *   const sessionId = sm.createSession('agent-1', 'Test login flow');
 *   const entryId  = sm.addEntry(sessionId, { role: 'user', content: 'Hello', type: 'user' });
 *   const session  = sm.getSession(sessionId);
 *   sm.compactSession(sessionId, 'Summary text', [{ branchName: 'a', summary: 'b' }]);
 */

import Database from 'better-sqlite3';
import type {
  SessionEntry,
  BranchSummaryEntry,
  SessionWithEntries,
} from './types.js';
import {
  initSessionDb,
  createSessionQueries,
  createSession,
  getSession,
  addEntry,
  compactSession,
  deleteSession,
  DEFAULT_SESSIONS_DB_PATH,
} from './persistence.js';

import type { SessionQueries } from './persistence.js';

export class SessionManager {
  private db: Database.Database;
  private q: SessionQueries;

  /**
   * @param dbPath  Path to the SQLite database file.
   *                Defaults to `~/.eata/sessions.db`.
   *                Pass `':memory:'` for an in-memory database (testing).
   */
  constructor(dbPath?: string) {
    this.db = initSessionDb(dbPath ?? DEFAULT_SESSIONS_DB_PATH);
    this.q = createSessionQueries(this.db);
  }

  // ── Core CRUD ────────────────────────────────────────────────────────────

  /**
   * Create a new session.
   * @returns The new session ID (UUID v4).
   */
  createSession(agentId: string, taskPrompt: string): string {
    return createSession(this.q, agentId, taskPrompt);
  }

  /**
   * Retrieve a session with all its entries and optional compaction.
   * @returns The full session aggregate, or null if not found.
   */
  getSession(sessionId: string): SessionWithEntries | null {
    return getSession(this.q, sessionId);
  }

  /**
   * Append an entry to an existing session.
   * @returns The new entry ID (UUID v4).
   */
  addEntry(
    sessionId: string,
    entry: {
      role: SessionEntry['role'];
      content: string;
      type: SessionEntry['type'];
      id?: string;
      timestamp?: string;
    },
  ): string {
    return addEntry(this.q, sessionId, entry);
  }

  /**
   * Compact (summarize) a session.
   * Replaces any previous compaction for the same session.
   */
  compactSession(
    sessionId: string,
    summary: string,
    branchSummaries: BranchSummaryEntry[],
  ): void {
    compactSession(this.q, sessionId, summary, branchSummaries);
  }

  /**
   * Delete a session and all associated entries / compactions.
   */
  deleteSession(sessionId: string): void {
    deleteSession(this.q, sessionId);
  }

  // ── Utility ──────────────────────────────────────────────────────────────

  /** Close the underlying database connection. */
  close(): void {
    this.db.close();
  }
}
