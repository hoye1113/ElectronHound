import { z } from 'zod/v4';

export const TaskStatusEnum = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'aborted',
]);

export const CreateTaskRequestSchema = z.object({
  goal: z.string().min(1),
  targetAppPath: z.string().min(1),
  llmModel: z.enum(['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet']),
  maxSteps: z.number().int().positive().default(50).optional(),
  contextInjection: z.string().optional(),
});

export const TaskSchema = z.object({
  id: z.uuid(),
  goal: z.string().min(1),
  targetAppPath: z.string().min(1),
  llmModel: z.enum(['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet']),
  status: TaskStatusEnum,
  maxSteps: z.number().int().positive(),
  contextInjection: z.string().optional(),
  stepCount: z.number().int().nonnegative(),
  resultSummary: z
    .object({
      success: z.boolean(),
      summary: z.string(),
      error: z.string().optional(),
    })
    .optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;
export type TaskStatus = z.infer<typeof TaskStatusEnum>;
export type Task = z.infer<typeof TaskSchema>;
