import type { FastifyReply } from 'fastify';

export type SSEEventType = 'step' | 'log' | 'status' | 'complete' | 'error';

export interface SSEEvent {
  event: SSEEventType;
  data: Record<string, unknown>;
}

export class SSEHub {
  private clients: Map<string, Set<FastifyReply>>;

  constructor() {
    this.clients = new Map();
  }

  addClient(taskId: string, reply: FastifyReply): void {
    // Set SSE headers
    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');

    // Flush headers immediately
    reply.raw.flushHeaders();

    if (!this.clients.has(taskId)) {
      this.clients.set(taskId, new Set());
    }
    this.clients.get(taskId)!.add(reply);

    // Handle client disconnect
    reply.raw.on('close', () => {
      this.removeClient(taskId, reply);
    });
  }

  removeClient(taskId: string, reply: FastifyReply): void {
    const taskClients = this.clients.get(taskId);
    if (taskClients) {
      taskClients.delete(reply);
      if (taskClients.size === 0) {
        this.clients.delete(taskId);
      }
    }
  }

  broadcast(taskId: string, event: SSEEvent): void {
    const taskClients = this.clients.get(taskId);
    if (!taskClients) return;

    const message = this.formatSSE(event);
    const deadClients: FastifyReply[] = [];

    for (const reply of taskClients) {
      const written = reply.raw.write(message);
      if (!written) {
        deadClients.push(reply);
      }
    }

    // Clean up dead connections
    for (const reply of deadClients) {
      this.removeClient(taskId, reply);
    }
  }

  broadcastAll(event: SSEEvent): void {
    const message = this.formatSSE(event);
    const deadClients: Array<{ taskId: string; reply: FastifyReply }> = [];

    for (const [taskId, taskClients] of this.clients) {
      for (const reply of taskClients) {
        const written = reply.raw.write(message);
        if (!written) {
          deadClients.push({ taskId, reply });
        }
      }
    }

    for (const { taskId, reply } of deadClients) {
      this.removeClient(taskId, reply);
    }
  }

  getClientCount(taskId: string): number {
    return this.clients.get(taskId)?.size ?? 0;
  }

  getTotalClientCount(): number {
    let total = 0;
    for (const clients of this.clients.values()) {
      total += clients.size;
    }
    return total;
  }

  private formatSSE(event: SSEEvent): string {
    return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
  }
}

export const sseHub = new SSEHub();
