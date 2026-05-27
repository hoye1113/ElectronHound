import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createReportGraph } from '../report-graph/graph.js';
import { createSafetyNode } from '../report-graph/nodes/safety.js';
import { createPerformanceNode } from '../report-graph/nodes/performance.js';
import { createAccessibilityNode } from '../report-graph/nodes/accessibility.js';
import { createPatternNode } from '../report-graph/nodes/pattern.js';
import { createSummarizeNode } from '../report-graph/nodes/summarize.js';
import { setMCPClient, MCPClient } from '../mcp/client.js';

describe('createReportGraph', () => {
  let mockClient: MCPClient;

  beforeEach(() => {
    mockClient = new MCPClient();
    setMCPClient(mockClient);
  });

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

  it('produces summary with empty history', async () => {
    const graph = createReportGraph();
    const compiled = graph.compile();

    const result = await compiled.invoke({
      goal: 'Test empty',
      history: [],
    });

    expect(result.summaryText).toBeDefined();
    expect(result.summaryText.length).toBeGreaterThan(0);
    expect(result.summaryText).toContain('Test empty');
  });

  it('produces safety report with default node', async () => {
    const graph = createReportGraph();
    const compiled = graph.compile();

    const result = await compiled.invoke({
      goal: 'Safety test',
      history: [],
    });

    expect(result.safetyReport).toBeDefined();
    expect(result.safetyReport!.riskLevel).toBe('none');
    expect(result.safetyReport!.findings).toEqual([]);
  });

  it('produces performance report with step data', async () => {
    const graph = createReportGraph();
    const compiled = graph.compile();

    const result = await compiled.invoke({
      goal: 'Perf test',
      history: [
        {
          id: 's1',
          taskId: 't1',
          stepIndex: 0,
          phase: 'observe',
          status: 'success',
          timestamp: '2026-01-01T00:00:00Z',
          duration: 100,
        },
        {
          id: 's2',
          taskId: 't1',
          stepIndex: 1,
          phase: 'execute',
          status: 'success',
          timestamp: '2026-01-01T00:00:01Z',
          duration: 200,
        },
      ],
    });

    expect(result.performanceReport).toBeDefined();
    expect(result.performanceReport!.avgStepDuration).toBe(150);
    expect(result.performanceReport!.retryCount).toBe(0);
    expect(result.performanceReport!.stuckDetected).toBe(false);
  });

  it('detects slow steps', async () => {
    const graph = createReportGraph();
    const compiled = graph.compile();

    const result = await compiled.invoke({
      goal: 'Slow step test',
      history: [
        {
          id: 's1',
          taskId: 't1',
          stepIndex: 0,
          phase: 'observe',
          status: 'success',
          timestamp: '2026-01-01T00:00:00Z',
          duration: 100,
        },
        {
          id: 's2',
          taskId: 't1',
          stepIndex: 1,
          phase: 'observe',
          status: 'success',
          timestamp: '2026-01-01T00:00:01Z',
          duration: 200,
        },
        {
          id: 's3',
          taskId: 't1',
          stepIndex: 2,
          phase: 'execute',
          status: 'success',
          timestamp: '2026-01-01T00:00:02Z',
          duration: 10000,
        },
      ],
    });

    // avg = (100+200+10000)/3 = 3433, threshold = 6866, 10000 > 6866
    expect(result.performanceReport!.slowSteps.length).toBeGreaterThanOrEqual(1);
  });

  it('produces accessibility report', async () => {
    const graph = createReportGraph();
    const compiled = graph.compile();

    const result = await compiled.invoke({
      goal: 'A11y test',
      history: [],
    });

    expect(result.accessibilityReport).toBeDefined();
    expect(result.accessibilityReport!.wcagLevel).toBe('none');
    expect(result.accessibilityReport!.issues).toEqual([]);
  });

  it('uses injected safety node via DI', async () => {
    const mockSafetyGenerateObject = vi.fn().mockResolvedValue({
      object: {
        riskLevel: 'high',
        findings: [{ category: 'security', description: 'XSS found', severity: 'error' }],
      },
    });

    const graph = createReportGraph({
      safety: { generateObject: mockSafetyGenerateObject },
    });
    const compiled = graph.compile();

    const result = await compiled.invoke({
      goal: 'DI safety test',
      history: [],
    });

    expect(mockSafetyGenerateObject).toHaveBeenCalled();
    expect(result.safetyReport!.riskLevel).toBe('high');
    expect(result.safetyReport!.findings).toHaveLength(1);
  });
});

describe('safetyNode', () => {
  it('returns default safety report when no generateObject', async () => {
    const node = createSafetyNode({});
    const state = { goal: 'test', history: [], safetyReport: null, performanceReport: null, accessibilityReport: null, newPatterns: [], summaryText: '' };
    const result = await node(state);
    expect(result.safetyReport!.riskLevel).toBe('none');
    expect(result.safetyReport!.findings).toEqual([]);
  });
});

describe('performanceNode', () => {
  it('computes average duration correctly', async () => {
    const node = createPerformanceNode({});
    const state = {
      goal: 'test',
      history: [
        { id: 's1', taskId: 't1', stepIndex: 0, phase: 'observe', status: 'success', timestamp: '2026-01-01T00:00:00Z', duration: 100 },
        { id: 's2', taskId: 't1', stepIndex: 1, phase: 'execute', status: 'success', timestamp: '2026-01-01T00:00:01Z', duration: 300 },
      ],
      safetyReport: null, performanceReport: null, accessibilityReport: null, newPatterns: [], summaryText: '',
    };
    const result = await node(state);
    expect(result.performanceReport!.avgStepDuration).toBe(200);
  });

  it('counts retries', async () => {
    const node = createPerformanceNode({});
    const state = {
      goal: 'test',
      history: [
        { id: 's1', taskId: 't1', stepIndex: 0, phase: 'execute', status: 'retry', timestamp: '2026-01-01T00:00:00Z', duration: 100 },
        { id: 's2', taskId: 't1', stepIndex: 1, phase: 'execute', status: 'retry', timestamp: '2026-01-01T00:00:01Z', duration: 100 },
        { id: 's3', taskId: 't1', stepIndex: 2, phase: 'execute', status: 'success', timestamp: '2026-01-01T00:00:02Z', duration: 100 },
      ],
      safetyReport: null, performanceReport: null, accessibilityReport: null, newPatterns: [], summaryText: '',
    };
    const result = await node(state);
    expect(result.performanceReport!.retryCount).toBe(2);
  });

  it('detects stuck pattern', async () => {
    const node = createPerformanceNode({});
    const state = {
      goal: 'test',
      history: [
        { id: 's1', taskId: 't1', stepIndex: 0, phase: 'execute', status: 'retry', timestamp: '2026-01-01T00:00:00Z', duration: 100 },
        { id: 's2', taskId: 't1', stepIndex: 1, phase: 'execute', status: 'retry', timestamp: '2026-01-01T00:00:01Z', duration: 100 },
        { id: 's3', taskId: 't1', stepIndex: 2, phase: 'execute', status: 'retry', timestamp: '2026-01-01T00:00:02Z', duration: 100 },
      ],
      safetyReport: null, performanceReport: null, accessibilityReport: null, newPatterns: [], summaryText: '',
    };
    const result = await node(state);
    expect(result.performanceReport!.stuckDetected).toBe(true);
  });
});

describe('summarizeNode', () => {
  it('generates summary with all reports', async () => {
    const node = createSummarizeNode();
    const state = {
      goal: 'Full summary test',
      history: [
        { id: 's1', taskId: 't1', stepIndex: 0, phase: 'observe', status: 'success', timestamp: '2026-01-01T00:00:00Z', duration: 100 },
      ],
      safetyReport: { riskLevel: 'low' as const, findings: [{ category: 'nav', description: 'External URL', severity: 'info' }] },
      performanceReport: { avgStepDuration: 100, slowSteps: [], retryCount: 0, stuckDetected: false },
      accessibilityReport: { wcagLevel: 'AA' as const, issues: [] },
      newPatterns: [],
      summaryText: '',
    };
    const result = await node(state);
    expect(result.summaryText).toContain('Full summary test');
    expect(result.summaryText).toContain('Risk level: low');
    expect(result.summaryText).toContain('Average step duration: 100ms');
    expect(result.summaryText).toContain('WCAG level: AA');
  });

  it('generates summary with null reports', async () => {
    const node = createSummarizeNode();
    const state = {
      goal: 'No reports test',
      history: [],
      safetyReport: null,
      performanceReport: null,
      accessibilityReport: null,
      newPatterns: [],
      summaryText: '',
    };
    const result = await node(state);
    expect(result.summaryText).toContain('Safety analysis not performed');
    expect(result.summaryText).toContain('Performance analysis not performed');
    expect(result.summaryText).toContain('Accessibility analysis not performed');
  });

  it('includes failure patterns in summary', async () => {
    const node = createSummarizeNode();
    const state = {
      goal: 'Pattern test',
      history: [],
      safetyReport: null,
      performanceReport: null,
      accessibilityReport: null,
      newPatterns: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          errorType: 'element-not-found',
          targetDescription: 'Submit button',
          remediationHint: 'Use data-testid',
          similarityKeywords: ['submit', 'button'],
          frequency: 1,
          lastSeen: '2026-01-01T00:00:00Z',
          relatedGoalPatterns: ['form submission'],
        },
      ],
      summaryText: '',
    };
    const result = await node(state);
    expect(result.summaryText).toContain('element-not-found');
    expect(result.summaryText).toContain('Use data-testid');
  });
});
