import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { initDatabase } from './db/index.js';
import { runMigrations } from './db/migrations.js';
import { registerRoutes } from './routes/index.js';
import { streamRoutes } from './routes/stream.js';
import { sseHub } from './streams/sseHub.js';
import { configSchema, type ServerConfig } from './types/config.js';
import { getWorkerPool, closeWorkerPool, attachPoolEventListeners } from './tasks/runner.js';
import { httpRequestsTotal } from './routes/metrics.js';
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
      redact: ['req.headers.authorization'],
      genReqId: () => crypto.randomUUID(),
    },
  });

  // Register CORS
  await server.register(cors, {
    origin: validatedConfig.cors.origin,
    credentials: validatedConfig.cors.credentials,
  });

  // Register rate limiting
  await server.register(rateLimit, {
    max: validatedConfig.rateLimit.max,
    timeWindow: validatedConfig.rateLimit.timeWindow,
  });

  // Register Swagger
  await server.register(swagger, {
    openapi: {
      info: {
        title: 'EATA API',
        description: 'Electron App Testing Agent API',
        version: '0.3.0',
      },
    },
  });
  await server.register(swaggerUi, {
    routePrefix: '/docs',
  });

  // API key authentication hook (skip for /health, /metrics, /docs, /api/stream)
  const apiKey = validatedConfig.apiKey || process.env.EATA_API_KEY;
  if (apiKey) {
    server.addHook('onRequest', async (request, reply) => {
      const url = request.url;
      if (
        url === '/health' ||
        url === '/metrics' ||
        url.startsWith('/docs') ||
        url.startsWith('/api/stream')
      ) {
        return;
      }
      const provided = request.headers['x-api-key'];
      if (provided !== apiKey) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    });
  }

  // HTTP request metrics hook
  server.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions?.url ?? request.url;
    httpRequestsTotal.inc({
      method: request.method,
      route,
      status: String(reply.statusCode),
    });
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
