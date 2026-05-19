import type { FastifyInstance } from 'fastify';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export async function reportRoutes(server: FastifyInstance) {
  server.get('/tasks/:id/report', async (request, reply) => {
    const { id } = request.params as { id: string };
    const reportDir = join('data', 'reports', id);

    if (!existsSync(reportDir)) {
      reply.code(404);
      return { error: 'Report not found' };
    }

    const manifestPath = join(reportDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      reply.code(404);
      return { error: 'Manifest not found' };
    }

    const content = readFileSync(manifestPath, 'utf-8');
    return JSON.parse(content);
  });
}
