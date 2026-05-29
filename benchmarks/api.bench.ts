import { bench, describe, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../apps/server/src/server.js';

let server: Awaited<ReturnType<typeof buildServer>>['server'];
let db: Awaited<ReturnType<typeof buildServer>>['db'];

beforeAll(async () => {
  const built = await buildServer({ databasePath: ':memory:' });
  server = built.server;
  db = built.db;
  const insertTask = db.prepare(
    'INSERT INTO tasks (id, goal, target_app_path, llm_model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
  );
  for (let i = 0; i < 100; i++) {
    insertTask.run(
      `bench-task-${i}`,
      `Task ${i} goal`,
      '/test/app',
      'test-model',
      i % 3 === 0 ? 'completed' : 'pending',
    );
  }
});

afterAll(async () => {
  await server.close();
});

describe('API endpoints', () => {
  bench('GET /api/tasks', async () => {
    await server.inject({ method: 'GET', url: '/api/tasks' });
  });

  bench('GET /api/tasks?status=pending', async () => {
    await server.inject({ method: 'GET', url: '/api/tasks?status=pending' });
  });

  bench('GET /api/tasks/:id', async () => {
    await server.inject({ method: 'GET', url: '/api/tasks/bench-task-0' });
  });

  bench('POST /api/tasks', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        goal: 'benchmark test goal',
        targetAppPath: '/test',
        llmModel: 'test-model',
      },
    });
  });

  bench('GET /api/tasks/batches', async () => {
    await server.inject({ method: 'GET', url: '/api/tasks/batches' });
  });

  bench('GET /health', async () => {
    await server.inject({ method: 'GET', url: '/health' });
  });

  bench('GET /metrics', async () => {
    await server.inject({ method: 'GET', url: '/metrics' });
  });
});
