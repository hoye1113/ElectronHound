import { bench, describe } from 'vitest';
import { buildServer } from '../apps/server/src/server.js';

describe('Server startup', () => {
  bench('buildServer cold start', async () => {
    const { server, db } = await buildServer({ databasePath: ':memory:' });
    await server.close();
    db.close();
  });

  bench('single server.inject call (GET /health)', async () => {
    const { server, db } = await buildServer({ databasePath: ':memory:' });
    await server.inject({ method: 'GET', url: '/health' });
    await server.close();
    db.close();
  });
});
