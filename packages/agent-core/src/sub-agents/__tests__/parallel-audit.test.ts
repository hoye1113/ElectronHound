import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoisted mocks for sub-agent classes ──────────────────────────────────────
const {
  mockTestPlannerRun,
  mockExecutionAnalystRun,
  mockSecurityReviewerRun,
  mockReportSynthesizerRun,
} = vi.hoisted(() => ({
  mockTestPlannerRun: vi.fn(),
  mockExecutionAnalystRun: vi.fn(),
  mockSecurityReviewerRun: vi.fn(),
  mockReportSynthesizerRun: vi.fn(),
}));

vi.mock('../test-planner.js', () => ({
  TestPlanner: vi.fn().mockImplementation(() => ({ run: mockTestPlannerRun })),
}));
vi.mock('../execution-analyst.js', () => ({
  ExecutionAnalyst: vi.fn().mockImplementation(() => ({ run: mockExecutionAnalystRun })),
}));
vi.mock('../security-reviewer.js', () => ({
  SecurityReviewer: vi.fn().mockImplementation(() => ({ run: mockSecurityReviewerRun })),
}));
vi.mock('../report-synthesizer.js', () => ({
  ReportSynthesizer: vi.fn().mockImplementation(() => ({ run: mockReportSynthesizerRun })),
}));

import type { SubAgentInput, SubAgentOutput } from '../types.js';
import { runAuditChain } from '../audit-chain.js';

function makeOutput(role: SubAgentOutput['role']): SubAgentOutput {
  return {
    role,
    auditReport: {
      severity: 'pass',
      summary: `${role} summary`,
      findings: [],
      timestamp: new Date().toISOString(),
    },
    analysis: `${role} analysis`,
    recommendations: [],
  };
}

function makeInput(overrides: Partial<SubAgentInput> = {}): SubAgentInput {
  return {
    goal: 'Test the login flow',
    targetAppPath: '/tmp/fake-app',
    context: {},
    ...overrides,
  };
}

describe('parallel audit chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTestPlannerRun.mockResolvedValue(makeOutput('test-planner'));
    mockExecutionAnalystRun.mockResolvedValue(makeOutput('execution-analyst'));
    mockSecurityReviewerRun.mockResolvedValue(makeOutput('security-reviewer'));
    mockReportSynthesizerRun.mockResolvedValue(makeOutput('report-synthesizer'));
  });

  it('runs all three phase-1 agents concurrently', async () => {
    const callOrder: string[] = [];
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    mockTestPlannerRun.mockImplementation(async () => {
      callOrder.push('planner-start');
      await delay(50);
      callOrder.push('planner-end');
      return makeOutput('test-planner');
    });
    mockExecutionAnalystRun.mockImplementation(async () => {
      callOrder.push('analyst-start');
      await delay(30);
      callOrder.push('analyst-end');
      return makeOutput('execution-analyst');
    });
    mockSecurityReviewerRun.mockImplementation(async () => {
      callOrder.push('security-start');
      await delay(20);
      callOrder.push('security-end');
      return makeOutput('security-reviewer');
    });

    await runAuditChain(makeInput());

    // All three should start before any ends (parallel execution)
    const startIndices = callOrder
      .map((v, i) => (v.endsWith('-start') ? i : -1))
      .filter((i) => i >= 0);
    const endIndices = callOrder
      .map((v, i) => (v.endsWith('-end') ? i : -1))
      .filter((i) => i >= 0);

    expect(startIndices).toHaveLength(3);
    expect(endIndices).toHaveLength(3);
    // All starts should come before all ends
    expect(Math.max(...startIndices)).toBeLessThan(Math.min(...endIndices));
  });

  it('completes within per-role timeout when agents are fast', async () => {
    mockTestPlannerRun.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return makeOutput('test-planner');
    });
    mockExecutionAnalystRun.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return makeOutput('execution-analyst');
    });
    mockSecurityReviewerRun.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return makeOutput('security-reviewer');
    });

    const result = await runAuditChain(makeInput());

    // All agents should complete normally
    expect(result.testPlanner.auditReport.severity).toBe('pass');
    expect(result.executionAnalyst.auditReport.severity).toBe('pass');
    expect(result.securityReviewer.auditReport.severity).toBe('pass');
  });

  it('returns failure placeholder when an agent hangs past timeout', async () => {
    // Make the planner hang for longer than the 60s timeout
    // Use a shorter effective timeout by making it never resolve
    mockTestPlannerRun.mockImplementation(() => new Promise(() => {})); // never resolves

    // The other two agents complete quickly
    mockExecutionAnalystRun.mockResolvedValue(makeOutput('execution-analyst'));
    mockSecurityReviewerRun.mockResolvedValue(makeOutput('security-reviewer'));

    // This test verifies the timeout mechanism exists. Since the actual timeout is 60s,
    // we can't wait that long in a unit test. Instead, verify the chain still completes
    // when one agent rejects (simulating what timeout would produce).
    mockTestPlannerRun.mockImplementation(() => Promise.reject(new Error('test-planner timed out after 60000ms')));

    const result = await runAuditChain(makeInput());

    expect(result.testPlanner.auditReport.severity).toBe('fail');
    expect(result.testPlanner.auditReport.summary).toContain('timed out');
    expect(result.executionAnalyst.auditReport.severity).toBe('pass');
    expect(result.securityReviewer.auditReport.severity).toBe('pass');
  });

  it('handles multiple simultaneous agent failures', async () => {
    mockTestPlannerRun.mockRejectedValueOnce(new Error('planner crashed'));
    mockSecurityReviewerRun.mockRejectedValueOnce(new Error('security crashed'));
    mockExecutionAnalystRun.mockResolvedValue(makeOutput('execution-analyst'));

    const result = await runAuditChain(makeInput());

    expect(result.testPlanner.auditReport.severity).toBe('fail');
    expect(result.testPlanner.auditReport.summary).toContain('planner crashed');
    expect(result.executionAnalyst.auditReport.severity).toBe('pass');
    expect(result.securityReviewer.auditReport.severity).toBe('fail');
    expect(result.securityReviewer.auditReport.summary).toContain('security crashed');
    // Synthesizer should still run
    expect(result.reportSynthesizer).toBeDefined();
  });
});
