import type { FastifyInstance } from 'fastify';
import {
  CreateFewShotSchema,
  UpdateFewShotSchema,
  FewShotFiltersSchema,
  MigrateFewShotSchema,
} from '../schemas/few-shot.js';
import { FewShotService } from '../services/fewShotService.js';
import { IdParam } from '../utils/validation.js';

export async function fewShotRoutes(server: FastifyInstance) {
  const fewShotService = new FewShotService(server.db);

  // GET /few-shot - List all examples with optional filters
  server.get('/few-shot', async (request) => {
    const parseResult = FewShotFiltersSchema.safeParse(request.query);
    const filters = parseResult.success ? parseResult.data : undefined;

    const examples = fewShotService.listExamples(filters);
    return { data: examples, total: examples.length };
  });

  // POST /few-shot - Create a new example
  server.post('/few-shot', async (request, reply) => {
    const parseResult = CreateFewShotSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Validation failed',
        details: parseResult.error.issues,
      };
    }

    const example = fewShotService.createExample(parseResult.data);
    reply.code(201);
    return example;
  });

  // POST /few-shot/migrate - Batch import examples
  server.post('/few-shot/migrate', async (request, reply) => {
    const parseResult = MigrateFewShotSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Validation failed',
        details: parseResult.error.issues,
      };
    }

    const result = fewShotService.migrateExamples(parseResult.data.examples);
    reply.code(201);
    return result;
  });

  // PUT /few-shot/:id - Update an example
  server.put('/few-shot/:id', async (request, reply) => {
    const paramsResult = IdParam.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid example ID format',
        details: paramsResult.error.issues,
      });
    }

    const { id } = paramsResult.data;
    const parseResult = UpdateFewShotSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Validation failed',
        details: parseResult.error.issues,
      };
    }

    const example = fewShotService.updateExample(id, parseResult.data);
    if (!example) {
      reply.code(404);
      return { error: 'Example not found' };
    }
    return example;
  });

  // DELETE /few-shot/:id - Delete an example
  server.delete('/few-shot/:id', async (request, reply) => {
    const paramsResult = IdParam.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid example ID format',
        details: paramsResult.error.issues,
      });
    }

    const { id } = paramsResult.data;

    const deleted = fewShotService.deleteExample(id);
    if (!deleted) {
      reply.code(404);
      return { error: 'Example not found' };
    }
    reply.code(204);
    return;
  });
}
