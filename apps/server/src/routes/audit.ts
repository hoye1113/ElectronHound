import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UsageAuditService } from '../services/usageAudit.js';

// ── Validation schemas ──────────────────────────────────────────────

const TokenUsageQuerySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  provider: z.string().optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

const RecordUsageSchema = z.object({
  task_id: z.string().uuid(),
  provider: z.string().min(1),
  model: z.string().min(1),
  prompt_tokens: z.number().int().min(0),
  completion_tokens: z.number().int().min(0),
});

// ── Routes ──────────────────────────────────────────────────────────

export async function auditRoutes(server: FastifyInstance) {
  const usageAuditService = new UsageAuditService(server.db);

  // GET /audit/tokens — query token usage with date range filtering
  server.get('/audit/tokens', async (request, reply) => {
    const parseResult = TokenUsageQuerySchema.safeParse(request.query);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Validation failed',
        details: parseResult.error.issues,
      };
    }

    const { start_date, end_date, provider, page, limit } = parseResult.data;

    const result = usageAuditService.queryUsage({
      start_date,
      end_date,
      provider,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    return result;
  });

  // POST /audit/tokens — record token usage (internal use)
  server.post('/audit/tokens', async (request, reply) => {
    const parseResult = RecordUsageSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Validation failed',
        details: parseResult.error.issues,
      };
    }

    const record = usageAuditService.recordUsage(parseResult.data);

    reply.code(201);
    return record;
  });

  // GET /audit/tokens/task/:taskId — get usage for a specific task
  server.get('/audit/tokens/task/:taskId', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(taskId)) {
      reply.code(400);
      return { error: 'Invalid task ID format' };
    }

    const records = usageAuditService.getTaskUsage(taskId);
    return { data: records };
  });

  // GET /audit/tokens/providers — get available providers for filtering
  server.get('/audit/tokens/providers', async () => {
    const providers = usageAuditService.getProviders();
    return { data: providers };
  });
}
