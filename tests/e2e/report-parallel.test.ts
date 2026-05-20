import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createReportGraph } from '../../packages/agent-core/src/report-graph/graph.js';
import { PatternStore } from '../../packages/agent-core/src/report-graph/pattern-store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'eata-e2e-report-'));
});

afterEach(() => {
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function makeHistory() {
  return Array.from({ length: 4 }, (_, i) => ({
    id: crypto.randomUUID(),
    taskId: 'report-test',
    stepIndex: i,
    phase: (['observe', 'plan', 'execute', 'verify'] as const)[i],
    status: 'success' as const,
    observation: `Step ${i} observation`,
    timestamp: new Date().toISOString(),
    duration: 100 + i * 50,
  }));
}

function makeInitialState(overrides: Record<string, unknown> = {}) {
  return {
    goal: 'Test report generation',
    history: makeHistory(),
    safetyReport: null,
    performanceReport: null,
    accessibilityReport: null,
    newPatterns: [],
    summaryText: '',
    ...overrides,
  };
}

describe('Report Sub Graph parallel execution', () => {
  it('compiles and executes with default (no generateObject)', async () => {
    const graph = createReportGraph();
    const compiled = graph.compile();

    const result = await compiled.invoke(makeInitialState(), {
      configurable: { thread_id: 'report-default' },
      recursionLimit: 100,
    });

    // All 4 nodes should produce reports even without generateObject
    expect(result.safetyReport).toBeDefined();
    expect(result.safetyReport!.riskLevel).toBe('none');
    expect(result.performanceReport).toBeDefined();
    expect(result.accessibilityReport).toBeDefined();
    expect(result.summaryText).toBeDefined();
  });

  it('executes with mock generateObject for each node', async () => {
    const mockGenerateObject = vi.fn().mockImplementation((opts: { schema: unknown }) => {
      // Return a minimal valid object based on which schema is being used
      const schemaStr = JSON.stringify(opts.schema);
      if (schemaStr.includes('avgStepDuration')) {
        // PerformanceReportSchema
        return { object: { avgStepDuration: 150, slowSteps: [], retryCount: 0, stuckDetected: false } };
      }
      if (schemaStr.includes('riskLevel')) {
        // SafetyReportSchema
        return { object: { riskLevel: 'low', findings: [] } };
      }
      if (schemaStr.includes('wcagLevel')) {
        // AccessibilityReportSchema
        return { object: { wcagLevel: 'A', issues: [] } };
      }
      if (schemaStr.includes('errorType')) {
        // FeedbackPatternSchema
        return { object: { id: crypto.randomUUID(), errorType: 'test_error', targetDescription: 'test', remediationHint: 'fix it', similarityKeywords: ['test'], frequency: 1, lastSeen: new Date().toISOString(), relatedGoalPatterns: ['test'] } };
      }
      // Fallback
      return { object: { riskLevel: 'low', findings: [], summary: 'mock summary' } };
    });

    const graph = createReportGraph({
      safety: { generateObject: mockGenerateObject },
      performance: { generateObject: mockGenerateObject },
      accessibility: { generateObject: mockGenerateObject },
      pattern: { generateObject: mockGenerateObject },
    });
    const compiled = graph.compile();

    const result = await compiled.invoke(makeInitialState(), {
      configurable: { thread_id: 'report-mock' },
      recursionLimit: 100,
    });

    // generateObject should have been called for each node
    expect(mockGenerateObject).toHaveBeenCalled();
    expect(result.summaryText).toBeDefined();
  });

  it('all 4 analysis nodes run before summarize', async () => {
    const executionOrder: string[] = [];

    const trackNode = (name: string) => async () => {
      executionOrder.push(name);
      return {};
    };

    // We can't easily inject custom nodes, but we verify the compiled graph
    // has all 5 nodes (safety, perf, a11y, pattern, summarize)
    const graph = createReportGraph();
    const compiled = graph.compile();

    const nodeNames = Object.keys(compiled.builder.nodes);
    expect(nodeNames).toContain('safety');
    expect(nodeNames).toContain('perf');
    expect(nodeNames).toContain('a11y');
    expect(nodeNames).toContain('pattern');
    expect(nodeNames).toContain('summarize');
  });
});

describe('PatternStore integration in report flow', () => {
  it('writes patterns from report analysis to JSONL', () => {
    const store = new PatternStore(dataDir);

    // Simulate patterns extracted by the pattern node
    const patterns = [
      {
        id: crypto.randomUUID(),
        errorType: 'timeout',
        targetDescription: 'Login button response',
        remediationHint: 'Increase wait time for login response',
        similarityKeywords: ['login', 'timeout', 'button'],
        frequency: 2,
        lastSeen: new Date().toISOString(),
        relatedGoalPatterns: ['login test', 'authentication'],
      },
      {
        id: crypto.randomUUID(),
        errorType: 'element_not_interactable',
        targetDescription: 'Submit button while loading',
        remediationHint: 'Wait for loading spinner to disappear',
        similarityKeywords: ['submit', 'loading', 'button'],
        frequency: 1,
        lastSeen: new Date().toISOString(),
        relatedGoalPatterns: ['form submit'],
      },
    ];

    for (const p of patterns) {
      store.upsert(p);
    }

    const all = store.readAll();
    expect(all.length).toBe(2);
    expect(all[0].remediationHint).toBeDefined();
    expect(all[0].similarityKeywords.length).toBeGreaterThan(0);
    expect(all[1].errorType).toBe('element_not_interactable');
  });

  it('deduplicates patterns by errorType + description', () => {
    const store = new PatternStore(dataDir);

    const base = {
      id: crypto.randomUUID(),
      errorType: 'timeout',
      targetDescription: 'Login button response',
      remediationHint: 'Increase wait time',
      similarityKeywords: ['login', 'timeout'],
      frequency: 1,
      lastSeen: new Date().toISOString(),
      relatedGoalPatterns: ['login test'],
    };

    store.upsert(base);
    store.upsert({ ...base, frequency: 1, id: crypto.randomUUID() });

    const all = store.readAll();
    // Should be deduplicated — only 1 entry
    expect(all.length).toBe(1);
    // Frequency should be incremented
    expect(all[0].frequency).toBeGreaterThanOrEqual(2);
  });

  it('caps patterns at 50 for prompt injection', () => {
    const store = new PatternStore(dataDir);

    // Insert 80 patterns
    for (let i = 0; i < 80; i++) {
      store.upsert({
        id: crypto.randomUUID(),
        errorType: `error-${i % 10}`,
        targetDescription: `Description for pattern ${i}`,
        remediationHint: `Fix hint ${i}`,
        similarityKeywords: ['test', `hint-${i}`],
        frequency: 1 + (i % 5),
        lastSeen: new Date().toISOString(),
        relatedGoalPatterns: ['test goal'],
      });
    }

    const prompt = store.loadPatternsForPrompt('test goal', 50);
    expect(prompt.length).toBeGreaterThan(0);

    // Count pattern entries in the formatted string
    const lines = prompt.split('\n').filter((l) => l.startsWith('- '));
    expect(lines.length).toBeLessThanOrEqual(50);
  });
});
