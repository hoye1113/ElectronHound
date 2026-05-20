import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  CreateTaskRequestSchema,
  TaskStatusEnum,
  type Task,
  type StepRecord,
} from '@eata/shared-types';
import { sseHub } from '../streams/sseHub.js';

function safeJsonParse(value: unknown): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value as string);
  } catch {
    return undefined;
  }
}

function dbRowToTask(row: Record<string, unknown>): Task {
  const status = TaskStatusEnum.parse(row.status);
  return {
    id: row.id as string,
    goal: row.goal as string,
    targetAppPath: row.target_app_path as string,
    llmModel: row.llm_model as Task['llmModel'],
    status,
    maxSteps: row.max_steps as number,
    providerId: (row.provider_id as string) ?? undefined,
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

export async function taskRoutes(server: FastifyInstance) {
  // GET /tasks — list with optional status filter + pagination
  server.get('/tasks', async (request) => {
    const query = request.query as {
      status?: string;
      page?: string;
      limit?: string;
    };
    const statusFilter = query.status || null;
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20));
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
    const { id } = request.params as { id: string };

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

    server.db
      .prepare(
        `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, context_injection, step_count, created_at, updated_at, provider_id)
         VALUES (?, ?, ?, ?, 'queued', ?, ?, 0, ?, ?, ?)`
      )
      .run(id, goal, targetAppPath, llmModel, maxSteps ?? 50, contextInjection ?? null, now, now, providerId ?? null);

    const createdRow = server.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(id) as Record<string, unknown>;

    reply.code(201);
    return dbRowToTask(createdRow);
  });

  // POST /tasks/:id/cancel — cancel a running or queued task
  server.post('/tasks/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };

    const taskRow = server.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;

    if (!taskRow) {
      reply.code(404);
      return { error: 'Task not found' };
    }

    const status = taskRow.status as string;

    if (status !== 'running' && status !== 'queued') {
      reply.code(409);
      return { error: 'Task is not in a cancellable state' };
    }

    server.db
      .prepare("UPDATE tasks SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?")
      .run(id);

    // Broadcast cancellation to SSE clients
    sseHub.broadcast(id, {
      event: 'status',
      data: { taskId: id, status: 'cancelled' },
    });

    const updatedRow = server.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(id) as Record<string, unknown>;

    return dbRowToTask(updatedRow);
  });

  // DELETE /tasks/:id — cancel (if running) or delete (if queued)
  server.delete('/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const taskRow = server.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;

    if (!taskRow) {
      reply.code(404);
      return { error: 'Task not found' };
    }

    const status = taskRow.status as string;

    if (status === 'running') {
      server.db
        .prepare("UPDATE tasks SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?")
        .run(id);
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
