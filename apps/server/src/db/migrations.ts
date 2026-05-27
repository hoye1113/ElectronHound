import type Database from 'better-sqlite3';

const schemaSql = `
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
  total_tasks INTEGER NOT NULL,
  completed_tasks INTEGER DEFAULT 0,
  failed_tasks INTEGER DEFAULT 0,
  priority TEXT DEFAULT 'medium',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  provider_id TEXT,
  batch_id TEXT REFERENCES batches(id)
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

CREATE TABLE IF NOT EXISTS report_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sections TEXT NOT NULL,
  styling TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK(category IN ('login', 'crud', 'form', 'navigation', 'file', 'settings', 'custom')),
  goal TEXT NOT NULL,
  config TEXT,
  variables TEXT,
  built_in INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_steps_task_id ON steps(task_id);
CREATE INDEX IF NOT EXISTS idx_logs_task_id ON logs(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_report_templates_is_default ON report_templates(is_default);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_built_in ON templates(built_in);
CREATE INDEX IF NOT EXISTS idx_tasks_batch_id ON tasks(batch_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_steps_task_step ON steps(task_id, step_index);
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

  // Incremental migrations for existing tables
  // Add provider_id column to tasks table if missing
  const columns = db
    .prepare("PRAGMA table_info(tasks)")
    .all() as Array<{ name: string }>;
  const hasProviderId = columns.some((c) => c.name === 'provider_id');
  if (!hasProviderId) {
    db.exec('ALTER TABLE tasks ADD COLUMN provider_id TEXT');
  }

  // Add batch_id column to tasks table if missing
  const hasBatchId = columns.some((c) => c.name === 'batch_id');
  if (!hasBatchId) {
    db.exec('ALTER TABLE tasks ADD COLUMN batch_id TEXT REFERENCES batches(id)');
  }

  return wasNeeded;
}
