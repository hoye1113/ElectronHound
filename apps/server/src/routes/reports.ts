import type { FastifyInstance } from 'fastify';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { generateHTMLReport } from '../services/htmlReport.js';
import { validatePath } from '../services/fileSecurity.js';
import { dbRowToTask, dbRowToStep } from '../utils/dbMappers.js';
import { UuidParam } from '../utils/validation.js';
const StepParam = z.object({
  id: z.string().uuid(),
  stepIndex: z.string().regex(/^\d+$/).refine((val) => {
    const num = parseInt(val, 10);
    return num >= 0 && num <= 1000;
  }, 'Step index must be between 0 and 1000'),
});

export async function reportRoutes(server: FastifyInstance) {
  // GET /tasks/:id/report — fetch report manifest
  server.get('/tasks/:id/report', async (request, reply) => {
    const parsed = UuidParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid task ID format', details: parsed.error.issues });
    }
    const { id } = parsed.data;

    let reportDir: string;
    try {
      reportDir = validatePath(join('data', 'reports'), id);
    } catch {
      reply.code(400);
      return { error: 'Invalid report path' };
    }

    if (!existsSync(reportDir)) {
      reply.code(404);
      return { error: 'Report not found' };
    }

    const manifestPath = join(reportDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      reply.code(404);
      return { error: 'Manifest not found' };
    }

    const content = readFileSync(manifestPath, 'utf-8');
    return JSON.parse(content);
  });

  // GET /tasks/:id/report/html — generate and return HTML report
  server.get('/tasks/:id/report/html', async (request, reply) => {
    const parsed = UuidParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid task ID format', details: parsed.error.issues });
    }
    const { id } = parsed.data;

    const taskRow = server.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;

    if (!taskRow) {
      reply.code(404);
      return { error: 'Task not found' };
    }

    const stepRows = server.db
      .prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_index')
      .all(id) as Array<Record<string, unknown>>;

    const task = dbRowToTask(taskRow);
    const steps = stepRows.map(dbRowToStep);
    const html = generateHTMLReport(task, steps);

    reply
      .code(200)
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Content-Disposition', `inline; filename="report-${id}.html"`)
      .send(html);
  });

  // GET /tasks/:id/steps/:stepIndex/screenshot
  server.get('/tasks/:id/steps/:stepIndex/screenshot', async (request, reply) => {
    const parsed = StepParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid task ID format', details: parsed.error.issues });
    }
    const { id, stepIndex } = parsed.data;
    const stepIdx = parseInt(stepIndex, 10);

    // Query database for the step's screenshot path
    const stepRow = server.db
      .prepare('SELECT screenshot_path FROM steps WHERE task_id = ? AND step_index = ?')
      .get(id, stepIdx) as { screenshot_path: string | null } | undefined;

    if (!stepRow || !stepRow.screenshot_path) {
      reply.code(404);
      return { error: 'Screenshot not found' };
    }

    // Resolve screenshot file path (relative to data/screenshots)
    const screenshotPath = validatePath(join('data', 'screenshots'), stepRow.screenshot_path);

    if (!existsSync(screenshotPath)) {
      reply.code(404);
      return { error: 'Screenshot file not found' };
    }

    try {
      const fileBuffer = readFileSync(screenshotPath);
      reply
        .code(200)
        .header('Content-Type', 'image/png')
        .header('Cache-Control', 'public, max-age=31536000')
        .send(fileBuffer);
    } catch {
      reply.code(500);
      return { error: 'Failed to read screenshot' };
    }
  });
}
