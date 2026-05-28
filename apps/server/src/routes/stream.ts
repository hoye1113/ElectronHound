import type { FastifyInstance } from 'fastify';
import { UuidParam } from '../utils/validation.js';
import { sseHub } from '../streams/sseHub.js';

export async function streamRoutes(server: FastifyInstance) {
  server.get('/api/stream/tasks/:id', async (request, reply) => {
    const parsed = UuidParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid task ID', details: parsed.error.flatten() });
    }
    const { id } = parsed.data;

    // Register client with SSE hub (sets headers internally)
    const added = sseHub.addClient(id, reply);
    if (!added) {
      return reply.code(429).send({ error: 'Too many SSE connections' });
    }

    // Send initial connection event
    sseHub.broadcast(id, {
      event: 'status',
      data: { type: 'connected', taskId: id },
    });

    // Keep connection open — do NOT call reply.send()
    // Connection is managed by SSE hub; cleanup happens on 'close' event
    return reply;
  });
}
