import { z } from 'zod/v4';

export const FeedbackPatternSchema = z.object({
  id: z.uuid(),
  errorType: z.string().min(1),
  targetDescription: z.string().min(1),
  remediationHint: z.string().min(1),
  similarityKeywords: z.array(z.string().min(1)),
  frequency: z.number().int().positive(),
  lastSeen: z.iso.datetime(),
  relatedGoalPatterns: z.array(z.string().min(1)),
});

export type FeedbackPattern = z.infer<typeof FeedbackPatternSchema>;
