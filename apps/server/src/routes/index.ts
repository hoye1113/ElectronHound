import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { metricsRoutes } from './metrics.js';
import { taskRoutes } from './tasks.js';
import { reportRoutes } from './reports.js';
import { feedbackRoutes } from './feedback.js';
import { providersRoutes } from './providers.js';

export async function registerRoutes(server: FastifyInstance) {
  await server.register(healthRoutes);
  await server.register(metricsRoutes);
  await server.register(taskRoutes, { prefix: '/api' });
  await server.register(reportRoutes, { prefix: '/api' });
  await server.register(feedbackRoutes, { prefix: '/api' });
  await server.register(providersRoutes, { prefix: '/api' });
}
