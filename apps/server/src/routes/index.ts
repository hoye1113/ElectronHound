import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { taskRoutes } from './tasks.js';
import { reportRoutes } from './reports.js';
import { feedbackRoutes } from './feedback.js';

export async function registerRoutes(server: FastifyInstance) {
  await server.register(healthRoutes);
  await server.register(taskRoutes, { prefix: '/api' });
  await server.register(reportRoutes, { prefix: '/api' });
  await server.register(feedbackRoutes, { prefix: '/api' });
}
