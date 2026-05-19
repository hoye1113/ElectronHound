import type { FastifyInstance } from 'fastify';
import { sseHub } from '../streams/sseHub.js';

export async function streamRoutes(server: FastifyInstance) {
  server.get('/api/stream/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Register client with SSE hub (sets headers internally)
    sseHub.addClient(id, reply);

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
