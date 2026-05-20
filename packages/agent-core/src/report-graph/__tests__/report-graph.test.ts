import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Node exports
import { createSafetyNode } from '../nodes/safety.js';
import { createPerformanceNode } from '../nodes/performance.js';
import { createAccessibilityNode } from '../nodes/accessibility.js';
import { createPatternNode } from '../nodes/pattern.js';
import { createSummarizeNode } from '../nodes/summarize.js';
import { PatternStore } from '../pattern-store.js';
import { createReportGraph } from '../graph.js';

// Schema imports for assertions
import {
  SafetyReportSchema,
  PerformanceReportSchema,
  AccessibilityReportSchema,
  FeedbackPatternSchema,
} from '@eata/shared-types';

// ── Helpers ──────────────────────────────────────────────

function makeStepRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    taskId: 'task-test',
    stepIndex: 0,
    phase: 'observe' as const,
    status: 'success' as const,
    observation: 'Page loaded',
    timestamp: new Date().toISOString(),
    duration: 120,
    ...overrides,
  };
}

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    goal: 'Click Settings button and verify page',
    history: [
      makeStepRecord({ stepIndex: 0, phase: 'observe' as const, status: 'success' as const, duration: 100, observation: 'Main page visible' }),
      makeStepRecord({ stepIndex: 1, phase: 'plan' as const, status: 'success' as const, duration: 50, reasoning: 'Click Settings' }),
      makeStepRecord({ stepIndex: 2, phase: 'execute' as const, status: 'success' as const, duration: 200, observation: 'Clicked Settings' }),
      makeStepRecord({ stepIndex: 3, phase: 'verify' as const, status: 'success' as const, duration: 80, observation: 'Settings page appears' }),
    ],
    safetyReport: null,
    performanceReport: null,
    accessibilityReport: null,
    newPatterns: [],
    summaryText: '',
    ...overrides,
  };
}

// ── Safety Node ──────────────────────────────────────────

describe('safetyNode', () => {
  it('returns riskLevel none by default (no generateObject)', async () => {
    const node = createSafetyNode({});
    const result = await node(makeState());

    expect(result.safetyReport).toBeDefined();
    expect(result.safetyReport!.riskLevel).toBe('none');
    expect(result.safetyReport!.findings).toEqual([]);
  });

  it('uses generateObject when provided', async () => {
    const mockGenerateObject = vi.fn().mockResolvedValue({
      object: {
        riskLevel: 'medium',
        findings: [
          { category: 'data_exposure', description: 'API key in console', severity: 'high' },
        ],
      },
    });

    const node = createSafetyNode({ generateObject: mockGenerateObject });
    const result = await node(makeState());

    expect(result.safetyReport!.riskLevel).toBe('medium');
    expect(result.safetyReport!.findings).toHaveLength(1);
    expect(result.safetyReport!.findings[0].category).toBe('data_exposure');
    expect(mockGenerateObject).toHaveBeenCalledOnce();
  });

  it('includes goal and history context in prompt', async () => {
    const mockGenerateObject = vi.fn().mockResolvedValue({
      object: { riskLevel: 'none', findings: [] },
    });

    const node = createSafetyNode({ generateObject: mockGenerateObject });
    const state = makeState({
      history: [
        makeStepRecord({ stepIndex: 0, status: 'failed' as const, observation: 'Timeout error' }),
      ],
    });
    await node(state);

    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.prompt).toContain('Click Settings');
    expect(callArgs.prompt).toContain('Timeout error');
    expect(callArgs.schema).toBe(SafetyReportSchema);
  });
});

// ── Performance Node ─────────────────────────────────────

describe('performanceNode', () => {
  it('computes deterministic stats without generateObject', async () => {
    const node = createPerformanceNode({});
    const state = makeState({
      history: [
        makeStepRecord({ stepIndex: 0, duration: 100, status: 'success' as const }),
        makeStepRecord({ stepIndex: 1, duration: 200, status: 'success' as const }),
        makeStepRecord({ stepIndex: 2, duration: 300, status: 'retry' as const }),
        makeStepRecord({ stepIndex: 3, duration: 300, status: 'retry' as const }),
        makeStepRecord({ stepIndex: 4, duration: 300, status: 'retry' as const }),
      ],
    });
    const result = await node(state);

    expect(result.performanceReport!.avgStepDuration).toBe(240);
    expect(result.performanceReport!.retryCount).toBe(3);
    expect(result.performanceReport!.stuckDetected).toBe(true);
  });

  it('uses generateObject when provided', async () => {
    const mockGenerateObject = vi.fn().mockResolvedValue({
      object: {
        avgStepDuration: 500,
        slowSteps: [{ stepIndex: 2, duration: 1500, phase: 'execute' }],
        retryCount: 2,
        stuckDetected: false,
      },
    });

    const node = createPerformanceNode({ generateObject: mockGenerateObject });
    const result = await node(makeState());

    expect(result.performanceReport!.avgStepDuration).toBe(500);
    expect(result.performanceReport!.slowSteps).toHaveLength(1);
    expect(mockGenerateObject).toHaveBeenCalledOnce();
  });
});

// ── Accessibility Node ───────────────────────────────────

describe('accessibilityNode', () => {
  it('returns empty report by default (no generateObject)', async () => {
    const node = createAccessibilityNode({});
    const result = await node(makeState());

    expect(result.accessibilityReport!.issues).toEqual([]);
    expect(result.accessibilityReport!.wcagLevel).toBe('none');
  });

  it('uses generateObject when provided', async () => {
    const mockGenerateObject = vi.fn().mockResolvedValue({
      object: {
        issues: [
          { type: 'missing_label', element: 'button', description: 'No aria-label', severity: 'medium' },
        ],
        wcagLevel: 'A',
      },
    });

    const node = createAccessibilityNode({ generateObject: mockGenerateObject });
    const result = await node(makeState());

    expect(result.accessibilityReport!.issues).toHaveLength(1);
    expect(result.accessibilityReport!.wcagLevel).toBe('A');
    expect(mockGenerateObject).toHaveBeenCalledOnce();
  });

  it('includes accessibility snapshots in prompt', async () => {
    const mockGenerateObject = vi.fn().mockResolvedValue({
      object: { issues: [], wcagLevel: 'AA' },
    });

    const node = createAccessibilityNode({ generateObject: mockGenerateObject });
    const state = makeState({
      history: [
        makeStepRecord({
          stepIndex: 0,
          accessibilitySnapshotPath: '/reports/task-1/accessibility/step-0-observe.json',
        }),
      ],
    });
    await node(state);

    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.prompt).toContain('step-0-observe.json');
  });
});

// ── Pattern Node ─────────────────────────────────────────

describe('patternNode', () => {
  it('returns empty patterns when no failed steps', async () => {
    const node = createPatternNode({});
    const result = await node(makeState());

    expect(result.newPatterns).toEqual([]);
  });

  it('returns empty patterns without generateObject even with failures', async () => {
    const node = createPatternNode({});
    const state = makeState({
      history: [
        makeStepRecord({ stepIndex: 0, status: 'failed' as const, observation: 'Timeout', reasoning: 'Element not found' }),
      ],
    });
    const result = await node(state);

    // Without generateObject, returns empty (deterministic fallback)
    expect(result.newPatterns).toEqual([]);
  });

  it('uses generateObject to extract patterns from failures', async () => {
    const mockPattern = {
      id: crypto.randomUUID(),
      errorType: 'element_not_found',
      targetDescription: 'Clicking Settings button on main page',
      remediationHint: 'Wait for page to fully load before clicking',
      similarityKeywords: ['timeout', 'element', 'not found', 'wait'],
      frequency: 1,
      lastSeen: new Date().toISOString(),
      relatedGoalPatterns: ['click', 'settings', 'button'],
    };

    const mockGenerateObject = vi.fn().mockResolvedValue({
      object: mockPattern,
    });

    const node = createPatternNode({ generateObject: mockGenerateObject });
    const state = makeState({
      history: [
        makeStepRecord({ stepIndex: 0, status: 'failed' as const, observation: 'Timeout', reasoning: 'Element not found' }),
      ],
    });
    const result = await node(state);

    expect(result.newPatterns).toHaveLength(1);
    expect(result.newPatterns![0].errorType).toBe('element_not_found');
    expect(result.newPatterns![0].remediationHint).toBe('Wait for page to fully load before clicking');
    expect(mockGenerateObject).toHaveBeenCalledOnce();
  });

  it('includes failed step context in prompt', async () => {
    const mockGenerateObject = vi.fn().mockResolvedValue({
      object: {
        id: crypto.randomUUID(),
        errorType: 'timeout',
        targetDescription: 'test',
        remediationHint: 'test',
        similarityKeywords: ['test'],
        frequency: 1,
        lastSeen: new Date().toISOString(),
        relatedGoalPatterns: [],
      },
    });

    const node = createPatternNode({ generateObject: mockGenerateObject });
    const state = makeState({
      history: [
        makeStepRecord({
          stepIndex: 0,
          status: 'failed' as const,
          observation: 'Timeout error',
          reasoning: 'Page took too long',
          action: { name: 'browser_click', args: { selector: '#settings' } },
        }),
      ],
    });
    await node(state);

    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.prompt).toContain('Timeout error');
    expect(callArgs.prompt).toContain('browser_click');
    expect(callArgs.schema).toBe(FeedbackPatternSchema);
  });
});

// ── Summarize Node ───────────────────────────────────────

describe('summarizeNode', () => {
  it('produces summary text from all four reports', async () => {
    const node = createSummarizeNode();
    const state = makeState({
      safetyReport: {
        riskLevel: 'low',
        findings: [{ category: 'info', description: 'Minor note', severity: 'low' }],
      },
      performanceReport: {
        avgStepDuration: 150,
        slowSteps: [],
        retryCount: 1,
        stuckDetected: false,
      },
      accessibilityReport: {
        issues: [{ type: 'missing_label', element: 'button', description: 'No label', severity: 'medium' }],
        wcagLevel: 'A',
      },
      newPatterns: [
        {
          id: crypto.randomUUID(),
          errorType: 'timeout',
          targetDescription: 'test',
          remediationHint: 'Add wait',
          similarityKeywords: ['timeout'],
          frequency: 1,
          lastSeen: new Date().toISOString(),
          relatedGoalPatterns: [],
        },
      ],
    });
    const result = await node(state);

    expect(result.summaryText).toContain('Click Settings');
    expect(result.summaryText).toContain('Safety');
    expect(result.summaryText).toContain('Performance');
    expect(result.summaryText).toContain('Accessibility');
    expect(result.summaryText).toContain('Patterns');
    expect(result.summaryText).toContain('Risk level: low');
    expect(result.summaryText).toContain('Add wait');
  });

  it('handles null report fields gracefully', async () => {
    const node = createSummarizeNode();
    const result = await node(makeState());

    expect(result.summaryText).toContain('Safety analysis not performed');
    expect(result.summaryText).toContain('Performance analysis not performed');
    expect(result.summaryText).toContain('Accessibility analysis not performed');
  });
});

// ── PatternStore ─────────────────────────────────────────

describe('PatternStore', () => {
  let tempDir: string;
  let store: PatternStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'eata-pattern-test-'));
    store = new PatternStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makePattern(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: (overrides.id as string) ?? crypto.randomUUID(),
      errorType: (overrides.errorType as string) ?? 'element_not_found',
      targetDescription: (overrides.targetDescription as string) ?? 'Clicking a button',
      remediationHint: (overrides.remediationHint as string) ?? 'Wait for element visibility',
      similarityKeywords: (overrides.similarityKeywords as string[]) ?? ['element', 'visibility', 'wait'],
      frequency: (overrides.frequency as number) ?? 1,
      lastSeen: (overrides.lastSeen as string) ?? new Date().toISOString(),
      relatedGoalPatterns: (overrides.relatedGoalPatterns as string[]) ?? [],
    };
  }

  it('readAll returns empty array for fresh store', () => {
    expect(store.readAll()).toEqual([]);
  });

  it('upsert adds new pattern', () => {
    const pattern = makePattern();
    store.upsert(pattern);

    const all = store.readAll();
    expect(all).toHaveLength(1);
    expect(all[0].errorType).toBe('element_not_found');
  });

  it('upsert deduplicates by errorType + targetDescription', () => {
    const pattern = makePattern();
    store.upsert(pattern);

    // Same errorType + targetDescription, should merge
    const similar = makePattern({
      id: crypto.randomUUID(),
      errorType: 'element_not_found',
      targetDescription: 'Clicking a button',
      remediationHint: 'Updated hint',
      similarityKeywords: ['new_keyword'],
      frequency: 2,
    });
    const result = store.upsert(similar);

    const all = store.readAll();
    expect(all).toHaveLength(1);
    expect(result.frequency).toBe(3); // 1 + 2
    expect(result.similarityKeywords).toContain('element');
    expect(result.similarityKeywords).toContain('new_keyword');
    expect(result.remediationHint).toBe('Wait for element visibility'); // original kept
  });

  it('upsert treats different errorTypes as separate patterns', () => {
    store.upsert(makePattern({ errorType: 'timeout' }));
    store.upsert(makePattern({ errorType: 'unexpected_state' }));

    expect(store.readAll()).toHaveLength(2);
  });

  it('upsert updates lastSeen on match', async () => {
    const old = makePattern({ lastSeen: '2024-01-01T00:00:00.000Z' });
    store.upsert(old);

    const now = new Date().toISOString();
    const newer = makePattern({ lastSeen: now });
    store.upsert(newer);

    const all = store.readAll();
    expect(all[0].lastSeen).toBe(now);
  });

  it('loadPatternsForPrompt returns empty string for empty store', () => {
    expect(store.loadPatternsForPrompt('click button')).toBe('');
  });

  it('loadPatternsForPrompt returns relevant patterns', () => {
    store.upsert(makePattern({
      errorType: 'element_not_found',
      similarityKeywords: ['click', 'button', 'element'],
      relatedGoalPatterns: ['click', 'button'],
    }));
    store.upsert(makePattern({
      errorType: 'timeout',
      similarityKeywords: ['loading', 'slow', 'timeout'],
      relatedGoalPatterns: [],
    }));

    const result = store.loadPatternsForPrompt('click settings button');
    expect(result).toContain('element_not_found');
    // 'timeout' pattern likely not matched since goal has no related keywords
  });

  it('loadPatternsForPrompt respects maxCount limit', () => {
    for (let i = 0; i < 10; i++) {
      store.upsert(makePattern({
        errorType: `error_${i}`,
        similarityKeywords: ['click', 'button'],
        frequency: i + 1,
      }));
    }

    const result = store.loadPatternsForPrompt('click button', 5);
    // Should return at most 5 patterns (sorted by frequency)
    const lines = result.split('\n').filter((l) => l.startsWith('- '));
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  it('upsert deduplicates target descriptions with similar text', () => {
    store.upsert(makePattern({
      errorType: 'timeout',
      targetDescription: 'Clicking the Settings button',
    }));
    store.upsert(makePattern({
      errorType: 'timeout',
      targetDescription: 'clicking the settings button', // different case/punctuation ignored
    }));

    expect(store.readAll()).toHaveLength(1);
  });

  it('loadPatternsForPrompt returns empty for irrelevant goal', () => {
    store.upsert(makePattern({
      errorType: 'element_not_found',
      similarityKeywords: ['click', 'button'],
      relatedGoalPatterns: ['click'],
    }));

    const result = store.loadPatternsForPrompt('verify zzz xyz abc');
    expect(result).toBe('');
  });
});

// ── Report Graph (Sub Graph) ─────────────────────────────

describe('createReportGraph', () => {
  it('compiles without errors', () => {
    const graph = createReportGraph();
    const compiled = graph.compile();

    expect(compiled).toBeDefined();
    expect(typeof compiled.invoke).toBe('function');
  });

  it('has all required nodes', () => {
    const graph = createReportGraph();
    const compiled = graph.compile();
    const nodeNames = Object.keys(compiled.builder.nodes);

    expect(nodeNames).toContain('safety');
    expect(nodeNames).toContain('perf');
    expect(nodeNames).toContain('a11y');
    expect(nodeNames).toContain('pattern');
    expect(nodeNames).toContain('summarize');
  });

  it('executes fan-out/fan-in parallel analysis', async () => {
    const mockSafetyGenerate = vi.fn().mockResolvedValue({
      object: {
        riskLevel: 'low' as const,
        findings: [{ category: 'test', description: 'Safe test', severity: 'low' }],
      },
    });

    const mockPerfGenerate = vi.fn().mockResolvedValue({
      object: {
        avgStepDuration: 200,
        slowSteps: [],
        retryCount: 1,
        stuckDetected: false,
      },
    });

    const mockA11yGenerate = vi.fn().mockResolvedValue({
      object: {
        issues: [],
        wcagLevel: 'AA' as const,
      },
    });

    const mockPatternGenerate = vi.fn().mockResolvedValue({
      object: {
        id: crypto.randomUUID(),
        errorType: 'test_pattern',
        targetDescription: 'Testing',
        remediationHint: 'Fix it',
        similarityKeywords: ['test'],
        frequency: 1,
        lastSeen: new Date().toISOString(),
        relatedGoalPatterns: [],
      },
    });

    const graph = createReportGraph({
      safety: { generateObject: mockSafetyGenerate },
      performance: { generateObject: mockPerfGenerate },
      accessibility: { generateObject: mockA11yGenerate },
      pattern: { generateObject: mockPatternGenerate },
    });
    const compiled = graph.compile();

    const state = makeState({
      history: [
        makeStepRecord({ stepIndex: 0, status: 'failed' as const, observation: 'Timeout' }),
        makeStepRecord({ stepIndex: 1, status: 'success' as const, duration: 100 }),
      ],
    });

    const result = await compiled.invoke(state, { recursionLimit: 100 });

    expect(result.safetyReport).toBeDefined();
    expect(result.safetyReport!.riskLevel).toBe('low');
    expect(result.performanceReport).toBeDefined();
    expect(result.performanceReport!.avgStepDuration).toBe(200);
    expect(result.accessibilityReport).toBeDefined();
    expect(result.accessibilityReport!.wcagLevel).toBe('AA');
    expect(result.newPatterns).toHaveLength(1);
    expect(result.newPatterns![0].errorType).toBe('test_pattern');
    expect(result.summaryText).toBeDefined();
    expect(result.summaryText).toContain('Safety');
    expect(result.summaryText).toContain('Performance');
    expect(result.summaryText).toContain('Accessibility');
    expect(result.summaryText).toContain('Patterns');

    // All 4 nodes called
    expect(mockSafetyGenerate).toHaveBeenCalledOnce();
    expect(mockPerfGenerate).toHaveBeenCalledOnce();
    expect(mockA11yGenerate).toHaveBeenCalledOnce();
    expect(mockPatternGenerate).toHaveBeenCalledOnce();
  });

  it('runs without generateObject options (deterministic defaults)', async () => {
    const graph = createReportGraph();
    const compiled = graph.compile();

    const state = makeState({
      history: [
        makeStepRecord({ stepIndex: 0, duration: 100, status: 'success' as const }),
        makeStepRecord({ stepIndex: 1, duration: 200, status: 'success' as const }),
      ],
    });

    const result = await compiled.invoke(state, { recursionLimit: 100 });

    expect(result.safetyReport!.riskLevel).toBe('none');
    expect(result.performanceReport!.avgStepDuration).toBe(150);
    expect(result.accessibilityReport!.wcagLevel).toBe('none');
    expect(result.newPatterns).toEqual([]);
    expect(result.summaryText).toContain('No safety issues');
    expect(result.summaryText).toContain('150ms');
  });

  it('accepts partial generateObject options', async () => {
    const mockSafetyGenerate = vi.fn().mockResolvedValue({
      object: { riskLevel: 'medium' as const, findings: [] },
    });

    // Only provide safety, others use defaults
    const graph = createReportGraph({
      safety: { generateObject: mockSafetyGenerate },
    });
    const compiled = graph.compile();

    const state = makeState({
      history: [
        makeStepRecord({ stepIndex: 0, duration: 100, status: 'success' as const }),
      ],
    });

    const result = await compiled.invoke(state, { recursionLimit: 100 });

    expect(result.safetyReport!.riskLevel).toBe('medium');
    expect(result.performanceReport!.avgStepDuration).toBe(100);
    expect(result.accessibilityReport!.wcagLevel).toBe('none');
    expect(mockSafetyGenerate).toHaveBeenCalledOnce();
  });
});
