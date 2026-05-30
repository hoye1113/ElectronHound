import { z } from 'zod/v4';
import type { StepRecord } from './step.js';

/**
 * Maestro Node schema - represents a test node in the recastory-maestro framework.
 */
export const MaestroNodeSchema = z.object({
  /** Node type identifier */
  type: z.string(),
  /** Command or action to execute */
  command: z.string(),
  /** Result of the command execution */
  result: z.unknown().optional(),
  /** Additional metadata for the node */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type MaestroNode = z.infer<typeof MaestroNodeSchema>;

/**
 * Maestro Node status mapping from EATA StepStatus
 */
export const MaestroStatusMap = {
  success: 'passed',
  retry: 'retried',
  failed: 'failed',
  skipped: 'skipped',
} as const;

/**
 * Reverse mapping from maestro status back to EATA StepStatus
 */
export const EataStatusMap = {
  passed: 'success',
  retried: 'retry',
  failed: 'failed',
  skipped: 'skipped',
} as const;

/**
 * Maestro phase mapping from EATA StepPhase
 */
export const MaestroPhaseMap = {
  observe: 'observation',
  plan: 'planning',
  execute: 'execution',
  verify: 'verification',
} as const;

/**
 * Reverse mapping from maestro phase back to EATA StepPhase
 */
export const EataPhaseMap = {
  observation: 'observe',
  planning: 'plan',
  execution: 'execute',
  verification: 'verify',
} as const;

/**
 * Convert an EATA StepRecord to a maestro Node.
 *
 * Field mappings:
 * - action.name → command
 * - observation → result (when available)
 * - phase → type (mapped via MaestroPhaseMap)
 * - status, reasoning, duration, etc. → metadata
 */
export function convertStepToNode(step: StepRecord): MaestroNode {
  const command = step.action?.name ?? step.phase;
  const result = step.observation ?? step.result;

  const metadata: Record<string, unknown> = {
    eataStepId: step.id,
    eataTaskId: step.taskId,
    stepIndex: step.stepIndex,
    phase: MaestroPhaseMap[step.phase] ?? step.phase,
    status: MaestroStatusMap[step.status] ?? step.status,
    timestamp: step.timestamp,
    duration: step.duration,
  };

  if (step.reasoning) {
    metadata.reasoning = step.reasoning;
  }

  if (step.action?.args) {
    metadata.args = step.action.args;
  }

  if (step.screenshotPath) {
    metadata.screenshotPath = step.screenshotPath;
  }

  if (step.accessibilitySnapshotPath) {
    metadata.accessibilitySnapshotPath = step.accessibilitySnapshotPath;
  }

  return {
    type: MaestroPhaseMap[step.phase] ?? step.phase,
    command,
    result,
    metadata,
  };
}

/**
 * Convert a maestro Node back to an EATA StepRecord.
 *
 * Note: Some fields will have default values since maestro Nodes
 * don't contain all the same information as EATA StepRecords.
 */
export function convertNodeToStep(node: MaestroNode): StepRecord {
  const metadata = node.metadata ?? {};

  // Extract phase from type, reverse-mapping if possible
  const maestroPhase = node.type;
  const phase = (EataPhaseMap[maestroPhase as keyof typeof EataPhaseMap] ?? maestroPhase) as StepRecord['phase'];

  // Extract status from metadata
  const maestroStatus = metadata.status as string | undefined;
  const status = (maestroStatus && EataStatusMap[maestroStatus as keyof typeof EataStatusMap]
    ? EataStatusMap[maestroStatus as keyof typeof EataStatusMap]
    : 'success') as StepRecord['status'];

  return {
    id: (metadata.eataStepId as string) ?? crypto.randomUUID(),
    taskId: (metadata.eataTaskId as string) ?? crypto.randomUUID(),
    stepIndex: (metadata.stepIndex as number) ?? 0,
    phase,
    status,
    observation: typeof node.result === 'string' ? node.result : undefined,
    action: {
      name: node.command,
      args: (metadata.args as Record<string, unknown>) ?? {},
    },
    result: node.result,
    reasoning: metadata.reasoning as string | undefined,
    screenshotPath: metadata.screenshotPath as string | undefined,
    accessibilitySnapshotPath: metadata.accessibilitySnapshotPath as string | undefined,
    timestamp: (metadata.timestamp as string) ?? new Date().toISOString(),
    duration: (metadata.duration as number) ?? 0,
  };
}
