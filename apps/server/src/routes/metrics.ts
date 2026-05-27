import type { FastifyInstance } from 'fastify';
import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

export const register = new Registry();

collectDefaultMetrics({ register });

export const httpRequestsTotal = new Counter({
  name: 'eata_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [register],
});

export const tasksTotal = new Counter({
  name: 'eata_tasks_total',
  help: 'Total tasks by status',
  labelNames: ['status'] as const,
  registers: [register],
});

export const taskDuration = new Histogram({
  name: 'eata_task_duration_seconds',
  help: 'Task execution duration in seconds',
  buckets: [5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

export const workersActive = new Gauge({
  name: 'eata_workers_active',
  help: 'Number of active workers',
  registers: [register],
});

export const workersQueued = new Gauge({
  name: 'eata_workers_queued',
  help: 'Number of queued tasks',
  registers: [register],
});

export const sseConnections = new Gauge({
  name: 'eata_sse_connections',
  help: 'Number of active SSE connections',
  registers: [register],
});

export async function metricsRoutes(server: FastifyInstance) {
  server.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });
}
