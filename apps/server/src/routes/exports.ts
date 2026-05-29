/**
 * Result Export Routes
 *
 * Provides export endpoints for tasks, reports, and batches
 * in JSON, CSV, and HTML formats.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createExportService, ExportError } from '../services/exportService.js';

// ── Validation schemas ──────────────────────────────────────────────

const ExportFormatEnum = z.enum(['json', 'csv', 'html', 'pdf']);

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

const BatchExportBody = z.object({
  taskIds: z.array(z.string().uuid('Invalid ID format')).min(1, 'At least one task ID required').max(100, 'Maximum 100 tasks per export'),
  format: ExportFormatEnum,
});

// ── Content type mapping ────────────────────────────────────────────

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
      const result = await exportService.exportTask(taskId, format);

      reply
        .code(200)
        .header('Content-Type', result.contentType)
        .header(
          'Content-Disposition',
          `attachment; filename="task-${taskId}.${result.fileExtension}"`,
        )
        .send(result.content);
    } catch (error: unknown) {
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
      const result = await exportService.exportReport(reportId, format);

      reply
        .code(200)
        .header('Content-Type', result.contentType)
        .header(
          'Content-Disposition',
          `attachment; filename="report-${reportId}.${result.fileExtension}"`,
        )
        .send(result.content);
    } catch (error: unknown) {
      return handleExportError(error, reply);
    }
  });

  // POST /tasks/batch-export — export selected tasks by IDs
  server.post('/tasks/batch-export', async (request, reply) => {
    const parsed = BatchExportBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid parameters',
        details: parsed.error.issues,
      });
    }

    const { taskIds, format } = parsed.data;

    try {
      const exportService = createExportService(server.db);
      const results = await Promise.all(taskIds.map(async (taskId) => {
        try {
          return await exportService.exportTask(taskId, format);
        } catch {
          return null;
        }
      }));

      const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null);

      if (validResults.length === 0) {
        return reply.status(404).send({ error: 'No valid tasks found for export' });
      }

      // Combine results based on format
      let combinedContent: string;
      let contentType: string;
      let fileExtension: string;

      if (format === 'json') {
        const parsed = validResults.map((r) => JSON.parse(r.content as string));
        combinedContent = JSON.stringify(parsed, null, 2);
        contentType = 'application/json';
        fileExtension = 'json';
      } else if (format === 'csv') {
        // Use first result's header, then combine all rows
        const csvResults = validResults.map((r) => r.content as string);
        const header = csvResults[0]?.split('\n')[0] ?? '';
        const rows = csvResults.flatMap((csv) => csv.split('\n').slice(1));
        combinedContent = [header, ...rows].join('\n');
        contentType = 'text/csv';
        fileExtension = 'csv';
      } else if (format === 'pdf') {
        // PDF: return first result as base64 (single task PDF)
        combinedContent = validResults[0].content;
        contentType = 'application/pdf';
        fileExtension = 'pdf';
      } else {
        // HTML: combine all into one document
        const htmlParts = validResults.map((r) => r.content as string);
        combinedContent = `<!DOCTYPE html><html><head><title>Batch Export</title></head><body>${htmlParts.join('<hr/>')}</body></html>`;
        contentType = 'text/html';
        fileExtension = 'html';
      }

      reply
        .code(200)
        .header('Content-Type', contentType)
        .header('Content-Disposition', `attachment; filename="batch-export.${fileExtension}"`)
        .send(combinedContent);
    } catch (error: unknown) {
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
      const result = await exportService.exportBatch(batchId, format);

      reply
        .code(200)
        .header('Content-Type', result.contentType)
        .header(
          'Content-Disposition',
          `attachment; filename="batch-${batchId}.${result.fileExtension}"`,
        )
        .send(result.content);
    } catch (error: unknown) {
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
