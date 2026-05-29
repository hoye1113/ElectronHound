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

// ── Helpers ──────────────────────────────────────────────────────────

function buildSummary(steps: StepInfo[]) {
  let passedSteps = 0;
  let failedSteps = 0;
  let retriedSteps = 0;
  let totalDuration = 0;

  for (const s of steps) {
    if (s.status === 'success') passedSteps++;
    else if (s.status === 'failed') failedSteps++;
    else if (s.status === 'retry') retriedSteps++;
    totalDuration += s.duration;
  }

  return {
    totalSteps: steps.length,
    passedSteps,
    failedSteps,
    retriedSteps,
    totalDuration,
  };
}

function buildActionFrequency(steps: StepInfo[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const s of steps) {
    if (s.phase === 'plan' && s.action?.name) {
      freq[s.action.name] = (freq[s.action.name] ?? 0) + 1;
    }
  }
  return freq;
}

interface ExtendedStepInfo extends StepInfo {
  duration: number;
}

function buildTimelineDiff(
  stepsA: ExtendedStepInfo[],
  stepsB: ExtendedStepInfo[],
) {
  const mapA = new Map(stepsA.map((s) => [s.phase + ':' + s.stepIndex, s]));
  const mapB = new Map(stepsB.map((s) => [s.phase + ':' + s.stepIndex, s]));

  const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);
  const result: Array<{
    stepIndex: number;
    phase: string;
    taskAStatus: string | null;
    taskBStatus: string | null;
    taskADuration: number;
    taskBDuration: number;
    changed: boolean;
  }> = [];

  for (const key of allKeys) {
    const a = mapA.get(key);
    const b = mapB.get(key);
    const [phase, stepIndexStr] = key.split(':');
    const stepIndex = parseInt(stepIndexStr, 10);

    const taskAStatus = a?.status ?? null;
    const taskBStatus = b?.status ?? null;

    result.push({
      stepIndex,
      phase,
      taskAStatus,
      taskBStatus,
      taskADuration: a?.duration ?? 0,
      taskBDuration: b?.duration ?? 0,
      changed: taskAStatus !== taskBStatus,
    });
  }

  // Sort by stepIndex then phase for consistent ordering
  result.sort((a, b) => {
    if (a.stepIndex !== b.stepIndex) return a.stepIndex - b.stepIndex;
    return a.phase.localeCompare(b.phase);
  });

  return result;
}

// ── Shared fetch helpers ─────────────────────────────────────────────

function fetchTasksAndSteps(
  server: FastifyInstance,
  taskIds: [string, string],
  reply: { code: (code: number) => void },
) {
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

  const stepsA = server.db
    .prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_index')
    .all(taskIds[0]) as Array<Record<string, unknown>>;
  const stepsB = server.db
    .prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_index')
    .all(taskIds[1]) as Array<Record<string, unknown>>;

  const mappedA = stepsA.map(dbRowToStep);
  const mappedB = stepsB.map(dbRowToStep);

  const stepInfosA: StepInfo[] = mappedA.map((s) => ({
    phase: s.phase,
    status: s.status,
    stepIndex: s.stepIndex,
    action: s.action as StepInfo['action'],
    duration: s.duration,
  }));
  const stepInfosB: StepInfo[] = mappedB.map((s) => ({
    phase: s.phase,
    status: s.status,
    stepIndex: s.stepIndex,
    action: s.action as StepInfo['action'],
    duration: s.duration,
  }));

  return {
    taskA: dbRowToTask(taskA),
    taskB: dbRowToTask(taskB),
    stepsA: mappedA,
    stepsB: mappedB,
    stepInfosA,
    stepInfosB,
  };
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

    const fetched = fetchTasksAndSteps(server, taskIds, reply);
    if ('error' in fetched) return fetched;

    const { taskA, taskB, stepsA, stepsB, stepInfosA, stepInfosB } = fetched;
    const diff = computeDiff(stepInfosA, stepInfosB);

    return { taskA, taskB, stepsA, stepsB, diff };
  });

  server.post('/tasks/compare/detailed', async (request, reply) => {
    const parseResult = CompareBodySchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Validation failed',
        details: parseResult.error.issues,
      };
    }

    const { taskIds } = parseResult.data;

    const fetched = fetchTasksAndSteps(server, taskIds, reply);
    if ('error' in fetched) return fetched;

    const { taskA, taskB, stepsA, stepsB, stepInfosA, stepInfosB } = fetched;
    const diff = computeDiff(stepInfosA, stepInfosB);

    const summary = {
      taskA: buildSummary(stepInfosA),
      taskB: buildSummary(stepInfosB),
    };

    const actionFrequency = {
      taskA: buildActionFrequency(stepInfosA),
      taskB: buildActionFrequency(stepInfosB),
    };

    const timelineDiff = buildTimelineDiff(
      stepInfosA as ExtendedStepInfo[],
      stepInfosB as ExtendedStepInfo[],
    );

    return {
      taskA,
      taskB,
      stepsA,
      stepsB,
      diff,
      summary,
      actionFrequency,
      timelineDiff,
    };
  });
}
