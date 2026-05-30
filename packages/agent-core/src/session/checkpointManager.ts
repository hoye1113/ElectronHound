/**
 * CheckpointManager — Save and restore agent loop checkpoints.
 *
 * Uses better-sqlite3 to persist checkpoints for agent session resumption.
 * Stores checkpoints in an `agent_checkpoints` table keyed by session ID.
 *
 * Usage:
 *   const cm = new CheckpointManager(':memory:');           // in-memory (testing)
 *   const cm = new CheckpointManager('/path/to/db.sqlite'); // file-based
 *
 *   cm.save(checkpoint);
 *   const cp = cm.get(sessionId);
 *   cm.delete(sessionId);
 *   const all = cm.list();
 */

import Database from 'better-sqlite3';
import type { SessionEntry } from './types.js';
import type { Observation, Plan, ExecutionResult } from '../runtime/types.js';

/** Shape of an agent checkpoint for resumption. */
export interface AgentCheckpoint {
  /** Session ID (UUID v4) — primary key. */
  sessionId: string;
  /** The step number the agent loop was at when checkpointed. */
  currentStep: number;
  /** Maximum steps allowed for the run. */
  maxSteps: number;
  /** The original task prompt / goal. */
  taskPrompt: string;
  /** Serialized agent loop config (maxSteps, stuckThreshold, etc.). */
  config: Record<string, unknown>;
  /** Last observation summary (if any). */
  lastObservation: Observation | null;
  /** Last plan (if any). */
  lastPlan: Plan | null;
  /** Last execution result (if any). */
  lastExecutionResult: ExecutionResult | null;
  /** Session entries accumulated so far. */
  sessionEntries: SessionEntry[];
  /** ISO 8601 timestamp of when the checkpoint was created/updated. */
  timestamp: string;
}

const CHECKPOINT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agent_checkpoints (
  session_id TEXT PRIMARY KEY,
  checkpoint TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export class CheckpointManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(CHECKPOINT_SCHEMA_SQL);
  }

  /**
   * Save (upsert) a checkpoint.
   * If a checkpoint with the same sessionId exists, it is overwritten.
   */
  save(checkpoint: AgentCheckpoint): void {
    const stmt = this.db.prepare(`
      INSERT INTO agent_checkpoints (session_id, checkpoint, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(session_id) DO UPDATE SET
        checkpoint = excluded.checkpoint,
        updated_at = excluded.updated_at
    `);
    stmt.run(checkpoint.sessionId, JSON.stringify(checkpoint));
  }

  /**
   * Retrieve a checkpoint by session ID.
   * Returns null if not found.
   */
  get(sessionId: string): AgentCheckpoint | null {
    const stmt = this.db.prepare('SELECT checkpoint FROM agent_checkpoints WHERE session_id = ?');
    const row = stmt.get(sessionId) as { checkpoint: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.checkpoint) as AgentCheckpoint;
  }

  /**
   * Delete a checkpoint by session ID.
   * Returns true if a row was deleted, false if not found.
   */
  delete(sessionId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM agent_checkpoints WHERE session_id = ?');
    const result = stmt.run(sessionId);
    return result.changes > 0;
  }

  /**
   * List all stored checkpoints.
   */
  list(): AgentCheckpoint[] {
    const stmt = this.db.prepare('SELECT checkpoint FROM agent_checkpoints ORDER BY updated_at DESC');
    const rows = stmt.all() as Array<{ checkpoint: string }>;
    return rows.map((row) => JSON.parse(row.checkpoint) as AgentCheckpoint);
  }

  /**
   * Close the underlying database connection.
   */
  close(): void {
    this.db.close();
  }
}
