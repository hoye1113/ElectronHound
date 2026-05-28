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
    } catch (err: unknown) {
      checks.database = {
        status: 'error',
        message: err instanceof Error ? err.message : 'Database unavailable',
      };
    }

    // Worker pool check
    try {
      const pool = server.workerPool;
      if (pool) {
        checks.workerPool = {
          status: 'ok',
          running: pool.getRunningCount(),
          queued: pool.getQueueLength(),
          maxWorkers: 3,
        };
      }
    } catch (err: unknown) {
      process.stderr.write(`[health] worker pool check failed: ${err instanceof Error ? err.message : String(err)}\n`);
      checks.workerPool = { status: 'error', message: 'Worker pool unavailable' };
    }

    const hasError = Object.values(checks).some((c) => c.status === 'error');
    const allOk = Object.values(checks).every((c) => c.status === 'ok');

    return {
      status: allOk ? 'ok' : hasError ? 'error' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
    };
  });
}
