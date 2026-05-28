import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { initDatabase } from './db/index.js';
import { runMigrations } from './db/migrations.js';
import { seedBuiltInTemplates } from './db/seeds/templates.js';
import { ReportTemplateService } from './services/reportTemplateService.js';
import { registerRoutes } from './routes/index.js';
import { streamRoutes } from './routes/stream.js';
import { sseHub } from './streams/sseHub.js';
import { configSchema, type ServerConfig } from './types/config.js';
import { getWorkerPool, closeWorkerPool, attachPoolEventListeners } from './tasks/runner.js';
import { httpRequestsTotal } from './routes/metrics.js';
import type Database from 'better-sqlite3';

// DX imports
import { getLogger, Spinner, ErrorCode, wrapError } from '@eata/agent-core/dx';

export interface ServerBundle {
  server: Fastify.FastifyInstance;
  db: Database.Database;
}

/**
 * Normalize route labels for Prometheus metrics by replacing UUIDs with :id.
 * Prevents high-cardinality label explosion from unique task/batch IDs.
 */
function normalizeRouteLabel(url: string): string {
  return url.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id',
  );
}

export async function buildServer(config?: Partial<ServerConfig>): Promise<ServerBundle> {
  const logger = getLogger({ source: 'server' });
  const validatedConfig = configSchema.parse(config ?? {});

  logger.info('Initializing server', {
    port: validatedConfig.port,
    host: validatedConfig.host,
    logLevel: validatedConfig.logLevel,
  });

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
    const route = normalizeRouteLabel(request.routeOptions?.url ?? request.url);
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

  // Seed built-in templates
  seedBuiltInTemplates(db);
  server.log.info('Built-in templates seeded');

  // Seed default report template
  const reportTemplateService = new ReportTemplateService(db);
  reportTemplateService.seedDefaultTemplate();
  server.log.info('Default report template seeded');

  // Register application routes and SSE stream routes in parallel
  await Promise.all([
    registerRoutes(server),
    streamRoutes(server),
  ]);

  // Decorate sseHub
  server.decorate('sseHub', sseHub);

  // Initialize worker pool and decorate server
  const workerPool = getWorkerPool({ maxConcurrency: validatedConfig.maxConcurrency, logger: server.log });
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
const isDirectRun = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('server.ts') ||
  process.argv[1]?.endsWith('server.js');

if (isDirectRun) {
  const spinner = new Spinner({ text: 'Starting EATA server...' });
  spinner.start();

  try {
    const { server } = await buildServer();
    const address = await server.listen({ port: 3000, host: '0.0.0.0' });
    spinner.succeed(`Server listening on ${address}`);

    const logger = getLogger({ source: 'server' });
    logger.info('Server started successfully', {
      address,
      docs: `http://localhost:3000/docs`,
      health: `http://localhost:3000/health`,
    });
  } catch (err: unknown) {
    spinner.fail('Failed to start server');
    const eataError = wrapError(err, ErrorCode.SYSTEM_NETWORK_ERROR);
    const logger = getLogger({ source: 'server' });
    logger.error('Server startup failed', eataError);
    process.stderr.write(eataError.format() + '\n');
    process.exit(1);
  }
}
