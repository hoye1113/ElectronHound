/**
 * Zod validation schemas for Batch Testing API.
 */
import { z } from 'zod';

// ── Enums ────────────────────────────────────────────────────────────

export const BatchStatusEnum = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export const BatchPriorityEnum = z.enum([
  'low',
  'medium',
  'high',
]);

// ── Batch Task Item ──────────────────────────────────────────────────

export const BatchTaskItemSchema = z.object({
  goal: z.string().min(1, 'Goal is required'),
  config: z.object({
    targetAppPath: z.string().min(1).optional(),
    llmModel: z.enum(['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet']).optional(),
    maxSteps: z.number().int().positive().optional(),
    contextInjection: z.string().optional(),
    providerId: z.string().optional(),
  }).optional(),
});

// ── Request Schemas ──────────────────────────────────────────────────

export const CreateBatchSchema = z.object({
  name: z.string().max(200).optional(),
  tasks: z.array(BatchTaskItemSchema).min(1, 'At least one task is required').max(100, 'Maximum 100 tasks per batch'),
  priority: BatchPriorityEnum.default('medium'),
});

export const BatchIdSchema = z.object({
  batchId: z.string().uuid('Invalid batch ID format'),
});

// ── Response Schemas ─────────────────────────────────────────────────

export const BatchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  status: BatchStatusEnum,
  totalTasks: z.number().int(),
  completedTasks: z.number().int(),
  failedTasks: z.number().int(),
  priority: BatchPriorityEnum,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const BatchWithTasksSchema = BatchSchema.extend({
  tasks: z.array(z.object({
    id: z.string().uuid(),
    goal: z.string(),
    status: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
  progress: z.number().min(0).max(100),
});

// ── Type Exports ─────────────────────────────────────────────────────

export type BatchStatus = z.infer<typeof BatchStatusEnum>;
export type BatchPriority = z.infer<typeof BatchPriorityEnum>;
export type BatchTaskItem = z.infer<typeof BatchTaskItemSchema>;
export type CreateBatchInput = z.infer<typeof CreateBatchSchema>;
export type BatchIdParam = z.infer<typeof BatchIdSchema>;
export type Batch = z.infer<typeof BatchSchema>;
export type BatchWithTasks = z.infer<typeof BatchWithTasksSchema>;
