/**
 * Zod validation schemas for Report Template API.
 */
import { z } from 'zod';

const ReportSectionTypeEnum = z.enum([
  'summary',
  'steps',
  'screenshots',
  'errors',
  'performance',
  'suggestions',
  'raw',
]);

export const ReportSectionSchema = z.object({
  id: z.string().min(1),
  type: ReportSectionTypeEnum,
  title: z.string().min(1).max(200),
  enabled: z.boolean(),
  order: z.number().int().min(0),
  config: z.record(z.unknown()).optional(),
});

export const ReportThemeEnum = z.enum(['light', 'dark', 'auto']);

export const ReportStylingSchema = z.object({
  theme: ReportThemeEnum,
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color (e.g. #3b82f6)'),
  logoUrl: z.string().url().optional(),
  companyName: z.string().max(200).optional(),
  footerText: z.string().max(500).optional(),
});

export const CreateReportTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  sections: z.array(ReportSectionSchema).min(1, 'At least one section is required'),
  styling: ReportStylingSchema,
});

export const UpdateReportTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  sections: z.array(ReportSectionSchema).min(1).optional(),
  styling: ReportStylingSchema.optional(),
  isDefault: z.boolean().optional(),
});

export const GenerateReportSchema = z.object({
  templateId: z.string().uuid().optional(),
});

export type CreateReportTemplateInput = z.infer<typeof CreateReportTemplateSchema>;
export type UpdateReportTemplateInput = z.infer<typeof UpdateReportTemplateSchema>;
export type GenerateReportInput = z.infer<typeof GenerateReportSchema>;
