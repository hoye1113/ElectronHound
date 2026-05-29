import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbRowToTask, dbRowToStep } from '../utils/dbMappers.js';

// ── Validation ───────────────────────────────────────────────────────

const CompareBodySchema = z.object({
  taskIds: z.tuple([z.string().uuid(), z.string().uuid()]),
});

// ── Types ────────────────────────────────────────────────────────────

interface StepInfo {
  phase: string;
  status: string;
  stepIndex: number;
  action?: { name: string };
}

interface DiffResult {
  newFailures: Array<{ stepIndex: number; phase: string; message: string }>;
  fixedIssues: Array<{ stepIndex: number; phase: string; message: string }>;
  planChanges: Array<{ stepIndex: number; message: string }>;
  unchangedCount: number;
}

// ── Diff logic ───────────────────────────────────────────────────────

function computeDiff(stepsA: StepInfo[], stepsB: StepInfo[]): DiffResult {
  const mapA = new Map(stepsA.map((s) => [s.phase + ':' + s.stepIndex, s]));
  const mapB = new Map(stepsB.map((s) => [s.phase + ':' + s.stepIndex, s]));

  const newFailures: DiffResult['newFailures'] = [];
  const fixedIssues: DiffResult['fixedIssues'] = [];
  const planChanges: DiffResult['planChanges'] = [];
  let unchangedCount = 0;

  // Check each step in B against A
  for (const [key, stepB] of mapB) {
    const stepA = mapA.get(key);

    if (!stepA) {
      // New step in B
      if (stepB.status === 'failed') {
        newFailures.push({
          stepIndex: stepB.stepIndex,
          phase: stepB.phase,
          message: `New step at phase "${stepB.phase}" index ${stepB.stepIndex} failed`,
        });
      }
      continue;
    }

    // Both exist — compare statuses
    const aPassed = stepA.status === 'success';
    const bPassed = stepB.status === 'success';

    if (stepA.phase === 'verify' && aPassed && !bPassed) {
      newFailures.push({
        stepIndex: stepB.stepIndex,
        phase: stepB.phase,
        message: `Verify step ${stepB.stepIndex} went from pass to fail`,
      });
    } else if (stepA.phase === 'verify' && !aPassed && bPassed) {
      fixedIssues.push({
        stepIndex: stepB.stepIndex,
        phase: stepB.phase,
        message: `Verify step ${stepB.stepIndex} went from fail to pass`,
      });
    } else if (
      stepA.phase === 'plan' &&
      stepA.action?.name !== stepB.action?.name
    ) {
      planChanges.push({
        stepIndex: stepB.stepIndex,
        message: `Plan step ${stepB.stepIndex} action changed from "${stepA.action?.name}" to "${stepB.action?.name}"`,
      });
    } else if (aPassed === bPassed) {
      unchangedCount++;
    }
  }

  return { newFailures, fixedIssues, planChanges, unchangedCount };
}

// ── Route ────────────────────────────────────────────────────────────

export async function compareRoutes(server: FastifyInstance) {
  server.post('/tasks/compare', async (request, reply) => {
    const parseResult = CompareBodySchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Validation failed',
        details: parseResult.error.issues,
      };
    }

    const { taskIds } = parseResult.data;

    // Fetch both tasks
    const taskA = server.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(taskIds[0]) as Record<string, unknown> | undefined;
    const taskB = server.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(taskIds[1]) as Record<string, unknown> | undefined;

    if (!taskA) {
      reply.code(404);
      return { error: `Task not found: ${taskIds[0]}` };
    }
    if (!taskB) {
      reply.code(404);
      return { error: `Task not found: ${taskIds[1]}` };
    }

    // Fetch steps for both tasks
    const stepsA = server.db
      .prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_index')
      .all(taskIds[0]) as Array<Record<string, unknown>>;
    const stepsB = server.db
      .prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_index')
      .all(taskIds[1]) as Array<Record<string, unknown>>;

    const mappedA = stepsA.map(dbRowToStep);
    const mappedB = stepsB.map(dbRowToStep);

    // Build step info for diff
    const stepInfosA: StepInfo[] = mappedA.map((s) => ({
      phase: s.phase,
      status: s.status,
      stepIndex: s.stepIndex,
      action: s.action as StepInfo['action'],
    }));
    const stepInfosB: StepInfo[] = mappedB.map((s) => ({
      phase: s.phase,
      status: s.status,
      stepIndex: s.stepIndex,
      action: s.action as StepInfo['action'],
    }));

    const diff = computeDiff(stepInfosA, stepInfosB);

    return {
      taskA: dbRowToTask(taskA),
      taskB: dbRowToTask(taskB),
      stepsA: mappedA,
      stepsB: mappedB,
      diff,
    };
  });
}
