/**
 * Report Template API routes.
 *
 * GET    /report-templates              - List all templates
 * GET    /report-templates/:id          - Get template by ID
 * POST   /report-templates              - Create new template
 * PUT    /report-templates/:id          - Update template
 * DELETE /report-templates/:id          - Delete template (cannot delete default)
 * POST   /reports/:reportId/generate    - Generate report using template
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ReportTemplateService } from '../services/reportTemplateService.js';
import {
  CreateReportTemplateSchema,
  UpdateReportTemplateSchema,
  GenerateReportSchema,
} from '../schemas/report-template.js';
import { generateTemplatedHTMLReport } from '../services/htmlReport.js';
import { dbRowToTask, dbRowToStep } from '../utils/dbMappers.js';
import { UuidParam } from '../utils/validation.js';

export async function reportTemplateRoutes(server: FastifyInstance) {
  // GET /report-templates — list all templates
  server.get('/report-templates', async (_request, _reply) => {
    const svc = new ReportTemplateService(server.db);
    const templates = svc.listTemplates();
    return { data: templates };
  });

  // GET /report-templates/:id — get single template
  server.get('/report-templates/:id', async (request, reply) => {
    const parsed = UuidParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid template ID format', details: parsed.error.issues });
    }
    const { id } = parsed.data;

    const svc = new ReportTemplateService(server.db);
    const template = svc.getTemplate(id);
    if (!template) {
      reply.code(404);
      return { error: 'Template not found' };
    }
    return template;
  });

  // POST /report-templates — create new template
  server.post('/report-templates', async (request, reply) => {
    const parseResult = CreateReportTemplateSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.code(400);
      return { error: 'Validation failed', details: parseResult.error.issues };
    }

    const svc = new ReportTemplateService(server.db);
    const template = svc.createTemplate(parseResult.data);
    reply.code(201);
    return template;
  });

  // PUT /report-templates/:id — update template
  server.put('/report-templates/:id', async (request, reply) => {
    const paramParsed = UuidParam.safeParse(request.params);
    if (!paramParsed.success) {
      return reply.status(400).send({ error: 'Invalid template ID format', details: paramParsed.error.issues });
    }
    const { id } = paramParsed.data;

    const bodyParsed = UpdateReportTemplateSchema.safeParse(request.body);
    if (!bodyParsed.success) {
      reply.code(400);
      return { error: 'Validation failed', details: bodyParsed.error.issues };
    }

    const svc = new ReportTemplateService(server.db);

    try {
      const template = svc.updateTemplate(id, bodyParsed.data);
      if (!template) {
        reply.code(404);
        return { error: 'Template not found' };
      }
      return template;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed';
      reply.code(409);
      return { error: message };
    }
  });

  // DELETE /report-templates/:id — delete template
  server.delete('/report-templates/:id', async (request, reply) => {
    const parsed = UuidParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid template ID format', details: parsed.error.issues });
    }
    const { id } = parsed.data;

    const svc = new ReportTemplateService(server.db);

    try {
      const deleted = svc.deleteTemplate(id);
      if (!deleted) {
        reply.code(404);
        return { error: 'Template not found' };
      }
      reply.code(204);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      reply.code(409);
      return { error: message };
    }
  });

  // POST /reports/:reportId/generate — generate HTML report using template
  server.post('/reports/:reportId/generate', async (request, reply) => {
    const ReportIdParam = z.object({ reportId: z.string().uuid() });
    const paramParsed = ReportIdParam.safeParse(request.params);
    if (!paramParsed.success) {
      return reply.status(400).send({ error: 'Invalid report ID format', details: paramParsed.error.issues });
    }
    const { reportId } = paramParsed.data;

    const bodyParsed = GenerateReportSchema.safeParse(request.body ?? {});
    if (!bodyParsed.success) {
      reply.code(400);
      return { error: 'Validation failed', details: bodyParsed.error.issues };
    }

    // Fetch task from database
    const taskRow = server.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(reportId) as Record<string, unknown> | undefined;

    if (!taskRow) {
      reply.code(404);
      return { error: 'Task not found' };
    }

    const stepRows = server.db
      .prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_index')
      .all(reportId) as Array<Record<string, unknown>>;

    const task = dbRowToTask(taskRow);
    const steps = stepRows.map(dbRowToStep);

    // Resolve template
    const svc = new ReportTemplateService(server.db);
    let template;
    if (bodyParsed.data.templateId) {
      template = svc.getTemplate(bodyParsed.data.templateId);
      if (!template) {
        reply.code(404);
        return { error: 'Template not found' };
      }
    } else {
      template = svc.getDefaultTemplate();
    }

    const html = generateTemplatedHTMLReport(task, steps, template);

    reply
      .code(200)
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Content-Disposition', `inline; filename="report-${reportId}.html"`)
      .send(html);
  });
}
