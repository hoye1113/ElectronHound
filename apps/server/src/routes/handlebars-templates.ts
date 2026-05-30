/**
 * Handlebars Report Template API routes.
 *
 * GET    /reports/templates                 - List available Handlebars templates
 * GET    /reports/templates/:name/preview   - Preview template with sample data
 * POST   /reports/templates/:name/render    - Render template with actual data
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HandlebarsReportTemplateService } from '../services/handlebarsTemplate.js';
import { toErrorMessage } from '@eata/agent-core/utils/error';
import { join } from 'node:path';

const NameParam = z.object({ name: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid template name') });
const RenderBodySchema = z.record(z.unknown());

export async function handlebarsTemplateRoutes(server: FastifyInstance) {
  const templatesDir = join(process.cwd(), 'apps', 'server', 'templates');
  const service = new HandlebarsReportTemplateService(templatesDir);

  // GET /reports/templates — list available templates
  server.get('/reports/templates', async (_request, _reply) => {
    const templates = service.listTemplates();
    return { data: templates, total: templates.length };
  });

  // GET /reports/templates/:name/preview — preview with sample data
  server.get('/reports/templates/:name/preview', async (request, reply) => {
    const parsed = NameParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid template name',
        details: parsed.error.issues,
      });
    }

    const { name } = parsed.data;

    try {
      const html = service.preview(name);
      reply
        .code(200)
        .header('Content-Type', 'text/html; charset=utf-8')
        .header('Content-Disposition', `inline; filename="preview-${name}.html"`)
        .send(html);
    } catch (err: unknown) {
      const message = toErrorMessage(err);
      if (message.includes('not found')) {
        reply.code(404);
        return { error: `Template "${name}" not found` };
      }
      reply.code(400);
      return { error: `Failed to preview template: ${message}` };
    }
  });

  // POST /reports/templates/:name/render — render with provided data
  server.post('/reports/templates/:name/render', async (request, reply) => {
    const paramParsed = NameParam.safeParse(request.params);
    if (!paramParsed.success) {
      return reply.status(400).send({
        error: 'Invalid template name',
        details: paramParsed.error.issues,
      });
    }

    const bodyParsed = RenderBodySchema.safeParse(request.body);
    if (!bodyParsed.success) {
      reply.code(400);
      return { error: 'Invalid request body', details: bodyParsed.error.issues };
    }

    const { name } = paramParsed.data;

    try {
      const html = service.render(name, bodyParsed.data as Record<string, unknown>);
      reply
        .code(200)
        .header('Content-Type', 'text/html; charset=utf-8')
        .header('Content-Disposition', `inline; filename="report-${name}.html"`)
        .send(html);
    } catch (err: unknown) {
      const message = toErrorMessage(err);
      if (message.includes('not found')) {
        reply.code(404);
        return { error: `Template "${name}" not found` };
      }
      reply.code(400);
      return { error: `Failed to render template: ${message}` };
    }
  });
}
