import { describe, it, expect } from 'vitest';
import {
  CreateTaskRequestSchema,
  TaskSchema,
} from '../task.js';
import { StepRecordSchema } from '../step.js';
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

describe('CreateTaskRequestSchema', () => {
  it('parses valid input', () => {
    const result = CreateTaskRequestSchema.parse({
      goal: 'Test goal',
      targetAppPath: '/path/to/app',
      llmModel: 'gpt-4o',
    });
    expect(result.goal).toBe('Test goal');
    expect(result.maxSteps).toBe(50);
  });

  it('rejects missing required fields', () => {
    expect(() =>
      CreateTaskRequestSchema.parse({ goal: 'Test' })
    ).toThrow();
  });

  it('rejects empty llmModel', () => {
    expect(() =>
      CreateTaskRequestSchema.parse({
        goal: 'Test',
        targetAppPath: '/app',
        llmModel: '',
      })
    ).toThrow();
  });

  it('accepts any non-empty llmModel string', () => {
    const result = CreateTaskRequestSchema.parse({
      goal: 'Test',
      targetAppPath: '/app',
      llmModel: 'custom-model-v2',
    });
    expect(result.llmModel).toBe('custom-model-v2');
  });

  it('applies default maxSteps', () => {
    const result = CreateTaskRequestSchema.parse({
      goal: 'Test',
      targetAppPath: '/app',
      llmModel: 'gpt-4o',
    });
    expect(result.maxSteps).toBe(50);
  });

  it('allows optional contextInjection', () => {
    const result = CreateTaskRequestSchema.parse({
      goal: 'Test',
      targetAppPath: '/app',
      llmModel: 'gpt-4o',
      contextInjection: 'some context',
    });
    expect(result.contextInjection).toBe('some context');
  });
});

describe('TaskSchema', () => {
  const validTask = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    goal: 'Test goal',
    targetAppPath: '/app',
    llmModel: 'gpt-4o' as const,
    status: 'queued' as const,
    maxSteps: 50,
    stepCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  it('parses valid input', () => {
    const result = TaskSchema.parse(validTask);
    expect(result.id).toBe(validTask.id);
  });

  it('rejects invalid uuid', () => {
    expect(() =>
      TaskSchema.parse({ ...validTask, id: 'not-a-uuid' })
    ).toThrow();
  });

  it('rejects invalid status', () => {
    expect(() =>
      TaskSchema.parse({ ...validTask, status: 'invalid' })
    ).toThrow();
  });

  it('allows optional resultSummary', () => {
    const result = TaskSchema.parse(validTask);
    expect(result.resultSummary).toBeUndefined();
  });

  it('parses with resultSummary', () => {
    const result = TaskSchema.parse({
      ...validTask,
      resultSummary: { success: true, summary: 'Done' },
    });
    expect(result.resultSummary?.success).toBe(true);
  });
});

describe('StepRecordSchema', () => {
  const validStep = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    taskId: '550e8400-e29b-41d4-a716-446655440000',
    stepIndex: 0,
    phase: 'observe' as const,
    status: 'success' as const,
    timestamp: '2026-01-01T00:00:00Z',
    duration: 1000,
  };

  it('parses valid input', () => {
    const result = StepRecordSchema.parse(validStep);
    expect(result.stepIndex).toBe(0);
  });

  it('rejects missing required fields', () => {
    expect(() =>
      StepRecordSchema.parse({ id: validStep.id })
    ).toThrow();
  });

  it('allows optional observation', () => {
    const result = StepRecordSchema.parse(validStep);
    expect(result.observation).toBeUndefined();
  });

  it('allows optional action', () => {
    const result = StepRecordSchema.parse({
      ...validStep,
      action: { name: 'click', args: { selector: '#btn' } },
    });
    expect(result.action?.name).toBe('click');
  });

  it('rejects invalid phase', () => {
    expect(() =>
      StepRecordSchema.parse({ ...validStep, phase: 'invalid' })
    ).toThrow();
  });
});

describe('ManifestSchema', () => {
  const validManifest = {
    taskId: '550e8400-e29b-41d4-a716-446655440000',
    goal: 'Test goal',
    status: 'completed' as const,
    totalSteps: 10,
    passedSteps: 8,
    failedSteps: 2,
    retriedSteps: 1,
    startTime: '2026-01-01T00:00:00Z',
    endTime: '2026-01-01T01:00:00Z',
    totalDuration: 3600000,
  };

  it('parses valid input', () => {
    const result = ManifestSchema.parse(validManifest);
    expect(result.totalSteps).toBe(10);
  });

  it('rejects missing required fields', () => {
    expect(() => ManifestSchema.parse({ taskId: validManifest.taskId })).toThrow();
  });
});

describe('TimelineEntrySchema', () => {
  const validEntry = {
    stepIndex: 0,
    phase: 'observe' as const,
    status: 'success' as const,
    action: 'Captured aria snapshot',
    resultSummary: 'Page loaded',
    timestamp: '2026-01-01T00:00:00Z',
    duration: 500,
  };

  it('parses valid input', () => {
    const result = TimelineEntrySchema.parse(validEntry);
    expect(result.action).toBe('Captured aria snapshot');
  });

  it('rejects invalid phase', () => {
    expect(() =>
      TimelineEntrySchema.parse({ ...validEntry, phase: 'invalid' })
    ).toThrow();
  });
});

describe('FeedbackPatternSchema', () => {
  const validFeedback = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    errorType: 'element-not-found',
    targetDescription: 'Login button',
    remediationHint: 'Use data-testid attribute instead of text matching',
    similarityKeywords: ['login', 'button', 'selector'],
    frequency: 5,
    lastSeen: '2026-01-01T00:00:00Z',
    relatedGoalPatterns: ['user-authentication'],
  };

  it('parses valid input', () => {
    const result = FeedbackPatternSchema.parse(validFeedback);
    expect(result.remediationHint).toBe(validFeedback.remediationHint);
    expect(result.similarityKeywords).toHaveLength(3);
  });

  it('rejects missing remediationHint', () => {
    expect(() =>
      FeedbackPatternSchema.parse({
        ...validFeedback,
        remediationHint: undefined,
      })
    ).toThrow();
  });

  it('rejects empty similarityKeywords array items', () => {
    expect(() =>
      FeedbackPatternSchema.parse({
        ...validFeedback,
        similarityKeywords: ['valid', ''],
      })
    ).toThrow();
  });
});

describe('JsonRpcNotificationSchema', () => {
  it('parses valid notification', () => {
    const result = JsonRpcNotificationSchema.parse({
      jsonrpc: '2.0',
      method: 'step_complete',
      params: { stepIndex: 1 },
    });
    expect(result.method).toBe('step_complete');
  });

  it('parses without optional params', () => {
    const result = JsonRpcNotificationSchema.parse({
      jsonrpc: '2.0',
      method: 'heartbeat',
    });
    expect(result.params).toBeUndefined();
  });

  it('rejects invalid method', () => {
    expect(() =>
      JsonRpcNotificationSchema.parse({
        jsonrpc: '2.0',
        method: 'invalid_method',
      })
    ).toThrow();
  });

  it('rejects wrong jsonrpc version', () => {
    expect(() =>
      JsonRpcNotificationSchema.parse({
        jsonrpc: '1.0',
        method: 'log',
      })
    ).toThrow();
  });
});

describe('JsonRpcControlSchema', () => {
  it('parses valid control message', () => {
    const result = JsonRpcControlSchema.parse({
      jsonrpc: '2.0',
      method: 'pause',
      id: 1,
    });
    expect(result.method).toBe('pause');
  });

  it('accepts string id', () => {
    const result = JsonRpcControlSchema.parse({
      jsonrpc: '2.0',
      method: 'cancel',
      id: 'req-123',
    });
    expect(result.id).toBe('req-123');
  });

  it('rejects invalid method', () => {
    expect(() =>
      JsonRpcControlSchema.parse({
        jsonrpc: '2.0',
        method: 'invalid',
        id: 1,
      })
    ).toThrow();
  });
});

describe('ObservationResultSchema', () => {
  it('parses valid input', () => {
    const result = ObservationResultSchema.parse({
      ariaTree: '<button>Login</button>',
      pageTitle: 'Login Page',
      url: 'https://example.com/login',
      timestamp: '2026-01-01T00:00:00Z',
    });
    expect(result.ariaTree).toContain('button');
  });

  it('rejects missing fields', () => {
    expect(() =>
      ObservationResultSchema.parse({ ariaTree: 'test' })
    ).toThrow();
  });
});

describe('PlanResultSchema', () => {
  it('parses valid input', () => {
    const result = PlanResultSchema.parse({
      reasoning: 'Need to click login',
      toolCall: { name: 'click', args: { selector: '#login' } },
      expectedOutcome: 'Login form submitted',
    });
    expect(result.toolCall.name).toBe('click');
  });
});

describe('ExecResultSchema', () => {
  it('parses valid input', () => {
    const result = ExecResultSchema.parse({
      success: true,
      result: { clicked: true },
    });
    expect(result.success).toBe(true);
  });

  it('allows optional screenshot', () => {
    const result = ExecResultSchema.parse({
      success: false,
      result: null,
      screenshot: 'base64data',
    });
    expect(result.screenshot).toBe('base64data');
  });
});

describe('VerdictResultSchema', () => {
  it('parses valid pass verdict', () => {
    const result = VerdictResultSchema.parse({
      verdict: 'pass',
      reasoning: 'All checks passed',
    });
    expect(result.verdict).toBe('pass');
  });

  it('rejects invalid verdict', () => {
    expect(() =>
      VerdictResultSchema.parse({ verdict: 'invalid', reasoning: 'test' })
    ).toThrow();
  });
});

describe('SafetyReportSchema', () => {
  it('parses valid input', () => {
    const result = SafetyReportSchema.parse({
      riskLevel: 'low',
      findings: [
        { category: 'navigation', description: 'Navigated to external URL', severity: 'info' },
      ],
    });
    expect(result.riskLevel).toBe('low');
    expect(result.findings).toHaveLength(1);
  });

  it('rejects invalid riskLevel', () => {
    expect(() =>
      SafetyReportSchema.parse({
        riskLevel: 'critical',
        findings: [],
      })
    ).toThrow();
  });
});

describe('PerformanceReportSchema', () => {
  it('parses valid input', () => {
    const result = PerformanceReportSchema.parse({
      avgStepDuration: 1500,
      slowSteps: [{ stepIndex: 3, duration: 5000, phase: 'execute' }],
      retryCount: 2,
      stuckDetected: false,
    });
    expect(result.avgStepDuration).toBe(1500);
    expect(result.stuckDetected).toBe(false);
  });
});

describe('AccessibilityReportSchema', () => {
  it('parses valid input', () => {
    const result = AccessibilityReportSchema.parse({
      issues: [
        { type: 'missing-alt', element: 'img', description: 'Image missing alt text', severity: 'error' },
      ],
      wcagLevel: 'AA',
    });
    expect(result.wcagLevel).toBe('AA');
  });

  it('rejects invalid wcagLevel', () => {
    expect(() =>
      AccessibilityReportSchema.parse({
        issues: [],
        wcagLevel: 'invalid',
      })
    ).toThrow();
  });
});
