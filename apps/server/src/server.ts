import Fastify from 'fastify';
import { initDatabase } from './db/index.js';
import { runMigrations } from './db/migrations.js';
import { registerRoutes } from './routes/index.js';
import { streamRoutes } from './routes/stream.js';
import { sseHub } from './streams/sseHub.js';
import { configSchema, type ServerConfig } from './types/config.js';
import { getWorkerPool, closeWorkerPool, attachPoolEventListeners } from './tasks/runner.js';
import type Database from 'better-sqlite3';

export interface ServerBundle {
  server: Fastify.FastifyInstance;
  db: Database.Database;
}

export async function buildServer(config?: Partial<ServerConfig>): Promise<ServerBundle> {
  const validatedConfig = configSchema.parse(config ?? {});

  const server = Fastify({
    logger: {
      level: validatedConfig.logLevel,
    },
  });

  // Initialize database
  const db = initDatabase(validatedConfig.databasePath);

  // Decorate server with db for route access
  server.decorate('db', db);

  // Run migrations
  const migrated = runMigrations(db);
  if (migrated) {
    server.log.info('Database migrations applied');
  }

  // Register application routes
  await registerRoutes(server);

  // Register SSE stream routes (not under /api prefix)
  await streamRoutes(server);

  // Decorate sseHub
  server.decorate('sseHub', sseHub);

  // Initialize worker pool and decorate server
  const workerPool = getWorkerPool();
  server.decorate('workerPool', workerPool);
  attachPoolEventListeners(db);

  // Shutdown pool on server close
  server.addHook('onClose', async () => {
    await closeWorkerPool();
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await server.close();
    db.close();
    process.exit(0);
  });

  return { server, db };
}

// Auto-start when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const { server } = await buildServer();
  const address = await server.listen({ port: 3000, host: '0.0.0.0' });
  server.log.info(`Server listening on ${address}`);
}
