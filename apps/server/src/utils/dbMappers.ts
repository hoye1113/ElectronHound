/**
 * Shared database row mapping utilities.
 *
 * Centralises the repetitive Record<string, unknown> → typed-object
 * conversions used by both task and report route handlers.
 */
import { TaskStatusEnum, type Task, type StepRecord } from '@eata/shared-types';

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Safely parse a JSON string, returning `undefined` on failure.
 * Accepts `null` / `undefined` inputs and returns `undefined`.
 */
export function safeJsonParse(value: unknown): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value as string);
  } catch {
    return undefined;
  }
}

/**
 * Convert a `null`-able value to `undefined`.
 * Useful for optional DB columns that may be `null` or `''`.
 */
function nullish<T>(value: T | null | undefined): T | undefined {
  return value == null ? undefined : value;
}

// ── Row Mappers ─────────────────────────────────────────────────────

/**
 * Map a raw SQLite `tasks` row to a typed `Task` object.
 *
 * @throws {z.ZodError} if `row.status` is not a valid `TaskStatus`.
 */
export function dbRowToTask(row: Record<string, unknown>): Task {
  const status = TaskStatusEnum.parse(row.status);
  return {
    id: String(row.id),
    goal: String(row.goal),
    targetAppPath: String(row.target_app_path),
    llmModel: row.llm_model as Task['llmModel'],
    status,
    maxSteps: Number(row.max_steps),
    providerId: nullish(row.provider_id as string | null),
    contextInjection: nullish(row.context_injection as string | null),
    stepCount: Number(row.step_count),
    resultSummary: safeJsonParse(row.result_summary) as Task['resultSummary'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Map a raw SQLite `steps` row to a typed `StepRecord` object.
 */
export function dbRowToStep(row: Record<string, unknown>): StepRecord {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    stepIndex: Number(row.step_index),
    phase: row.phase as StepRecord['phase'],
    status: row.status as StepRecord['status'],
    observation: nullish(row.observation as string | null),
    action: safeJsonParse(row.action) as StepRecord['action'],
    result: safeJsonParse(row.result),
    reasoning: nullish(row.reasoning as string | null),
    screenshotPath: nullish(row.screenshot_path as string | null),
    accessibilitySnapshotPath: nullish(row.accessibility_snapshot_path as string | null),
    timestamp: String(row.timestamp),
    duration: Number(row.duration),
  };
}
