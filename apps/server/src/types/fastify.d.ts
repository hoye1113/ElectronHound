import type { SSEHub } from '../streams/sseHub.js';
import type Database from 'better-sqlite3';

declare module 'fastify' {
  interface FastifyInstance {
    sseHub: SSEHub;
    db: Database.Database;
  }
}
