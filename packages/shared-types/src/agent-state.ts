import { z } from 'zod/v4';

export const ObservationResultSchema = z.object({
  ariaTree: z.string(),
  pageTitle: z.string(),
  url: z.string(),
  timestamp: z.iso.datetime(),
});

export const PlanResultSchema = z.object({
  reasoning: z.string(),
  toolCall: z.object({
    name: z.string(),
    args: z.record(z.string(), z.unknown()),
  }),
  expectedOutcome: z.string(),
});

export const ExecResultSchema = z.object({
  success: z.boolean(),
  result: z.unknown(),
  screenshot: z.string().optional(),
});

export const VerdictResultSchema = z.object({
  verdict: z.enum(['pass', 'retry', 'fail', 'escalate']),
  reasoning: z.string(),
});

export const SafetyReportSchema = z.object({
  riskLevel: z.enum(['none', 'low', 'medium', 'high']),
  findings: z.array(
    z.object({
      category: z.string(),
      description: z.string(),
      severity: z.string(),
    })
  ),
});

export const PerformanceReportSchema = z.object({
  avgStepDuration: z.number().nonnegative(),
  slowSteps: z.array(
    z.object({
      stepIndex: z.number().int().nonnegative(),
      duration: z.number().nonnegative(),
      phase: z.string(),
    })
  ),
  retryCount: z.number().int().nonnegative(),
  stuckDetected: z.boolean(),
});

export const AccessibilityReportSchema = z.object({
  issues: z.array(
    z.object({
      type: z.string(),
      element: z.string(),
      description: z.string(),
      severity: z.string(),
    })
  ),
  wcagLevel: z.enum(['A', 'AA', 'AAA', 'none']),
});

export type ObservationResult = z.infer<typeof ObservationResultSchema>;
export type PlanResult = z.infer<typeof PlanResultSchema>;
export type ExecResult = z.infer<typeof ExecResultSchema>;
export type VerdictResult = z.infer<typeof VerdictResultSchema>;
export type SafetyReport = z.infer<typeof SafetyReportSchema>;
export type PerformanceReport = z.infer<typeof PerformanceReportSchema>;
export type AccessibilityReport = z.infer<typeof AccessibilityReportSchema>;
