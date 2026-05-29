import { z } from 'zod';

const FewShotStepSchema = z.object({
  action: z.string().min(1),
  observation: z.string().min(1),
});

const FewShotMetadataSchema = z.object({
  tags: z.array(z.string()),
  domain: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
});

export const CreateFewShotSchema = z.object({
  id: z.string().optional(),
  goal: z.string().min(1, 'Goal is required'),
  steps: z.array(FewShotStepSchema).min(1, 'At least one step is required'),
  expectedResult: z.string().min(1, 'Expected result is required'),
  metadata: FewShotMetadataSchema,
});

export const UpdateFewShotSchema = z.object({
  goal: z.string().min(1).optional(),
  steps: z.array(FewShotStepSchema).min(1).optional(),
  expectedResult: z.string().min(1).optional(),
  metadata: FewShotMetadataSchema.optional(),
});

export const FewShotFiltersSchema = z.object({
  search: z.string().optional(),
  domain: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

export const MigrateFewShotSchema = z.object({
  examples: z.array(CreateFewShotSchema).max(500),
});

export type CreateFewShotInput = z.infer<typeof CreateFewShotSchema>;
export type UpdateFewShotInput = z.infer<typeof UpdateFewShotSchema>;
export type FewShotFilters = z.infer<typeof FewShotFiltersSchema>;
