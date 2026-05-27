import type { FastifyInstance } from 'fastify';
import {
  CreateTemplateSchema,
  UpdateTemplateSchema,
  TemplateFiltersSchema,
} from '../schemas/template.js';
import { TemplateService } from '../services/templateService.js';
import { IdParam } from '../utils/validation.js';

// NOTE: Template IDs use non-UUID strings (e.g. "builtin-login-flow") by design.
// Built-in templates have human-readable slug IDs seeded at startup; user-created
// templates get randomUUID() IDs. This is intentional and differs from report-templates
// which use UuidParam exclusively.

export async function templateRoutes(server: FastifyInstance) {
  const templateService = new TemplateService(server.db);

  // GET /templates - List all templates with optional filters
  server.get('/templates', async (request) => {
    const parseResult = TemplateFiltersSchema.safeParse(request.query);
    const filters = parseResult.success ? parseResult.data : undefined;

    const templates = templateService.listTemplates(filters);
    return { data: templates, total: templates.length };
  });

  // GET /templates/:id - Get template details
  server.get('/templates/:id', async (request, reply) => {
    const paramsResult = IdParam.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid template ID format',
        details: paramsResult.error.issues,
      });
    }

    const { id } = paramsResult.data;
    const template = templateService.getTemplate(id);

    if (!template) {
      reply.code(404);
      return { error: 'Template not found' };
    }

    return template;
  });

  // POST /templates - Create custom template
  server.post('/templates', async (request, reply) => {
    const parseResult = CreateTemplateSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Validation failed',
        details: parseResult.error.issues,
      };
    }

    const template = templateService.createTemplate(parseResult.data);
    reply.code(201);
    return template;
  });

  // PUT /templates/:id - Update template (only custom, not built-in)
  server.put('/templates/:id', async (request, reply) => {
    const paramsResult = IdParam.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid template ID format',
        details: paramsResult.error.issues,
      });
    }

    const { id } = paramsResult.data;
    const parseResult = UpdateTemplateSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Validation failed',
        details: parseResult.error.issues,
      };
    }

    try {
      const template = templateService.updateTemplate(id, parseResult.data);
      if (!template) {
        reply.code(404);
        return { error: 'Template not found' };
      }
      return template;
    } catch (error) {
      if (error instanceof Error && error.message === 'Cannot modify built-in templates') {
        reply.code(403);
        return { error: error.message };
      }
      throw error;
    }
  });

  // DELETE /templates/:id - Delete template (only custom, not built-in)
  server.delete('/templates/:id', async (request, reply) => {
    const paramsResult = IdParam.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid template ID format',
        details: paramsResult.error.issues,
      });
    }

    const { id } = paramsResult.data;

    try {
      const deleted = templateService.deleteTemplate(id);
      if (!deleted) {
        reply.code(404);
        return { error: 'Template not found' };
      }
      reply.code(204);
      return;
    } catch (error) {
      if (error instanceof Error && error.message === 'Cannot delete built-in templates') {
        reply.code(403);
        return { error: error.message };
      }
      throw error;
    }
  });
}
