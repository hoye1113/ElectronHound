import { z } from 'zod/v4';

export const TaskStatusEnum = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'aborted',
]);

export const TaskPriorityEnum = z.enum(['low', 'medium', 'high']);

export const CreateTaskRequestSchema = z.object({
  goal: z.string().min(1),
  targetAppPath: z.string().min(1),
  llmModel: z.string().min(1),
  maxSteps: z.number().int().positive().default(50).optional(),
  contextInjection: z.string().optional(),
  providerId: z.string().optional(),
  priority: TaskPriorityEnum.default('medium').optional(),
});

export const TaskSchema = z.object({
  id: z.uuid(),
  goal: z.string().min(1),
  targetAppPath: z.string().min(1),
  llmModel: z.string().min(1),
  status: TaskStatusEnum,
  maxSteps: z.number().int(),
  providerId: z.string().optional(),
  contextInjection: z.string().optional(),
  stepCount: z.number().int(),
  priority: TaskPriorityEnum.default('medium').optional(),
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
