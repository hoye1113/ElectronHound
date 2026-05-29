import { bench, describe, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../apps/server/src/db/migrations.js';

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  runMigrations(db);

  // Seed 1000 tasks with varied statuses and batch IDs
  const insertTask = db.prepare(
    `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, step_count, created_at, updated_at, batch_id)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?), ?)`,
  );

  const statuses = ['queued', 'running', 'completed', 'failed', 'cancelled'];
  const batchIds = ['batch-0', 'batch-1', 'batch-2', 'batch-3', 'batch-4', null];

  const insertMany = db.transaction(() => {
    for (let i = 0; i < 1000; i++) {
      const status = statuses[i % statuses.length];
      const batchId = batchIds[i % batchIds.length];
      const offset = `-${i} minutes`;
      insertTask.run(
        `task-${i}`,
        `Goal for task ${i}`,
        '/test/app',
        'test-model',
        status,
        Math.floor(Math.random() * 20),
        offset,
        offset,
        batchId,
      );
    }
  });
  insertMany();

  // Seed 1000 steps across tasks (1 step per task)
  const insertStep = db.prepare(
    `INSERT INTO steps (id, task_id, step_index, phase, status, observation, action, result, reasoning, timestamp, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
  );

  const insertSteps = db.transaction(() => {
    for (let i = 0; i < 1000; i++) {
      insertStep.run(
        `step-${i}`,
        `task-${i}`,
        0,
        'verify',
        i % 3 === 0 ? 'success' : 'failed',
        JSON.stringify({ summary: `Observation ${i}`, details: `Details for step ${i}`, timestamp: new Date().toISOString() }),
        JSON.stringify({ name: 'click', args: { selector: '#btn' } }),
        JSON.stringify({ success: i % 3 === 0, result: `Result ${i}` }),
        `Reasoning for step ${i}`,
        100 + (i % 500),
      );
    }
  });
  insertSteps();
});

afterAll(() => {
  db.close();
});

describe('Database queries', () => {
  bench('SELECT tasks by status (pending)', () => {
    db.prepare("SELECT * FROM tasks WHERE status = 'pending'").all();
  });

  bench('SELECT tasks by status (completed)', () => {
    db.prepare("SELECT * FROM tasks WHERE status = 'completed'").all();
  });

  bench('SELECT tasks by batch_id', () => {
    db.prepare("SELECT * FROM tasks WHERE batch_id = 'batch-1'").all();
  });

  bench('JOIN tasks with steps', () => {
    db.prepare(
      'SELECT t.id, t.goal, t.status, s.step_index, s.phase, s.status as step_status FROM tasks t LEFT JOIN steps s ON t.id = s.task_id LIMIT 100',
    ).all();
  });

  bench('GROUP BY status for batch progress', () => {
    db.prepare(
      "SELECT status, COUNT(*) as count FROM tasks WHERE batch_id = 'batch-0' GROUP BY status",
    ).all();
  });

  bench('INSERT single task', () => {
    const id = `bench-insert-${Date.now()}-${Math.random()}`;
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', datetime('now'), datetime('now'))`,
    ).run(id, 'Benchmark insert goal', '/test', 'test-model');
  });

  bench('INSERT single step', () => {
    const id = `bench-step-${Date.now()}-${Math.random()}`;
    db.prepare(
      `INSERT INTO steps (id, task_id, step_index, phase, status, timestamp, duration)
       VALUES (?, ?, 0, 'verify', 'success', datetime('now'), 100)`,
    ).run(id, 'task-0');
  });

  bench('COUNT tasks with pagination', () => {
    db.prepare('SELECT COUNT(*) as total FROM tasks').get();
  });
});
