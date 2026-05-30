import type Database from 'better-sqlite3';
import { randomUUID, scryptSync, randomBytes } from 'node:crypto';

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

CREATE TABLE IF NOT EXISTS agent_checkpoints (
  session_id TEXT PRIMARY KEY,
  checkpoint TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS few_shot_examples (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  steps TEXT NOT NULL,
  expected_result TEXT NOT NULL,
  metadata TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_few_shot_examples_goal ON few_shot_examples(goal);
CREATE INDEX IF NOT EXISTS idx_steps_task_id ON steps(task_id);
CREATE INDEX IF NOT EXISTS idx_logs_task_id ON logs(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_report_templates_is_default ON report_templates(is_default);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_built_in ON templates(built_in);
CREATE INDEX IF NOT EXISTS idx_tasks_batch_id ON tasks(batch_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_steps_task_step ON steps(task_id, step_index);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled);

CREATE TABLE IF NOT EXISTS schedule_runs (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  task_id TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  summary TEXT,
  error TEXT,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_runs_schedule ON schedule_runs(schedule_id);

CREATE TABLE IF NOT EXISTS notification_config (
  id TEXT PRIMARY KEY,
  webhook_urls TEXT NOT NULL DEFAULT '[]',
  sse_enabled INTEGER NOT NULL DEFAULT 1,
  event_types TEXT NOT NULL DEFAULT '["task.completed","task.failed","batch.completed"]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('webhook', 'sse')),
  target TEXT,
  status TEXT NOT NULL CHECK(status IN ('sent', 'failed', 'pending')),
  error TEXT,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notification_log_event ON notification_log(event_type);
CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at);

CREATE TABLE IF NOT EXISTS token_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_token_usage_task_id ON token_usage(task_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON token_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_provider ON token_usage(provider);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'user')) DEFAULT 'user',
  api_token TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_api_token ON users(api_token);
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

  // Add user_id column to tasks table if missing
  const hasUserId = columns.some((c) => c.name === 'user_id');
  if (!hasUserId) {
    db.exec('ALTER TABLE tasks ADD COLUMN user_id TEXT REFERENCES users(id)');
  }

  // Seed default admin user if users table is empty
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
  if (userCount.cnt === 0) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync('admin', salt, 64).toString('hex');
    const passwordHash = `${salt}:${hash}`;
    const token = randomBytes(32).toString('hex');
    db.prepare(
      'INSERT INTO users (id, username, password_hash, role, api_token) VALUES (?, ?, ?, ?, ?)'
    ).run(randomUUID(), 'admin', passwordHash, 'admin', token);
  }

  return wasNeeded;
}
