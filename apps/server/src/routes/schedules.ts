import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  CreateScheduleSchema,
  UpdateScheduleSchema,
  ScheduleFiltersSchema,
} from '../schemas/schedule.js';
import { IdParam } from '../utils/validation.js';
import { CronExpressionParser } from 'cron-parser';

interface ScheduleRow {
  id: string;
  name: string;
  template_id: string;
  cron_expression: string;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  last_status: string | null;
  created_at: string;
  updated_at: string;
}

interface ScheduleRunRow {
  id: string;
  schedule_id: string;
  task_id: string | null;
  started_at: string;
  completed_at: string | null;
  status: string;
  summary: string | null;
  error: string | null;
}

function mapSchedule(row: ScheduleRow) {
  return {
    id: row.id,
    name: row.name,
    templateId: row.template_id,
    cronExpression: row.cron_expression,
    enabled: row.enabled === 1,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    runCount: row.run_count,
    lastStatus: row.last_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapScheduleRun(row: ScheduleRunRow) {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    taskId: row.task_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    summary: row.summary,
    error: row.error,
  };
}

export async function scheduleRoutes(server: FastifyInstance) {
  // GET /schedules - List all schedules with optional filters
  server.get('/schedules', async (request) => {
    const parseResult = ScheduleFiltersSchema.safeParse(request.query);
    const filters = parseResult.success ? parseResult.data : undefined;

    let sql = 'SELECT * FROM schedules WHERE 1=1';
    const params: Record<string, unknown> = {};

    if (filters?.enabled !== undefined) {
      sql += ' AND enabled = @enabled';
      params.enabled = filters.enabled ? 1 : 0;
    }

    sql += ' ORDER BY created_at DESC';

    const rows = server.db.prepare(sql).all(params) as ScheduleRow[];
    return { data: rows.map(mapSchedule), total: rows.length };
  });

  // GET /schedules/:id - Get one schedule
  server.get('/schedules/:id', async (request, reply) => {
    const paramsResult = IdParam.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid schedule ID format',
        details: paramsResult.error.issues,
      });
    }

    const { id } = paramsResult.data;
    const row = server.db
      .prepare('SELECT * FROM schedules WHERE id = ?')
      .get(id) as ScheduleRow | undefined;

    if (!row) {
      reply.code(404);
      return { error: 'Schedule not found' };
    }

    return mapSchedule(row);
  });

  // POST /schedules - Create a new schedule
  server.post('/schedules', async (request, reply) => {
    const parseResult = CreateScheduleSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Validation failed',
        details: parseResult.error.issues,
      };
    }

    const data = parseResult.data;

    // Validate cron expression
    try {
      CronExpressionParser.parse(data.cronExpression);
    } catch {
      reply.code(400);
      return { error: 'Invalid cron expression' };
    }

    // Verify template exists
    const template = server.db
      .prepare('SELECT id FROM templates WHERE id = ?')
      .get(data.templateId) as { id: string } | undefined;

    if (!template) {
      reply.code(400);
      return { error: 'Template not found' };
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const interval = CronExpressionParser.parse(data.cronExpression);
    const nextRunAt = interval.next().toISOString();

    server.db
      .prepare(
        `INSERT INTO schedules (id, name, template_id, cron_expression, enabled, next_run_at, created_at, updated_at)
         VALUES (@id, @name, @templateId, @cronExpression, @enabled, @nextRunAt, @createdAt, @updatedAt)`
      )
      .run({
        id,
        name: data.name,
        templateId: data.templateId,
        cronExpression: data.cronExpression,
        enabled: data.enabled ? 1 : 0,
        nextRunAt,
        createdAt: now,
        updatedAt: now,
      });

    const row = server.db
      .prepare('SELECT * FROM schedules WHERE id = ?')
      .get(id) as ScheduleRow;

    reply.code(201);
    return mapSchedule(row);
  });

  // PUT /schedules/:id - Update a schedule
  server.put('/schedules/:id', async (request, reply) => {
    const paramsResult = IdParam.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid schedule ID format',
        details: paramsResult.error.issues,
      });
    }

    const { id } = paramsResult.data;
    const parseResult = UpdateScheduleSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Validation failed',
        details: parseResult.error.issues,
      };
    }

    const existing = server.db
      .prepare('SELECT * FROM schedules WHERE id = ?')
      .get(id) as ScheduleRow | undefined;

    if (!existing) {
      reply.code(404);
      return { error: 'Schedule not found' };
    }

    const data = parseResult.data;
    const updates: string[] = [];
    const params: Record<string, unknown> = { id };

    if (data.name !== undefined) {
      updates.push('name = @name');
      params.name = data.name;
    }
    if (data.templateId !== undefined) {
      // Verify template exists
      const template = server.db
        .prepare('SELECT id FROM templates WHERE id = ?')
        .get(data.templateId) as { id: string } | undefined;

      if (!template) {
        reply.code(400);
        return { error: 'Template not found' };
      }

      updates.push('template_id = @templateId');
      params.templateId = data.templateId;
    }
    if (data.cronExpression !== undefined) {
      // Validate cron expression
      try {
        CronExpressionParser.parse(data.cronExpression);
      } catch {
        reply.code(400);
        return { error: 'Invalid cron expression' };
      }

      updates.push('cron_expression = @cronExpression');
      params.cronExpression = data.cronExpression;

      // Recalculate next run time
      const cronExpr = data.cronExpression;
      const enabled = data.enabled !== undefined ? data.enabled : existing.enabled === 1;
      if (enabled) {
        const interval = CronExpressionParser.parse(cronExpr);
        updates.push('next_run_at = @nextRunAt');
        params.nextRunAt = interval.next().toISOString();
      }
    }
    if (data.enabled !== undefined) {
      updates.push('enabled = @enabled');
      params.enabled = data.enabled ? 1 : 0;
    }

    if (updates.length === 0) {
      const row = server.db
        .prepare('SELECT * FROM schedules WHERE id = ?')
        .get(id) as ScheduleRow;
      return mapSchedule(row);
    }

    updates.push("updated_at = datetime('now')");
    const sql = `UPDATE schedules SET ${updates.join(', ')} WHERE id = @id`;
    server.db.prepare(sql).run(params);

    const row = server.db
      .prepare('SELECT * FROM schedules WHERE id = ?')
      .get(id) as ScheduleRow;
    return mapSchedule(row);
  });

  // DELETE /schedules/:id - Delete a schedule
  server.delete('/schedules/:id', async (request, reply) => {
    const paramsResult = IdParam.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid schedule ID format',
        details: paramsResult.error.issues,
      });
    }

    const { id } = paramsResult.data;
    const existing = server.db
      .prepare('SELECT id FROM schedules WHERE id = ?')
      .get(id) as { id: string } | undefined;

    if (!existing) {
      reply.code(404);
      return { error: 'Schedule not found' };
    }

    server.db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    reply.code(204);
    return;
  });

  // POST /schedules/:id/run - Trigger immediate execution
  server.post('/schedules/:id/run', async (request, reply) => {
    const paramsResult = IdParam.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid schedule ID format',
        details: paramsResult.error.issues,
      });
    }

    const { id } = paramsResult.data;
    const schedule = server.db
      .prepare('SELECT * FROM schedules WHERE id = ?')
      .get(id) as ScheduleRow | undefined;

    if (!schedule) {
      reply.code(404);
      return { error: 'Schedule not found' };
    }

    // Create a task from the template
    const template = server.db
      .prepare('SELECT * FROM templates WHERE id = ?')
      .get(schedule.template_id) as { id: string; goal: string; config: string | null } | undefined;

    if (!template) {
      reply.code(400);
      return { error: 'Associated template not found' };
    }

    const taskId = randomUUID();
    const now = new Date().toISOString();

    server.db
      .prepare(
        `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, created_at, updated_at)
         VALUES (@id, @goal, '', '', 'queued', @now, @now)`
      )
      .run({ id: taskId, goal: template.goal, now });

    // Record schedule run
    const runId = randomUUID();
    server.db
      .prepare(
        `INSERT INTO schedule_runs (id, schedule_id, task_id, started_at, status)
         VALUES (@runId, @scheduleId, @taskId, @startedAt, 'running')`
      )
      .run({ runId, scheduleId: id, taskId, startedAt: now });

    // Update schedule stats
    server.db
      .prepare(
        `UPDATE schedules SET last_run_at = @now, run_count = run_count + 1, last_status = 'running', updated_at = @now WHERE id = @id`
      )
      .run({ now, id });

    reply.code(202);
    return { taskId, runId, message: 'Schedule execution started' };
  });

  // GET /schedules/:id/history - Get execution history
  server.get('/schedules/:id/history', async (request, reply) => {
    const paramsResult = IdParam.safeParse(request.params);
    if (!paramsResult.success) {
      return reply.status(400).send({
        error: 'Invalid schedule ID format',
        details: paramsResult.error.issues,
      });
    }

    const { id } = paramsResult.data;
    const schedule = server.db
      .prepare('SELECT id FROM schedules WHERE id = ?')
      .get(id) as { id: string } | undefined;

    if (!schedule) {
      reply.code(404);
      return { error: 'Schedule not found' };
    }

    const rows = server.db
      .prepare('SELECT * FROM schedule_runs WHERE schedule_id = ? ORDER BY started_at DESC')
      .all(id) as ScheduleRunRow[];

    return { data: rows.map(mapScheduleRun), total: rows.length };
  });
}
