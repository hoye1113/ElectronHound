import { describe, it, expect } from 'vitest';
import { CreateTaskRequestSchema, TaskSchema, TaskStatusEnum } from '../task.js';
import { StepRecordSchema, StepPhaseEnum, StepStatusEnum } from '../step.js';
import { ManifestSchema, TimelineEntrySchema } from '../report.js';
import { FeedbackPatternSchema } from '../feedback.js';
import { JsonRpcNotificationSchema, JsonRpcControlSchema } from '../ipc.js';
import {
  ObservationResultSchema,
  PlanResultSchema,
  ExecResultSchema,
  VerdictResultSchema,
  SafetyReportSchema,
  PerformanceReportSchema,
  AccessibilityReportSchema,
} from '../agent-state.js';
import {
  LLMProviderConfigSchema,
  CreateProviderSchema,
  UpdateProviderSchema,
} from '../provider.js';

// ============================================================================
// Boundary Condition Tests
// ============================================================================

describe('Boundary: Empty and null values', () => {
  describe('TaskSchema', () => {
    it('rejects empty string goal', () => {
      expect(() =>
        TaskSchema.parse({
          id: '550e8400-e29b-41d4-a716-446655440000',
          goal: '',
          targetAppPath: '/app',
          llmModel: 'gpt-4o',
          status: 'queued',
          maxSteps: 50,
          stepCount: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        })
      ).toThrow();
    });

    it('rejects empty string targetAppPath', () => {
      expect(() =>
        TaskSchema.parse({
          id: '550e8400-e29b-41d4-a716-446655440000',
          goal: 'Test',
          targetAppPath: '',
          llmModel: 'gpt-4o',
          status: 'queued',
          maxSteps: 50,
          stepCount: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        })
      ).toThrow();
    });

    it('rejects null input', () => {
      expect(() => TaskSchema.parse(null)).toThrow();
    });

    it('rejects undefined input', () => {
      expect(() => TaskSchema.parse(undefined)).toThrow();
    });
  });

  describe('StepRecordSchema', () => {
    it('rejects null input', () => {
      expect(() => StepRecordSchema.parse(null)).toThrow();
    });

    it('rejects empty object', () => {
      expect(() => StepRecordSchema.parse({})).toThrow();
    });
  });

  describe('FeedbackPatternSchema', () => {
    it('rejects empty errorType', () => {
      expect(() =>
        FeedbackPatternSchema.parse({
          id: '550e8400-e29b-41d4-a716-446655440000',
          errorType: '',
          targetDescription: 'Button',
          remediationHint: 'Use testid',
          similarityKeywords: ['btn'],
          frequency: 1,
          lastSeen: '2026-01-01T00:00:00Z',
          relatedGoalPatterns: [],
        })
      ).toThrow();
    });

    it('rejects empty similarityKeywords array items', () => {
      expect(() =>
        FeedbackPatternSchema.parse({
          id: '550e8400-e29b-41d4-a716-446655440000',
          errorType: 'err',
          targetDescription: 'Button',
          remediationHint: 'Use testid',
          similarityKeywords: ['valid', ''],
          frequency: 1,
          lastSeen: '2026-01-01T00:00:00Z',
          relatedGoalPatterns: [],
        })
      ).toThrow();
    });

    it('rejects zero frequency', () => {
      expect(() =>
        FeedbackPatternSchema.parse({
          id: '550e8400-e29b-41d4-a716-446655440000',
          errorType: 'err',
          targetDescription: 'Button',
          remediationHint: 'Use testid',
          similarityKeywords: ['btn'],
          frequency: 0,
          lastSeen: '2026-01-01T00:00:00Z',
          relatedGoalPatterns: [],
        })
      ).toThrow();
    });

    it('rejects negative frequency', () => {
      expect(() =>
        FeedbackPatternSchema.parse({
          id: '550e8400-e29b-41d4-a716-446655440000',
          errorType: 'err',
          targetDescription: 'Button',
          remediationHint: 'Use testid',
          similarityKeywords: ['btn'],
          frequency: -1,
          lastSeen: '2026-01-01T00:00:00Z',
          relatedGoalPatterns: [],
        })
      ).toThrow();
    });
  });
});

describe('Boundary: Numeric edge cases', () => {
  describe('StepRecordSchema', () => {
    const validStep = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      taskId: '550e8400-e29b-41d4-a716-446655440000',
      stepIndex: 0,
      phase: 'observe' as const,
      status: 'success' as const,
      timestamp: '2026-01-01T00:00:00Z',
      duration: 0,
    };

    it('accepts zero duration', () => {
      const result = StepRecordSchema.parse(validStep);
      expect(result.duration).toBe(0);
    });

    it('accepts large duration', () => {
      const result = StepRecordSchema.parse({ ...validStep, duration: 999999999 });
      expect(result.duration).toBe(999999999);
    });

    it('rejects negative duration', () => {
      expect(() =>
        StepRecordSchema.parse({ ...validStep, duration: -1 })
      ).toThrow();
    });

    it('rejects negative stepIndex', () => {
      expect(() =>
        StepRecordSchema.parse({ ...validStep, stepIndex: -1 })
      ).toThrow();
    });

    it('accepts stepIndex of 0', () => {
      const result = StepRecordSchema.parse({ ...validStep, stepIndex: 0 });
      expect(result.stepIndex).toBe(0);
    });
  });

  describe('ManifestSchema', () => {
    const validManifest = {
      taskId: '550e8400-e29b-41d4-a716-446655440000',
      goal: 'Test',
      status: 'completed' as const,
      totalSteps: 0,
      passedSteps: 0,
      failedSteps: 0,
      retriedSteps: 0,
      startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-01T00:01:00Z',
      totalDuration: 0,
    };

    it('accepts all-zero counters', () => {
      const result = ManifestSchema.parse(validManifest);
      expect(result.totalSteps).toBe(0);
      expect(result.passedSteps).toBe(0);
    });

    it('rejects negative totalSteps', () => {
      expect(() =>
        ManifestSchema.parse({ ...validManifest, totalSteps: -1 })
      ).toThrow();
    });

    it('rejects negative totalDuration', () => {
      expect(() =>
        ManifestSchema.parse({ ...validManifest, totalDuration: -1 })
      ).toThrow();
    });
  });

  describe('PerformanceReportSchema', () => {
    it('accepts zero values', () => {
      const result = PerformanceReportSchema.parse({
        avgStepDuration: 0,
        slowSteps: [],
        retryCount: 0,
        stuckDetected: false,
      });
      expect(result.avgStepDuration).toBe(0);
    });

    it('rejects negative avgStepDuration', () => {
      expect(() =>
        PerformanceReportSchema.parse({
          avgStepDuration: -1,
          slowSteps: [],
          retryCount: 0,
          stuckDetected: false,
        })
      ).toThrow();
    });

    it('rejects negative retryCount', () => {
      expect(() =>
        PerformanceReportSchema.parse({
          avgStepDuration: 0,
          slowSteps: [],
          retryCount: -1,
          stuckDetected: false,
        })
      ).toThrow();
    });
  });
});

describe('Boundary: Enum validation', () => {
  describe('TaskStatusEnum', () => {
    it('accepts all valid statuses', () => {
      for (const status of ['queued', 'running', 'completed', 'failed', 'cancelled', 'aborted']) {
        expect(TaskStatusEnum.parse(status)).toBe(status);
      }
    });

    it('rejects invalid status', () => {
      expect(() => TaskStatusEnum.parse('pending')).toThrow();
      expect(() => TaskStatusEnum.parse('')).toThrow();
      expect(() => TaskStatusEnum.parse('COMPLETED')).toThrow();
    });
  });

  describe('StepPhaseEnum', () => {
    it('accepts all valid phases', () => {
      for (const phase of ['observe', 'plan', 'execute', 'verify']) {
        expect(StepPhaseEnum.parse(phase)).toBe(phase);
      }
    });

    it('rejects invalid phase', () => {
      expect(() => StepPhaseEnum.parse('analyze')).toThrow();
    });
  });

  describe('StepStatusEnum', () => {
    it('accepts all valid statuses', () => {
      for (const status of ['success', 'retry', 'failed', 'skipped']) {
        expect(StepStatusEnum.parse(status)).toBe(status);
      }
    });

    it('rejects invalid status', () => {
      expect(() => StepStatusEnum.parse('pending')).toThrow();
    });
  });

  describe('VerdictResultSchema', () => {
    it('accepts all valid verdicts', () => {
      for (const verdict of ['pass', 'retry', 'fail', 'escalate']) {
        expect(VerdictResultSchema.parse({ verdict, reasoning: 'test' }).verdict).toBe(verdict);
      }
    });

    it('rejects invalid verdict', () => {
      expect(() => VerdictResultSchema.parse({ verdict: 'success', reasoning: 'test' })).toThrow();
    });
  });

  describe('SafetyReportSchema', () => {
    it('accepts all valid risk levels', () => {
      for (const level of ['none', 'low', 'medium', 'high']) {
        expect(SafetyReportSchema.parse({ riskLevel: level, findings: [] }).riskLevel).toBe(level);
      }
    });

    it('rejects invalid risk level', () => {
      expect(() => SafetyReportSchema.parse({ riskLevel: 'critical', findings: [] })).toThrow();
    });
  });

  describe('AccessibilityReportSchema', () => {
    it('accepts all valid WCAG levels', () => {
      for (const level of ['A', 'AA', 'AAA', 'none']) {
        expect(AccessibilityReportSchema.parse({ wcagLevel: level, issues: [] }).wcagLevel).toBe(level);
      }
    });

    it('rejects invalid WCAG level', () => {
      expect(() => AccessibilityReportSchema.parse({ wcagLevel: 'B', issues: [] })).toThrow();
    });
  });
});

describe('Boundary: UUID validation', () => {
  it('TaskSchema rejects invalid UUID', () => {
    const validTask = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      goal: 'Test',
      targetAppPath: '/app',
      llmModel: 'gpt-4o' as const,
      status: 'queued' as const,
      maxSteps: 50,
      stepCount: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    expect(() => TaskSchema.parse({ ...validTask, id: 'not-a-uuid' })).toThrow();
    expect(() => TaskSchema.parse({ ...validTask, id: '' })).toThrow();
    expect(() => TaskSchema.parse({ ...validTask, id: '12345' })).toThrow();
  });

  it('FeedbackPatternSchema rejects invalid UUID', () => {
    expect(() =>
      FeedbackPatternSchema.parse({
        id: 'not-a-uuid',
        errorType: 'err',
        targetDescription: 'Button',
        remediationHint: 'hint',
        similarityKeywords: ['btn'],
        frequency: 1,
        lastSeen: '2026-01-01T00:00:00Z',
        relatedGoalPatterns: [],
      })
    ).toThrow();
  });
});

describe('Boundary: DateTime validation', () => {
  it('StepRecordSchema rejects invalid datetime', () => {
    expect(() =>
      StepRecordSchema.parse({
        id: '550e8400-e29b-41d4-a716-446655440001',
        taskId: '550e8400-e29b-41d4-a716-446655440000',
        stepIndex: 0,
        phase: 'observe',
        status: 'success',
        timestamp: 'not-a-date',
        duration: 100,
      })
    ).toThrow();
  });

  it('ObservationResultSchema rejects invalid datetime', () => {
    expect(() =>
      ObservationResultSchema.parse({
        ariaTree: 'tree',
        pageTitle: 'Page',
        url: 'http://localhost',
        timestamp: 'invalid',
      })
    ).toThrow();
  });
});

describe('Boundary: LLMProviderConfig edge cases', () => {
  it('rejects empty id', () => {
    expect(() =>
      LLMProviderConfigSchema.parse({
        id: '',
        name: 'Test',
        type: 'openai-compatible',
        apiKey: 'sk-test',
        baseURL: 'https://api.test.com/v1',
        model: 'gpt-4o',
      })
    ).toThrow();
  });

  it('rejects non-URL baseURL', () => {
    expect(() =>
      LLMProviderConfigSchema.parse({
        id: 'test',
        name: 'Test',
        type: 'openai-compatible',
        apiKey: 'sk-test',
        baseURL: 'not-a-url',
        model: 'gpt-4o',
      })
    ).toThrow();
  });

  it('CreateProviderSchema rejects empty apiKey', () => {
    expect(() =>
      CreateProviderSchema.parse({
        name: 'Test',
        type: 'openai-compatible',
        apiKey: '',
        baseURL: 'https://api.test.com/v1',
        model: 'gpt-4o',
      })
    ).toThrow();
  });

  it('UpdateProviderSchema rejects empty name', () => {
    expect(() => UpdateProviderSchema.parse({ name: '' })).toThrow();
  });
});
