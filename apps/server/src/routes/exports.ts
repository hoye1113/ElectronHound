/**
 * Result Export Routes
 *
 * Provides export endpoints for tasks, reports, and batches
 * in JSON, CSV, and HTML formats.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createExportService, ExportError, type ExportFormat } from '../services/exportService.js';

// ── Validation schemas ──────────────────────────────────────────────

const ExportFormatEnum = z.enum(['json', 'csv', 'html']);

const TaskExportParams = z.object({
  taskId: z.string().uuid('Invalid ID format'),
  format: ExportFormatEnum,
});

const ReportExportParams = z.object({
  reportId: z.string().uuid('Invalid ID format'),
  format: ExportFormatEnum,
});

const BatchExportParams = z.object({
  batchId: z.string().uuid('Invalid ID format'),
  format: ExportFormatEnum,
});

// ── Content type mapping ────────────────────────────────────────────

const CONTENT_TYPES: Record<ExportFormat, string> = {
  json: 'application/json; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  html: 'text/html; charset=utf-8',
};

// ── Routes ──────────────────────────────────────────────────────────

export async function exportRoutes(server: FastifyInstance) {
  // GET /tasks/:taskId/export/:format
  server.get('/tasks/:taskId/export/:format', async (request, reply) => {
    const parsed = TaskExportParams.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid parameters',
        details: parsed.error.issues,
      });
    }

    const { taskId, format } = parsed.data;

    try {
      const exportService = createExportService(server.db);
      const result = exportService.exportTask(taskId, format);

      reply
        .code(200)
        .header('Content-Type', result.contentType)
        .header(
          'Content-Disposition',
          `attachment; filename="task-${taskId}.${result.fileExtension}"`,
        )
        .send(result.content);
    } catch (error) {
      return handleExportError(error, reply);
    }
  });

  // GET /reports/:reportId/export/:format
  server.get('/reports/:reportId/export/:format', async (request, reply) => {
    const parsed = ReportExportParams.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid parameters',
        details: parsed.error.issues,
      });
    }

    const { reportId, format } = parsed.data;

    try {
      const exportService = createExportService(server.db);
      const result = exportService.exportReport(reportId, format);

      reply
        .code(200)
        .header('Content-Type', result.contentType)
        .header(
          'Content-Disposition',
          `attachment; filename="report-${reportId}.${result.fileExtension}"`,
        )
        .send(result.content);
    } catch (error) {
      return handleExportError(error, reply);
    }
  });

  // GET /tasks/batch/:batchId/export/:format
  server.get('/tasks/batch/:batchId/export/:format', async (request, reply) => {
    const parsed = BatchExportParams.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid parameters',
        details: parsed.error.issues,
      });
    }

    const { batchId, format } = parsed.data;

    try {
      const exportService = createExportService(server.db);
      const result = exportService.exportBatch(batchId, format);

      reply
        .code(200)
        .header('Content-Type', result.contentType)
        .header(
          'Content-Disposition',
          `attachment; filename="batch-${batchId}.${result.fileExtension}"`,
        )
        .send(result.content);
    } catch (error) {
      return handleExportError(error, reply);
    }
  });
}

// ── Error handler ────────────────────────────────────────────────────

function handleExportError(error: unknown, reply: import('fastify').FastifyReply) {
  if (error instanceof ExportError) {
    reply.code(error.statusCode);
    return { error: error.message };
  }

  reply.code(500);
  return { error: 'Internal server error' };
}
