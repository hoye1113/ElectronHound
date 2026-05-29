/**
 * Batch Testing Routes
 *
 * Handles batch creation, status retrieval, and cancellation.
 */
import type { FastifyInstance } from 'fastify';
import { CreateBatchSchema, BatchIdSchema } from '../schemas/batch.js';
import { getBatchService } from '../services/batchService.js';

// ── Default configuration ────────────────────────────────────────────
// These defaults are used when batch tasks don't specify their own config
const DEFAULT_TARGET_APP_PATH =
  process.platform === 'win32' ? '/path/to/app.exe' : '/path/to/app';

// ── Batch Routes ─────────────────────────────────────────────────────

export async function batchRoutes(server: FastifyInstance) {
  // POST /tasks/batch — create a new batch with multiple tasks
  server.post('/tasks/batch', async (request, reply) => {
    const parseResult = CreateBatchSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Validation failed',
        details: parseResult.error.issues,
      };
    }

    const { name, tasks, priority } = parseResult.data;

    try {
      const batchService = getBatchService(server.db);
      const result = batchService.createBatch(
        { name, tasks, priority },
        DEFAULT_TARGET_APP_PATH
      );

      reply.code(201);
      return {
        batchId: result.batchId,
        taskIds: result.taskIds,
        totalTasks: result.taskIds.length,
      };
    } catch (error: unknown) {
      server.log.error(error, 'Failed to create batch');
      reply.code(500);
      return { error: 'Failed to create batch' };
    }
  });

  // GET /tasks/batches — list all batches with optional filters
  server.get('/tasks/batches', async (request) => {
    const query = request.query as Record<string, string>;
    const status = query.status;
    const page = query.page ? parseInt(query.page, 10) : 1;
    const limit = query.limit ? parseInt(query.limit, 10) : 20;

    const batchService = getBatchService(server.db);
    return batchService.listBatches({ status, page, limit });
  });

  // GET /tasks/batch/:batchId — get batch status with task breakdown
  server.get('/tasks/batch/:batchId', async (request, reply) => {
    const parseResult = BatchIdSchema.safeParse(request.params);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Invalid batch ID format',
        details: parseResult.error.issues,
      };
    }

    const { batchId } = parseResult.data;

    try {
      const batchService = getBatchService(server.db);
      const batch = batchService.getBatchStatus(batchId);

      if (!batch) {
        reply.code(404);
        return { error: 'Batch not found' };
      }

      return batch;
    } catch (error: unknown) {
      server.log.error(error, 'Failed to get batch status');
      reply.code(500);
      return { error: 'Failed to get batch status' };
    }
  });

  // POST /tasks/batch/:batchId/cancel — cancel a batch and its pending tasks
  server.post('/tasks/batch/:batchId/cancel', async (request, reply) => {
    const parseResult = BatchIdSchema.safeParse(request.params);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Invalid batch ID format',
        details: parseResult.error.issues,
      };
    }

    const { batchId } = parseResult.data;

    try {
      const batchService = getBatchService(server.db);
      const success = batchService.cancelBatch(batchId);

      if (!success) {
        // Check if batch exists to provide appropriate error
        const batch = batchService.getBatchStatus(batchId);
        if (!batch) {
          reply.code(404);
          return { error: 'Batch not found' };
        }

        reply.code(409);
        return { error: 'Batch is not in a cancellable state' };
      }

      return { success: true, batchId };
    } catch (error: unknown) {
      server.log.error(error, 'Failed to cancel batch');
      reply.code(500);
      return { error: 'Failed to cancel batch' };
    }
  });
}
