import type { FastifyInstance } from 'fastify';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TaskStatusEnum, type Task, type StepRecord } from '@eata/shared-types';
import { generateHTMLReport } from '../services/htmlReport.js';
import { validatePath, PathTraversalError } from '../services/fileSecurity.js';

function safeJsonParse(value: unknown): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value as string);
  } catch {
    return undefined;
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dbRowToTask(row: Record<string, unknown>): Task {
  const status = TaskStatusEnum.parse(row.status);
  return {
    id: row.id as string,
    goal: row.goal as string,
    targetAppPath: row.target_app_path as string,
    llmModel: row.llm_model as Task['llmModel'],
    status,
    maxSteps: row.max_steps as number,
    contextInjection: (row.context_injection as string) ?? undefined,
    stepCount: row.step_count as number,
    resultSummary: safeJsonParse(row.result_summary) as Task['resultSummary'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function dbRowToStep(row: Record<string, unknown>): StepRecord {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    stepIndex: row.step_index as number,
    phase: row.phase as StepRecord['phase'],
    status: row.status as StepRecord['status'],
    observation: (row.observation as string) ?? undefined,
    action: safeJsonParse(row.action) as StepRecord['action'],
    result: safeJsonParse(row.result),
    reasoning: (row.reasoning as string) ?? undefined,
    screenshotPath: (row.screenshot_path as string) ?? undefined,
    accessibilitySnapshotPath: (row.accessibility_snapshot_path as string) ?? undefined,
    timestamp: row.timestamp as string,
    duration: row.duration as number,
  };
}

export async function reportRoutes(server: FastifyInstance) {
  server.get('/tasks/:id/report', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Invalid task ID format' });
    }

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
    const { id } = request.params as { id: string };
    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Invalid task ID format' });
    }

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
    const { id, stepIndex } = request.params as { id: string; stepIndex: string };
    const stepIdx = parseInt(stepIndex, 10);

    if (!UUID_REGEX.test(id)) {
      return reply.status(400).send({ error: 'Invalid task ID format' });
    }

    if (Number.isNaN(stepIdx)) {
      reply.code(400);
      return { error: 'Invalid step index' };
    }

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
