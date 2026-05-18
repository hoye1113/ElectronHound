import type Database from 'better-sqlite3';

const schemaSql = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  target_app_path TEXT NOT NULL,
  llm_model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  max_steps INTEGER DEFAULT 50,
  context_injection TEXT,
  step_count INTEGER DEFAULT 0,
  result_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  step_index INTEGER NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  observation TEXT,
  action TEXT,
  result TEXT,
  reasoning TEXT,
  screenshot_path TEXT,
  accessibility_snapshot_path TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  duration INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT REFERENCES tasks(id),
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  metadata TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_steps_task_id ON steps(task_id);
CREATE INDEX IF NOT EXISTS idx_logs_task_id ON logs(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
`;

/**
 * Run schema migrations on the given database connection.
 * Returns true if migration was needed (tables didn't exist before).
 */
export function runMigrations(db: Database.Database): boolean {
  // Check if tables already exist
  const existingTables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('tasks', 'steps', 'logs')"
    )
    .all() as Array<{ name: string }>;

  const wasNeeded = existingTables.length === 0;

  // Execute schema SQL (IF NOT EXISTS makes this safe to re-run)
  db.exec(schemaSql);

  return wasNeeded;
}
