import { z } from 'zod';

export const CreateScheduleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  templateId: z.string().min(1, 'Template ID is required'),
  cronExpression: z.string().min(1, 'Cron expression is required'),
  enabled: z.boolean().optional().default(true),
});

export const UpdateScheduleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  templateId: z.string().min(1).optional(),
  cronExpression: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

export const ScheduleFiltersSchema = z.object({
  enabled: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type CreateScheduleInput = z.infer<typeof CreateScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof UpdateScheduleSchema>;
export type ScheduleFilters = z.infer<typeof ScheduleFiltersSchema>;
