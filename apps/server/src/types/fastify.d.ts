import type { SSEHub } from '../streams/sseHub.js';
import type { WorkerPoolManager } from '../services/workerPool/manager.js';
import type Database from 'better-sqlite3';

declare module 'fastify' {
  interface FastifyInstance {
    sseHub: SSEHub;
    db: Database.Database;
    workerPool: WorkerPoolManager;
    dataDir: string;
  }
}
