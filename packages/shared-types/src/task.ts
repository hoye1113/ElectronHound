import { z } from 'zod/v4';

export const TaskStatusEnum = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'aborted',
]);

export const TaskPriorityEnum = z.enum(['high', 'medium', 'low']);

export const CreateTaskRequestSchema = z.object({
  goal: z.string().min(1),
  targetAppPath: z.string().min(1),
  llmModel: z.enum(['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet']),
  maxSteps: z.number().int().positive().default(50).optional(),
  contextInjection: z.string().optional(),
  providerId: z.string().optional(),
  priority: TaskPriorityEnum.default('medium'),
});

export const TaskSchema = z.object({
  id: z.uuid(),
  goal: z.string().min(1),
  targetAppPath: z.string().min(1),
  llmModel: z.enum(['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet']),
  status: TaskStatusEnum,
  priority: TaskPriorityEnum.default('medium'),
  maxSteps: z.number().int(),
  providerId: z.string().optional(),
  contextInjection: z.string().optional(),
  stepCount: z.number().int(),
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
export type TaskPriority = z.infer<typeof TaskPriorityEnum>;
export type Task = z.infer<typeof TaskSchema>;
