import type { FastifyReply } from 'fastify';

export type SSEEventType = 'step' | 'log' | 'status' | 'complete' | 'error';

export interface SSEEvent {
  event: SSEEventType;
  data: Record<string, unknown>;
}

export interface SSEHubConfig {
  maxClientsPerTask?: number;
  maxTotalClients?: number;
}

export class SSEHub {
  private clients: Map<string, Set<FastifyReply>>;
  private maxClientsPerTask: number;
  private maxTotalClients: number;

  constructor(config?: SSEHubConfig) {
    this.clients = new Map();
    this.maxClientsPerTask = config?.maxClientsPerTask ?? 10;
    this.maxTotalClients = config?.maxTotalClients ?? 100;
  }

  addClient(taskId: string, reply: FastifyReply): boolean {
    // Check total client limit
    if (this.getTotalClientCount() >= this.maxTotalClients) {
      return false;
    }

    // Check per-task client limit
    const taskClients = this.clients.get(taskId);
    if (taskClients && taskClients.size >= this.maxClientsPerTask) {
      return false;
    }

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

    return true;
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

    for (const reply of taskClients) {
      reply.raw.write(message);
    }
  }

  broadcastAll(event: SSEEvent): void {
    const message = this.formatSSE(event);

    for (const [, taskClients] of this.clients) {
      for (const reply of taskClients) {
        reply.raw.write(message);
      }
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
