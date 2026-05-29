import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { metricsRoutes } from './metrics.js';
import { taskRoutes } from './tasks.js';
import { batchRoutes } from './batches.js';
import { reportRoutes } from './reports.js';
import { exportRoutes } from './exports.js';
import { feedbackRoutes } from './feedback.js';
import { providersRoutes } from './providers.js';
import { templateRoutes } from './templates.js';
import { reportTemplateRoutes } from './report-templates.js';
import { fewShotRoutes } from './few-shot.js';

export async function registerRoutes(server: FastifyInstance) {
  await server.register(healthRoutes);
  await server.register(metricsRoutes);
  await server.register(taskRoutes, { prefix: '/api' });
  await server.register(batchRoutes, { prefix: '/api' });
  await server.register(reportRoutes, { prefix: '/api' });
  await server.register(exportRoutes, { prefix: '/api' });
  await server.register(feedbackRoutes, { prefix: '/api' });
  await server.register(providersRoutes, { prefix: '/api' });
  await server.register(templateRoutes, { prefix: '/api' });
  await server.register(reportTemplateRoutes, { prefix: '/api' });
  await server.register(fewShotRoutes, { prefix: '/api' });
}
