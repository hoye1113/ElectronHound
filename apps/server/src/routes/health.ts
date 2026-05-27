import type { FastifyInstance } from 'fastify';

export async function healthRoutes(server: FastifyInstance) {
  server.get('/health', async () => {
    const checks: Record<string, { status: string; message?: string; [key: string]: unknown }> = {};

    // Database check
    try {
      const db = server.db;
      if (db) {
        db.prepare('SELECT 1').get();
        checks.database = { status: 'ok' };
      }
    } catch (err) {
      checks.database = {
        status: 'error',
        message: err instanceof Error ? err.message : 'Database unavailable',
      };
    }

    // Worker pool check
    try {
      const pool = server.workerPool;
      if (pool) {
        const workers = pool.getAllWorkers();
        const running = workers.filter((w) => w.status === 'running' || w.status === 'starting').length;
        checks.workerPool = {
          status: 'ok',
          running,
          maxWorkers: 3,
        };
      }
    } catch {
      checks.workerPool = { status: 'error', message: 'Worker pool unavailable' };
    }

    const hasError = Object.values(checks).some((c) => c.status === 'error');

    return {
      status: hasError ? 'error' : 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
    };
  });
}
