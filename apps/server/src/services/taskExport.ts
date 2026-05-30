/**
 * Task Export/Import Service (PR-8)
 *
 * Provides JSONL-based export/import of tasks and steps for sharing
 * test assets between environments or version control.
 *
 * JSONL format (one JSON object per line):
 *   {"type":"task","data":{"id":"...","goal":"...","status":"...",...}}
 *   {"type":"step","data":{"step_number":0,"action":"...","observation":"...",...}}
 */
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { dbRowToTask, dbRowToStep } from '../utils/dbMappers.js';

// ── Types ────────────────────────────────────────────────────────────

interface JSONLTaskData {
  id: string;
  goal: string;
  target_app_path: string;
  llm_model: string;
  status: string;
  max_steps: number;
  step_count: number;
  result_summary?: string | null;
  context_injection?: string | null;
  provider_id?: string | null;
  created_at: string;
  updated_at: string;
}

interface JSONLStepData {
  step_number: number;
  phase: string;
  status: string;
  observation?: string | null;
  action?: Record<string, unknown> | null;
  result?: unknown;
  reasoning?: string | null;
  screenshot_path?: string | null;
  accessibility_snapshot_path?: string | null;
  timestamp: string;
  duration: number;
}

interface JSONLLine {
  type: 'task' | 'step';
  data: JSONLTaskData | JSONLStepData;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ImportResult {
  taskId: string;
  stepCount: number;
}

// ── Export ────────────────────────────────────────────────────────────

/**
 * Export a task and its steps as JSONL content.
 *
 * @param db - Database connection
 * @param taskId - ID of the task to export
 * @returns JSONL string (one JSON object per line)
 * @throws {Error} if task not found
 */
export function exportTaskToJSONL(db: Database.Database, taskId: string): string {
  const taskRow = db
    .prepare('SELECT * FROM tasks WHERE id = ?')
    .get(taskId) as Record<string, unknown> | undefined;

  if (!taskRow) {
    throw new Error('Task not found');
  }

  const task = dbRowToTask(taskRow);

  const stepRows = db
    .prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_index')
    .all(taskId) as Array<Record<string, unknown>>;
  const steps = stepRows.map(dbRowToStep);

  const lines: string[] = [];

  // Task line
  const taskData: JSONLTaskData = {
    id: task.id,
    goal: task.goal,
    target_app_path: task.targetAppPath,
    llm_model: task.llmModel,
    status: task.status,
    max_steps: task.maxSteps,
    step_count: task.stepCount,
    result_summary: task.resultSummary ? JSON.stringify(task.resultSummary) : null,
    context_injection: task.contextInjection ?? null,
    provider_id: task.providerId ?? null,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
  lines.push(JSON.stringify({ type: 'task', data: taskData }));

  // Step lines
  for (const step of steps) {
    const stepData: JSONLStepData = {
      step_number: step.stepIndex,
      phase: step.phase,
      status: step.status,
      observation: step.observation ?? null,
      action: step.action as Record<string, unknown> | null ?? null,
      result: step.result ?? null,
      reasoning: step.reasoning ?? null,
      screenshot_path: step.screenshotPath ?? null,
      accessibility_snapshot_path: step.accessibilitySnapshotPath ?? null,
      timestamp: step.timestamp,
      duration: step.duration,
    };
    lines.push(JSON.stringify({ type: 'step', data: stepData }));
  }

  return lines.join('\n') + '\n';
}

// ── Validation ────────────────────────────────────────────────────────

/**
 * Validate JSONL content structure.
 *
 * Checks:
 * - Each line is valid JSON
 * - Each line has a `type` field ("task" or "step")
 * - Each line has a `data` field
 * - A task line appears before any step lines
 *
 * @param jsonl - JSONL content string
 * @returns Validation result with errors list
 */
export function validateJSONL(jsonl: string): ValidationResult {
  const errors: string[] = [];

  if (!jsonl || jsonl.trim().length === 0) {
    errors.push('JSONL content is empty');
    return { valid: false, errors };
  }

  const lines = jsonl.trim().split('\n');
  let hasTaskLine = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i].trim();

    if (!line) continue; // skip blank lines

    // Parse JSON
    let obj: JSONLLine;
    try {
      obj = JSON.parse(line) as JSONLLine;
    } catch {
      errors.push(`line ${lineNum}: invalid JSON`);
      continue;
    }

    // Check type field
    if (!obj.type) {
      errors.push(`line ${lineNum}: missing "type" field`);
      continue;
    }

    if (obj.type !== 'task' && obj.type !== 'step') {
      errors.push(`line ${lineNum}: invalid "type" value "${obj.type}", expected "task" or "step"`);
      continue;
    }

    // Check data field
    if (!obj.data) {
      errors.push(`line ${lineNum}: missing "data" field`);
      continue;
    }

    // Task must come before steps
    if (obj.type === 'task') {
      hasTaskLine = true;
    } else if (obj.type === 'step' && !hasTaskLine) {
      errors.push(`line ${lineNum}: "step" line found before "task" line`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Import ────────────────────────────────────────────────────────────

/**
 * Import a task and its steps from JSONL content.
 *
 * If the task ID already exists in the database, a new UUID is generated
 * to avoid conflicts.
 *
 * @param db - Database connection
 * @param jsonl - JSONL content string
 * @returns Import result with task ID and step count
 * @throws {Error} if JSONL is invalid or has no task line
 */
export function importTaskFromJSONL(
  db: Database.Database,
  jsonl: string,
): ImportResult {
  const validation = validateJSONL(jsonl);
  if (!validation.valid) {
    throw new Error(`Invalid JSONL: ${validation.errors.join('; ')}`);
  }

  const lines = jsonl.trim().split('\n').filter((l) => l.trim());
  let taskData: JSONLTaskData | null = null;
  const stepDataList: JSONLStepData[] = [];

  for (const line of lines) {
    const obj = JSON.parse(line.trim()) as JSONLLine;
    if (obj.type === 'task') {
      taskData = obj.data as JSONLTaskData;
    } else if (obj.type === 'step') {
      stepDataList.push(obj.data as JSONLStepData);
    }
  }

  if (!taskData) {
    throw new Error('Invalid JSONL: no task line found');
  }

  // Handle duplicate IDs: generate new UUID if task already exists
  let taskId = taskData.id;
  const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
  if (existing) {
    taskId = randomUUID();
  }

  // Insert task
  db.prepare(
    `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, result_summary, context_injection, provider_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    taskId,
    taskData.goal,
    taskData.target_app_path,
    taskData.llm_model,
    taskData.status,
    taskData.max_steps,
    taskData.step_count,
    taskData.result_summary ?? null,
    taskData.context_injection ?? null,
    taskData.provider_id ?? null,
    taskData.created_at,
    taskData.updated_at,
  );

  // Insert steps
  for (const stepData of stepDataList) {
    const stepId = randomUUID();
    db.prepare(
      `INSERT INTO steps (id, task_id, step_index, phase, status, observation, action, result, reasoning, screenshot_path, accessibility_snapshot_path, timestamp, duration)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      stepId,
      taskId,
      stepData.step_number,
      stepData.phase,
      stepData.status,
      stepData.observation ?? null,
      stepData.action ? JSON.stringify(stepData.action) : null,
      stepData.result ? JSON.stringify(stepData.result) : null,
      stepData.reasoning ?? null,
      stepData.screenshot_path ?? null,
      stepData.accessibility_snapshot_path ?? null,
      stepData.timestamp,
      stepData.duration,
    );
  }

  return {
    taskId,
    stepCount: stepDataList.length,
  };
}
