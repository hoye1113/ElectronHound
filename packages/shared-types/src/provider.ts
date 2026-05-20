import { z } from 'zod';

// ============================================================================
// Provider Zod Schemas
// ============================================================================

export const LLMProviderTypeSchema = z.literal('openai-compatible');

export const LLMProviderConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: LLMProviderTypeSchema,
  apiKey: z.string().min(1, { message: 'API key cannot be empty' }),
  baseURL: z.string().url(),
  model: z.string().min(1),
  enabled: z.boolean().optional().default(true),
});

export const CreateProviderSchema = LLMProviderConfigSchema.omit({ id: true }).extend({
  id: z.string().min(1).optional(),
});

export const UpdateProviderSchema = CreateProviderSchema.partial();

// Export types for TypeScript
export type LLMProviderConfig = z.infer<typeof LLMProviderConfigSchema>;
export type CreateProviderRequest = z.infer<typeof CreateProviderSchema>;
export type UpdateProviderRequest = z.infer<typeof UpdateProviderSchema>;
