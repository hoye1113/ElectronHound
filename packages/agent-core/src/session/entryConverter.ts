/**
 * Entry Converter — bridges SessionEntry[] (from SessionManager) to StepRecord[] (from shared-types).
 *
 * AgentLoop writes session entries in a deterministic 4-entry-per-step pattern:
 *   Index 0:        role='user',  type='user'      — task prompt
 *   Index 1+4N:     role='assistant', type='assistant' — observe phase (JSON Observation)
 *   Index 2+4N:     role='assistant', type='assistant' — plan phase (JSON Plan)
 *   Index 3+4N:     role='system',    type='system'    — execute phase (JSON ExecutionResult)
 *   Index 4+4N:     role='assistant', type='assistant' — verify phase (JSON Verdict)
 *
 * This module converts that pattern into StepRecord[] for downstream consumption.
 */

import type { SessionEntry } from './types.js';
import type { StepRecord } from '@eata/shared-types';
import type { Observation, Plan, ExecutionResult } from '../runtime/types.js';
import { fingerprintObservation } from '../runtime/stuckDetection.js';
import { toErrorMessage } from '../utils/error.js';
import { createStderrLogger } from '../utils/logger.js';

const logger = createStderrLogger('entryConverter');

// ── Verdict → StepStatus mapping ────────────────────────────────────────────

const VERDICT_TO_STATUS: Record<string, StepRecord['status']> = {
  pass: 'success',
  retry: 'retry',
  fail: 'failed',
  stuck: 'failed',
};

// ── Type guards ─────────────────────────────────────────────────────────────

function isObservation(value: unknown): value is Observation {
  return (
    typeof value === 'object' &&
    value !== null &&
    'summary' in value &&
    'details' in value &&
    'timestamp' in value &&
    typeof (value as Observation).summary === 'string' &&
    typeof (value as Observation).timestamp === 'string'
  );
}

function isPlan(value: unknown): value is Plan {
  return (
    typeof value === 'object' &&
    value !== null &&
    'reasoning' in value &&
    'action' in value &&
    'toolName' in value &&
    'toolArgs' in value &&
    'expectedOutcome' in value
  );
}

function isExecutionResult(value: unknown): value is ExecutionResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    'result' in value &&
    typeof (value as ExecutionResult).success === 'boolean'
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function calculateDurationMs(observeTs: string, verifyTs: string): number {
  const start = Date.parse(observeTs);
  const end = Date.parse(verifyTs);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return 0;
  }
  return end - start;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Artifact paths for a single step — screenshot and/or accessibility snapshot.
 */
export interface StepArtifactPath {
  screenshotPath?: string;
  accessibilitySnapshotPath?: string;
}

/**
 * Convert session entries to StepRecords.
 *
 * Follows the deterministic 4-entry-per-step pattern written by AgentLoop.
 * Skips entries[0] (user prompt), groups remaining in chunks of 4, and
 * drops any incomplete trailing chunk (e.g. loop terminated mid-step).
 *
 * @param entries - All session entries from SessionManager.getSession()
 * @param taskId  - The task ID to embed in each StepRecord
 * @param stepArtifactPaths - Optional map of stepIndex → screenshot/accessibility paths
 * @returns Ordered StepRecord array
 */
export function entriesToStepRecords(
  entries: SessionEntry[],
  taskId: string,
  stepArtifactPaths?: Map<number, StepArtifactPath>,
): StepRecord[] {
  // Need at least 1 (user) + 4 (one full step) entries
  if (entries.length < 5) {
    return [];
  }

  // Skip the user prompt at index 0
  const stepEntries = entries.slice(1);

  // Group into chunks of 4: [observe, plan, execute, verify]
  const steps: StepRecord[] = [];
  for (let i = 0; i + 3 < stepEntries.length; i += 4) {
    const chunk = stepEntries.slice(i, i + 4) as [
      SessionEntry, // observe
      SessionEntry, // plan
      SessionEntry, // execute
      SessionEntry, // verify
    ];
    const artifacts = stepArtifactPaths?.get(steps.length);
    const step = buildStepRecord(
      chunk,
      taskId,
      steps.length,
      artifacts?.screenshotPath,
      artifacts?.accessibilitySnapshotPath,
    );
    if (step) {
      steps.push(step);
    }
  }

  return steps;
}

/**
 * Extract the last complete step's typed data for RunTestResult fields.
 *
 * Parses the observation/action/result fields from the last StepRecord
 * back into their typed forms (Observation, Plan, ExecutionResult).
 *
 * @param steps - StepRecords from entriesToStepRecords
 * @returns Object with observation, plan, execution, and observationHash
 */
export function extractLastStep(steps: StepRecord[]): {
  observation: Observation | null;
  plan: Plan | null;
  execution: ExecutionResult | null;
  observationHash: string;
} {
  if (steps.length === 0) {
    return {
      observation: null,
      plan: null,
      execution: null,
      observationHash: '',
    };
  }

  const last = steps[steps.length - 1];

  // Parse observation from the stringified field
  let observation: Observation | null = null;
  if (last.observation) {
    try {
      const parsed: unknown = JSON.parse(last.observation);
      if (isObservation(parsed)) {
        observation = parsed;
      }
    } catch (err: unknown) {
      // JSON parse failure — leave observation as null
      logger.warn(`extractLastStep observation parse: ${toErrorMessage(err)}`);
    }
  }

  // Reconstruct plan from action + reasoning fields
  let plan: Plan | null = null;
  if (last.action && last.reasoning) {
    const candidate: Plan = {
      reasoning: last.reasoning,
      action: '', // Not stored separately in StepRecord
      toolName: last.action.name,
      toolArgs: last.action.args,
      expectedOutcome: '', // Not stored in StepRecord
    };
    if (isPlan(candidate)) {
      plan = candidate;
    }
  }

  // Parse execution result from the result field
  let execution: ExecutionResult | null = null;
  if (last.result !== undefined && last.result !== null) {
    if (isExecutionResult(last.result)) {
      execution = last.result;
    }
  }

  // Compute observation fingerprint
  const observationHash = observation
    ? fingerprintObservation(observation)
    : '';

  return { observation, plan, execution, observationHash };
}

// ── Internal ────────────────────────────────────────────────────────────────

/**
 * Build a single StepRecord from a 4-entry chunk [observe, plan, execute, verify].
 * Returns null if the chunk is malformed and cannot be parsed at all.
 *
 * @param screenshotPath - Optional path to a screenshot file captured during this step
 * @param accessibilitySnapshotPath - Optional path to an accessibility tree snapshot file
 */
function buildStepRecord(
  chunk: [SessionEntry, SessionEntry, SessionEntry, SessionEntry],
  taskId: string,
  stepIndex: number,
  screenshotPath?: string,
  accessibilitySnapshotPath?: string,
): StepRecord | null {
  const [observeEntry, planEntry, execEntry, verifyEntry] = chunk;

  // Verify the expected phase types
  if (
    observeEntry.type !== 'assistant' ||
    planEntry.type !== 'assistant' ||
    execEntry.type !== 'system' ||
    verifyEntry.type !== 'assistant'
  ) {
    return null;
  }

  // Parse JSON payloads
  let observationData: Observation | null = null;
  let planData: Plan | null = null;
  let execData: ExecutionResult | null = null;
  let verdictData: { verdict: string; reasoning: string } | null = null;

  try {
    const obsParsed: unknown = JSON.parse(observeEntry.content);
    if (isObservation(obsParsed)) {
      observationData = obsParsed;
    }
  } catch (err: unknown) {
    // JSON parse failure — observe entry is not valid JSON, continue with nulls
    logger.warn(`observe entry parse: ${toErrorMessage(err)}`);
  }

  try {
    const planParsed: unknown = JSON.parse(planEntry.content);
    if (isPlan(planParsed)) {
      planData = planParsed;
    }
  } catch (err: unknown) {
    // JSON parse failure — plan entry is not valid JSON
    logger.warn(`plan entry parse: ${toErrorMessage(err)}`);
  }

  try {
    const execParsed: unknown = JSON.parse(execEntry.content);
    if (isExecutionResult(execParsed)) {
      execData = execParsed;
    }
  } catch (err: unknown) {
    // JSON parse failure — execute entry is not valid JSON
    logger.warn(`execute entry parse: ${toErrorMessage(err)}`);
  }

  try {
    const verdictParsed: unknown = JSON.parse(verifyEntry.content);
    if (
      typeof verdictParsed === 'object' &&
      verdictParsed !== null &&
      'verdict' in verdictParsed &&
      'reasoning' in verdictParsed
    ) {
      verdictData = verdictParsed as { verdict: string; reasoning: string };
    }
  } catch (err: unknown) {
    // JSON parse failure — verify entry is not valid JSON
    logger.warn(`verify entry parse: ${toErrorMessage(err)}`);
  }

  // If we couldn't parse any data, still create a minimal record
  const verdictValue = verdictData?.verdict ?? 'fail';
  const status: StepRecord['status'] =
    VERDICT_TO_STATUS[verdictValue] ?? 'failed';

  const duration = calculateDurationMs(
    observeEntry.timestamp,
    verifyEntry.timestamp,
  );

  // Store plan reasoning (not verdict reasoning) so extractLastStep can
  // reconstruct the original Plan object.  The verdict reasoning is
  // implicitly captured in the status field.
  return {
    id: crypto.randomUUID(),
    taskId,
    stepIndex,
    phase: 'verify',
    status,
    observation: observationData
      ? JSON.stringify(observationData)
      : undefined,
    action: planData
      ? { name: planData.toolName, args: planData.toolArgs }
      : undefined,
    result: execData ?? undefined,
    reasoning: planData?.reasoning,
    screenshotPath: screenshotPath || undefined,
    accessibilitySnapshotPath: accessibilitySnapshotPath || undefined,
    timestamp: verifyEntry.timestamp,
    duration,
  };
}
