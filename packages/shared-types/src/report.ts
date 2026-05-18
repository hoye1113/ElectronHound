import { z } from 'zod/v4';
import { StepStatusEnum, StepPhaseEnum } from './step.js';

export const ManifestSchema = z.object({
  taskId: z.uuid(),
  goal: z.string(),
  status: z.enum(['completed', 'failed', 'cancelled', 'aborted']),
  totalSteps: z.number().int().nonnegative(),
  passedSteps: z.number().int().nonnegative(),
  failedSteps: z.number().int().nonnegative(),
  retriedSteps: z.number().int().nonnegative(),
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime(),
  totalDuration: z.number().nonnegative(),
});

export const TimelineEntrySchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  phase: StepPhaseEnum,
  status: StepStatusEnum,
  action: z.string(),
  resultSummary: z.string(),
  timestamp: z.iso.datetime(),
  duration: z.number().nonnegative(),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;
