import { z } from 'zod';

const TemplateCategory = z.enum([
  'login',
  'crud',
  'form',
  'navigation',
  'file',
  'settings',
  'custom',
]);

export const CreateTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  category: TemplateCategory,
  goal: z.string().min(1, 'Goal is required'),
  config: z.record(z.unknown()).optional(),
  variables: z.array(z.string()).optional(),
});

export const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  category: TemplateCategory.optional(),
  goal: z.string().min(1).optional(),
  config: z.record(z.unknown()).optional(),
  variables: z.array(z.string()).optional(),
});

export const TemplateFiltersSchema = z.object({
  category: TemplateCategory.optional(),
  search: z.string().optional(),
});

export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;
export type TemplateFilters = z.infer<typeof TemplateFiltersSchema>;
