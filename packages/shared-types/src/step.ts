import { z } from 'zod/v4';

export const StepPhaseEnum = z.enum(['observe', 'plan', 'execute', 'verify']);

export const StepStatusEnum = z.enum(['success', 'retry', 'failed', 'skipped']);

export const StepRecordSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  stepIndex: z.number().int().nonnegative(),
  phase: StepPhaseEnum,
  status: StepStatusEnum,
  observation: z.string().optional(),
  action: z
    .object({
      name: z.string(),
      args: z.record(z.string(), z.unknown()),
    })
    .optional(),
  result: z.unknown().optional(),
  reasoning: z.string().optional(),
  screenshotPath: z.string().optional(),
  accessibilitySnapshotPath: z.string().optional(),
  timestamp: z.iso.datetime(),
  duration: z.number().nonnegative(),
});

export type StepPhase = z.infer<typeof StepPhaseEnum>;
export type StepStatus = z.infer<typeof StepStatusEnum>;
export type StepRecord = z.infer<typeof StepRecordSchema>;
