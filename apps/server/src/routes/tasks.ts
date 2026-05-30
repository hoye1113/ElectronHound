import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CreateTaskRequestSchema } from '@eata/shared-types';
import { sseHub } from '../streams/sseHub.js';
import { getWorkerPool } from '../tasks/runner.js';
import { dbRowToTask, dbRowToStep } from '../utils/dbMappers.js';
import { IdParam } from '../utils/validation.js';

// ── Validation schemas ──────────────────────────────────────────────

const TaskStatusEnum = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'aborted',
]);

const TaskListQuery = z.object({
  status: TaskStatusEnum.optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

export async function taskRoutes(server: FastifyInstance) {
  // Hoisted prepared statements
  const getTaskByIdStmt = server.db.prepare('SELECT * FROM tasks WHERE id = ?');
  const getStepsByTaskIdStmt = server.db.prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_index');
  const updateStatusStmt = server.db.prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?");
  const insertTaskStmt = server.db.prepare(
    `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, context_injection, step_count, created_at, updated_at, provider_id)
     VALUES (?, ?, ?, ?, 'queued', ?, ?, 0, ?, ?, ?)`
  );

  // GET /tasks — list with optional status filter + pagination
  server.get('/tasks', async (request) => {
    const parsed = TaskListQuery.safeParse(request.query);
    const statusFilter = parsed.success ? (parsed.data.status || null) : null;
    const page = parsed.success ? Math.max(1, parseInt(parsed.data.page || '1', 10) || 1) : 1;
    const limit = parsed.success
      ? Math.min(100, Math.max(1, parseInt(parsed.data.limit || '20', 10) || 20))
      : 20;
    const offset = (page - 1) * limit;

    const countSql =
      'SELECT COUNT(*) as total FROM tasks WHERE (@status IS NULL OR status = @status)';
    const countResult = server.db.prepare(countSql).get({
      status: statusFilter,
    }) as { total: number };

    const dataSql =
      'SELECT * FROM tasks WHERE (@status IS NULL OR status = @status) ORDER BY created_at DESC LIMIT @limit OFFSET @offset';
    const rows = server.db.prepare(dataSql).all({
      status: statusFilter,
      limit,
      offset,
    }) as Array<Record<string, unknown>>;

    return {
      data: rows.map(dbRowToTask),
      total: countResult.total,
      page,
      limit,
    };
  });

  // GET /tasks/:id — task detail with steps
  server.get('/tasks/:id', async (request, reply) => {
    const parsed = IdParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid task ID format', details: parsed.error.issues });
    }
    const { id } = parsed.data;

    const taskRow = getTaskByIdStmt.get(id) as Record<string, unknown> | undefined;

    if (!taskRow) {
      reply.code(404);
      return { error: 'Task not found' };
    }

    const stepRows = getStepsByTaskIdStmt.all(id) as Array<Record<string, unknown>>;

    return {
      task: dbRowToTask(taskRow),
      steps: stepRows.map(dbRowToStep),
    };
  });

  // POST /tasks — create new task
  server.post('/tasks', async (request, reply) => {
    const parseResult = CreateTaskRequestSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Validation failed',
        details: parseResult.error.issues,
      };
    }

    const { goal, targetAppPath, llmModel, maxSteps, contextInjection, providerId } = parseResult.data;
    const id = randomUUID();
    const now = new Date().toISOString();

    insertTaskStmt.run(id, goal, targetAppPath, llmModel, maxSteps ?? 50, contextInjection ?? null, now, now, providerId ?? null);

    const createdRow = getTaskByIdStmt.get(id) as Record<string, unknown>;

    // Submit to the worker pool (max 3 concurrent executions)
    const pool = getWorkerPool();
    pool.submit({
      id,
      goal,
      targetAppPath,
      llmModel,
      maxSteps,
      contextInjection,
      providerId,
      priority: 'medium',
      dataDir: server.dataDir,
    });

    reply.code(201);
    return dbRowToTask(createdRow);
  });

  // POST /tasks/:id/cancel — cancel a running or queued task
  server.post('/tasks/:id/cancel', async (request, reply) => {
    const parsed = IdParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid task ID format', details: parsed.error.issues });
    }
    const { id } = parsed.data;

    const taskRow = getTaskByIdStmt.get(id) as Record<string, unknown> | undefined;

    if (!taskRow) {
      reply.code(404);
      return { error: 'Task not found' };
    }

    const status = taskRow.status as string;

    if (status !== 'running' && status !== 'queued') {
      reply.code(409);
      return { error: 'Task is not in a cancellable state' };
    }

    updateStatusStmt.run('cancelled', id);

    // Cancel in the worker pool (no-op if task wasn't in the pool)
    const pool = getWorkerPool();
    pool.cancel(id);

    // Broadcast cancellation to SSE clients
    sseHub.broadcast(id, {
      event: 'status',
      data: { taskId: id, status: 'cancelled' },
    });

    const updatedRow = getTaskByIdStmt.get(id) as Record<string, unknown>;

    return dbRowToTask(updatedRow);
  });

  // DELETE /tasks/:id — cancel (if running) or delete (if queued)
  server.delete('/tasks/:id', async (request, reply) => {
    const parsed = IdParam.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid task ID format', details: parsed.error.issues });
    }
    const { id } = parsed.data;

    const taskRow = getTaskByIdStmt.get(id) as Record<string, unknown> | undefined;

    if (!taskRow) {
      reply.code(404);
      return { error: 'Task not found' };
    }

    const status = taskRow.status as string;

    if (status === 'running') {
      updateStatusStmt.run('cancelled', id);
      // Cancel in the worker pool
      const pool = getWorkerPool();
      pool.cancel(id);
    } else {
      // queued or other terminal states — delete (atomic transaction)
      server.db.transaction(() => {
        server.db.prepare('DELETE FROM steps WHERE task_id = ?').run(id);
        server.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
      })();
    }

    reply.code(204);
    return;
  });
}
