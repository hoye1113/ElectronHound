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
  TestPlanner: vi.fn().mockImplementation(() => ({
    run: mockTestPlannerRun,
  })),
}));
vi.mock('../execution-analyst.js', () => ({
  ExecutionAnalyst: vi.fn().mockImplementation(() => ({
    run: mockExecutionAnalystRun,
  })),
}));
vi.mock('../security-reviewer.js', () => ({
  SecurityReviewer: vi.fn().mockImplementation(() => ({
    run: mockSecurityReviewerRun,
  })),
}));
vi.mock('../report-synthesizer.js', () => ({
  ReportSynthesizer: vi.fn().mockImplementation(() => ({
    run: mockReportSynthesizerRun,
  })),
}));

import type { SubAgentInput, SubAgentOutput } from '../types.js';
import { TestPlanner } from '../test-planner.js';
import { ExecutionAnalyst } from '../execution-analyst.js';
import { SecurityReviewer } from '../security-reviewer.js';
import { ReportSynthesizer } from '../report-synthesizer.js';
import { runAuditChain } from '../audit-chain.js';

/** Factory: create a minimal valid SubAgentInput. */
function makeInput(overrides: Partial<SubAgentInput> = {}): SubAgentInput {
  return {
    goal: 'Test the login flow in the dashboard app',
    targetAppPath: '/tmp/fake-app',
    context: {},
    ...overrides,
  };
}

/** Factory: create a valid SubAgentOutput for a given role. */
function makeOutput(role: SubAgentOutput['role'], overrides: Partial<SubAgentOutput> = {}): SubAgentOutput {
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
    ...overrides,
  };
}

/** Assert that a value satisfies the SubAgentOutput contract. */
function expectSubAgentOutput(output: SubAgentOutput, role: SubAgentOutput['role']): void {
  expect(output.role).toBe(role);
  expect(typeof output.analysis).toBe('string');
  expect(Array.isArray(output.recommendations)).toBe(true);
  expect(output.auditReport).toBeDefined();
  expect(['pass', 'warn', 'fail', 'info']).toContain(output.auditReport.severity);
  expect(typeof output.auditReport.summary).toBe('string');
  expect(Array.isArray(output.auditReport.findings)).toBe(true);
  expect(output.auditReport.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
}

/** Assert that a failure placeholder satisfies the SubAgentOutput contract with fail severity. */
function expectFailurePlaceholder(output: SubAgentOutput, role: SubAgentOutput['role']): void {
  expectSubAgentOutput(output, role);
  expect(output.auditReport.severity).toBe('fail');
  expect(output.auditReport.summary).toContain(`Agent '${role}' threw:`);
  expect(output.auditReport.findings).toEqual([]);
  expect(output.recommendations).toEqual([]);
}

describe('sub-agent audit chain', () => {
  // Wire mocked run methods to use real implementations by default.
  beforeEach(async () => {
    vi.clearAllMocks();

    const { TestPlanner: RealPlanner } = await vi.importActual<typeof import('../test-planner.js')>('../test-planner.js');
    const { ExecutionAnalyst: RealAnalyst } = await vi.importActual<typeof import('../execution-analyst.js')>('../execution-analyst.js');
    const { SecurityReviewer: RealSecurity } = await vi.importActual<typeof import('../security-reviewer.js')>('../security-reviewer.js');
    const { ReportSynthesizer: RealSynthesizer } = await vi.importActual<typeof import('../report-synthesizer.js')>('../report-synthesizer.js');

    const realPlanner = new RealPlanner();
    const realAnalyst = new RealAnalyst();
    const realSecurity = new RealSecurity();
    const realSynthesizer = new RealSynthesizer();

    mockTestPlannerRun.mockImplementation((input: SubAgentInput) => realPlanner.run(input));
    mockExecutionAnalystRun.mockImplementation((input: SubAgentInput) => realAnalyst.run(input));
    mockSecurityReviewerRun.mockImplementation((input: SubAgentInput) => realSecurity.run(input));
    mockReportSynthesizerRun.mockImplementation((input: SubAgentInput) => realSynthesizer.run(input));
  });

  describe('TestPlanner', () => {
    it('returns valid SubAgentOutput with test-planner role', async () => {
      const planner = new TestPlanner();
      const output = await planner.run(makeInput({ goal: 'Test login form navigation' }));
      expectSubAgentOutput(output, 'test-planner');
    });

    it('identifies scenarios from goal keywords', async () => {
      const planner = new TestPlanner();
      const output = await planner.run(makeInput({ goal: 'login then navigate to settings' }));
      // Should find at least "Authentication flow", "Navigation flow", "Settings/preferences"
      const scenarioFindings = output.auditReport.findings.filter(
        (f) => f.category === 'test-scenario',
      );
      expect(scenarioFindings.length).toBeGreaterThanOrEqual(3);
    });

    it('falls back to generic smoke test when no keywords match', async () => {
      const planner = new TestPlanner();
      const output = await planner.run(makeInput({ goal: 'verify application startup' }));
      const scenarioFindings = output.auditReport.findings.filter(
        (f) => f.category === 'test-scenario',
      );
      expect(scenarioFindings).toHaveLength(1);
      expect(scenarioFindings[0].description).toContain('smoke test');
    });

    it('detects risk factors in goal', async () => {
      const planner = new TestPlanner();
      const output = await planner.run(
        makeInput({ goal: 'test auth password reset via external api endpoint' }),
      );
      const riskFindings = output.auditReport.findings.filter((f) => f.category === 'risk');
      expect(riskFindings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ExecutionAnalyst', () => {
    it('returns valid SubAgentOutput with execution-analyst role', async () => {
      const analyst = new ExecutionAnalyst();
      const output = await analyst.run(makeInput());
      expectSubAgentOutput(output, 'execution-analyst');
    });

    it('reports pass when context.currentVerdict.verdict is "pass"', async () => {
      const analyst = new ExecutionAnalyst();
      const output = await analyst.run(
        makeInput({
          context: { currentVerdict: { verdict: 'pass', reasoning: 'All assertions passed' } },
        }),
      );
      expect(output.auditReport.severity).toBe('pass');
      expect(output.auditReport.findings).toHaveLength(0);
      expect(output.recommendations).toHaveLength(0);
    });

    it('reports fail when context.currentVerdict.verdict is not "pass"', async () => {
      const analyst = new ExecutionAnalyst();
      const output = await analyst.run(
        makeInput({
          context: {
            currentVerdict: { verdict: 'fail', reasoning: 'Element not found within timeout' },
          },
        }),
      );
      expect(output.auditReport.severity).toBe('fail');
      expect(output.auditReport.findings).toHaveLength(1);
      expect(output.auditReport.findings[0].category).toBe('execution');
      expect(output.recommendations.length).toBeGreaterThan(0);
    });

    it('reports warn when no verdict is present in context', async () => {
      const analyst = new ExecutionAnalyst();
      const output = await analyst.run(makeInput({ context: {} }));
      expect(output.auditReport.severity).toBe('warn');
    });
  });

  describe('SecurityReviewer', () => {
    it('returns valid SubAgentOutput with security-reviewer role', async () => {
      const security = new SecurityReviewer();
      const output = await security.run(makeInput());
      expectSubAgentOutput(output, 'security-reviewer');
    });

    it('flags auth-related keywords as warn', async () => {
      const security = new SecurityReviewer();
      const output = await security.run(makeInput({ goal: 'test admin login flow' }));
      const authFindings = output.auditReport.findings.filter(
        (f) => f.category === 'auth-permission',
      );
      expect(authFindings.length).toBeGreaterThan(0);
    });

    it('flags sensitive data keywords as fail', async () => {
      const security = new SecurityReviewer();
      const output = await security.run(
        makeInput({ goal: 'enter password token in login modal' }),
      );
      const dataFindings = output.auditReport.findings.filter(
        (f) => f.category === 'data-exposure',
      );
      expect(dataFindings.length).toBeGreaterThan(0);
      expect(output.auditReport.severity).toBe('fail');
    });

    it('passes cleanly for benign goal', async () => {
      const security = new SecurityReviewer();
      const output = await security.run(makeInput({ goal: 'verify window title is correct' }));
      expect(output.auditReport.severity).toBe('pass');
    });
  });

  describe('ReportSynthesizer', () => {
    it('returns valid SubAgentOutput with report-synthesizer role', async () => {
      const synth = new ReportSynthesizer();
      const output = await synth.run(makeInput());
      expectSubAgentOutput(output, 'report-synthesizer');
    });

    it('produces chain-integrity warning when upstream outputs are missing', async () => {
      const synth = new ReportSynthesizer();
      const output = await synth.run(makeInput({ context: {} }));
      const integrityFindings = output.auditReport.findings.filter(
        (f) => f.category === 'chain-integrity',
      );
      expect(integrityFindings).toHaveLength(3);
      expect(output.auditReport.summary).toContain('incomplete');
    });

    it('aggregates findings from all three upstream outputs', async () => {
      // Seed context with realistic upstream outputs.
      const planner = new TestPlanner();
      const analyst = new ExecutionAnalyst();
      const sec = new SecurityReviewer();

      const baseInput = makeInput({ goal: 'Test login with password auth flow' });
      const plannerOut = await planner.run(baseInput);
      const analystOut = await analyst.run({
        ...baseInput,
        context: { currentVerdict: { verdict: 'fail', reasoning: 'Timeout' } },
      });
      const securityOut = await sec.run(baseInput);

      const synth = new ReportSynthesizer();
      const output = await synth.run(
        makeInput({
          goal: baseInput.goal,
          targetAppPath: baseInput.targetAppPath,
          context: {
            testPlannerOutput: plannerOut,
            executionAnalystOutput: analystOut,
            securityReviewerOutput: securityOut,
          },
        }),
      );

      // All upstream findings should be present (prefixed with role).
      const upstreamFindingCount =
        plannerOut.auditReport.findings.length +
        analystOut.auditReport.findings.length +
        securityOut.auditReport.findings.length;
      expect(output.auditReport.findings.length).toBeGreaterThanOrEqual(upstreamFindingCount);

      // Chain should be complete.
      expect(output.auditReport.summary).not.toContain('incomplete');
    });

    it('picks worst severity across upstream outputs', async () => {
      const synth = new ReportSynthesizer();
      // Build a context where one upstream is "warn" and another is "fail".
      const warnOutput: SubAgentOutput = makeOutput('test-planner', {
        auditReport: {
          severity: 'warn',
          summary: 'warnings only',
          findings: [],
          timestamp: new Date().toISOString(),
        },
      });
      const failOutput: SubAgentOutput = makeOutput('execution-analyst', {
        auditReport: {
          severity: 'fail',
          summary: 'failure detected',
          findings: [],
          timestamp: new Date().toISOString(),
        },
      });
      const passOutput: SubAgentOutput = makeOutput('security-reviewer');

      const output = await synth.run(
        makeInput({
          context: {
            testPlannerOutput: warnOutput,
            executionAnalystOutput: failOutput,
            securityReviewerOutput: passOutput,
          },
        }),
      );
      expect(output.auditReport.severity).toBe('fail');
    });
  });

  describe('runAuditChain', () => {
    it('returns AuditChainResult with all 4 role outputs', async () => {
      const result = await runAuditChain(makeInput({ goal: 'Test login form navigation' }));

      expect(result.goal).toBe('Test login form navigation');
      expect(result.chainOrder).toEqual([
        'test-planner',
        'execution-analyst',
        'security-reviewer',
        'report-synthesizer',
      ]);
      expect(typeof result.completedAt).toBe('string');
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Each role's output should satisfy the contract.
      expectSubAgentOutput(result.testPlanner, 'test-planner');
      expectSubAgentOutput(result.executionAnalyst, 'execution-analyst');
      expectSubAgentOutput(result.securityReviewer, 'security-reviewer');
      expectSubAgentOutput(result.reportSynthesizer, 'report-synthesizer');
    });

    it('threads context between roles — report-synthesizer sees all upstream outputs', async () => {
      const result = await runAuditChain(makeInput({ goal: 'Verify dashboard renders correctly' }));

      // report-synthesizer's analysis should indicate chain completion (no integrity warnings).
      const integrityFindings = result.reportSynthesizer.auditReport.findings.filter(
        (f) => f.category === 'chain-integrity',
      );
      expect(integrityFindings).toHaveLength(0);
      expect(result.reportSynthesizer.auditReport.summary).not.toContain('incomplete');
    });

    it('preserves original goal in chain result', async () => {
      const goal = 'End-to-end: login → navigate → verify settings page';
      const result = await runAuditChain(makeInput({ goal }));
      expect(result.goal).toBe(goal);
    });

    // ── Error handling: test-planner failure (L57-69) ─────────────────────────

    it('returns partial result with 4 failure placeholders when test-planner throws', async () => {
      const errorMsg = 'planner exploded';
      mockTestPlannerRun.mockRejectedValueOnce(new Error(errorMsg));

      const result = await runAuditChain(makeInput({ goal: 'trigger planner error' }));

      expect(result.goal).toBe('trigger planner error');
      expect(result.chainOrder).toEqual([
        'test-planner',
        'execution-analyst',
        'security-reviewer',
        'report-synthesizer',
      ]);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // test-planner: failure placeholder with the actual error
      expectFailurePlaceholder(result.testPlanner, 'test-planner');
      expect(result.testPlanner.auditReport.summary).toContain(errorMsg);

      // downstream roles: skip placeholders
      expectFailurePlaceholder(result.executionAnalyst, 'execution-analyst');
      expect(result.executionAnalyst.auditReport.summary).toContain('Skipped: test-planner failed');

      expectFailurePlaceholder(result.securityReviewer, 'security-reviewer');
      expect(result.securityReviewer.auditReport.summary).toContain('Skipped: test-planner failed');

      expectFailurePlaceholder(result.reportSynthesizer, 'report-synthesizer');
      expect(result.reportSynthesizer.auditReport.summary).toContain('Skipped: test-planner failed');

      // Downstream agents should NOT have been called.
      expect(mockExecutionAnalystRun).not.toHaveBeenCalled();
      expect(mockSecurityReviewerRun).not.toHaveBeenCalled();
      expect(mockReportSynthesizerRun).not.toHaveBeenCalled();
    });

    // ── Error handling: execution-analyst failure (L80-93) ────────────────────

    it('returns partial result when execution-analyst throws', async () => {
      const errorMsg = 'analyst crashed';
      mockExecutionAnalystRun.mockRejectedValueOnce(new Error(errorMsg));

      const result = await runAuditChain(makeInput({ goal: 'trigger analyst error' }));

      expect(result.goal).toBe('trigger analyst error');

      // test-planner: succeeded (real output)
      expectSubAgentOutput(result.testPlanner, 'test-planner');

      // execution-analyst: failure placeholder
      expectFailurePlaceholder(result.executionAnalyst, 'execution-analyst');
      expect(result.executionAnalyst.auditReport.summary).toContain(errorMsg);

      // downstream: skip placeholders
      expectFailurePlaceholder(result.securityReviewer, 'security-reviewer');
      expect(result.securityReviewer.auditReport.summary).toContain(
        'Skipped: execution-analyst failed',
      );
      expectFailurePlaceholder(result.reportSynthesizer, 'report-synthesizer');
      expect(result.reportSynthesizer.auditReport.summary).toContain(
        'Skipped: execution-analyst failed',
      );

      // security-reviewer and report-synthesizer should NOT have been called.
      expect(mockSecurityReviewerRun).not.toHaveBeenCalled();
      expect(mockReportSynthesizerRun).not.toHaveBeenCalled();
    });

    // ── Error handling: security-reviewer failure (L109-120) ──────────────────

    it('returns partial result when security-reviewer throws', async () => {
      const errorMsg = 'security scan panicked';
      mockSecurityReviewerRun.mockRejectedValueOnce(new Error(errorMsg));

      const result = await runAuditChain(makeInput({ goal: 'trigger security error' }));

      expect(result.goal).toBe('trigger security error');

      // test-planner and execution-analyst: succeeded
      expectSubAgentOutput(result.testPlanner, 'test-planner');
      expectSubAgentOutput(result.executionAnalyst, 'execution-analyst');

      // security-reviewer: failure placeholder
      expectFailurePlaceholder(result.securityReviewer, 'security-reviewer');
      expect(result.securityReviewer.auditReport.summary).toContain(errorMsg);

      // report-synthesizer: skip placeholder
      expectFailurePlaceholder(result.reportSynthesizer, 'report-synthesizer');
      expect(result.reportSynthesizer.auditReport.summary).toContain(
        'Skipped: security-reviewer failed',
      );

      // report-synthesizer should NOT have been called.
      expect(mockReportSynthesizerRun).not.toHaveBeenCalled();
    });

    // ── Error handling: report-synthesizer failure (L136-147) ─────────────────

    it('returns partial result when report-synthesizer throws', async () => {
      const errorMsg = 'synthesis broke';
      mockReportSynthesizerRun.mockRejectedValueOnce(new Error(errorMsg));

      const result = await runAuditChain(makeInput({ goal: 'trigger synthesizer error' }));

      expect(result.goal).toBe('trigger synthesizer error');

      // All three upstream agents: succeeded
      expectSubAgentOutput(result.testPlanner, 'test-planner');
      expectSubAgentOutput(result.executionAnalyst, 'execution-analyst');
      expectSubAgentOutput(result.securityReviewer, 'security-reviewer');

      // report-synthesizer: failure placeholder
      expectFailurePlaceholder(result.reportSynthesizer, 'report-synthesizer');
      expect(result.reportSynthesizer.auditReport.summary).toContain(errorMsg);

      // Metadata should still be valid.
      expect(result.chainOrder).toEqual([
        'test-planner',
        'execution-analyst',
        'security-reviewer',
        'report-synthesizer',
      ]);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    // ── Error handling: non-Error throws (string, etc.) ──────────────────────

    it('handles non-Error thrown values via toErrorMessage', async () => {
      mockTestPlannerRun.mockRejectedValueOnce('raw string error');

      const result = await runAuditChain(makeInput());

      expectFailurePlaceholder(result.testPlanner, 'test-planner');
      expect(result.testPlanner.auditReport.summary).toContain('raw string error');
      expect(result.testPlanner.analysis).toContain('raw string error');
    });

    it('handles numeric thrown values', async () => {
      mockSecurityReviewerRun.mockRejectedValueOnce(42);

      const result = await runAuditChain(makeInput());

      expectSubAgentOutput(result.testPlanner, 'test-planner');
      expectSubAgentOutput(result.executionAnalyst, 'execution-analyst');
      expectFailurePlaceholder(result.securityReviewer, 'security-reviewer');
      expect(result.securityReviewer.auditReport.summary).toContain('42');
      expectFailurePlaceholder(result.reportSynthesizer, 'report-synthesizer');
    });

    // ── Edge cases ───────────────────────────────────────────────────────────

    it('passes context.testPlannerOutput to execution-analyst', async () => {
      let capturedInput: SubAgentInput | undefined;
      mockExecutionAnalystRun.mockImplementation(async (input: SubAgentInput) => {
        capturedInput = input;
        return makeOutput('execution-analyst');
      });

      await runAuditChain(makeInput({ goal: 'context check' }));

      expect(capturedInput).toBeDefined();
      expect(capturedInput!.context).toHaveProperty('testPlannerOutput');
      expect((capturedInput!.context['testPlannerOutput'] as SubAgentOutput).role).toBe(
        'test-planner',
      );
    });

    it('passes planner + analyst outputs to security-reviewer', async () => {
      let capturedInput: SubAgentInput | undefined;
      mockSecurityReviewerRun.mockImplementation(async (input: SubAgentInput) => {
        capturedInput = input;
        return makeOutput('security-reviewer');
      });

      await runAuditChain(makeInput());

      expect(capturedInput).toBeDefined();
      expect(capturedInput!.context).toHaveProperty('testPlannerOutput');
      expect(capturedInput!.context).toHaveProperty('executionAnalystOutput');
    });

    it('passes all three upstream outputs to report-synthesizer', async () => {
      let capturedInput: SubAgentInput | undefined;
      mockReportSynthesizerRun.mockImplementation(async (input: SubAgentInput) => {
        capturedInput = input;
        return makeOutput('report-synthesizer');
      });

      await runAuditChain(makeInput());

      expect(capturedInput).toBeDefined();
      expect(capturedInput!.context).toHaveProperty('testPlannerOutput');
      expect(capturedInput!.context).toHaveProperty('executionAnalystOutput');
      expect(capturedInput!.context).toHaveProperty('securityReviewerOutput');
    });

    it('preserves original input.context across the chain', async () => {
      let capturedInput: SubAgentInput | undefined;
      mockReportSynthesizerRun.mockImplementation(async (input: SubAgentInput) => {
        capturedInput = input;
        return makeOutput('report-synthesizer');
      });

      await runAuditChain(makeInput({ context: { customKey: 'customValue' } }));

      expect(capturedInput!.context['customKey']).toBe('customValue');
    });

    it('produces failure placeholder with correct analysis field', async () => {
      mockExecutionAnalystRun.mockRejectedValueOnce(new Error('boom'));

      const result = await runAuditChain(makeInput());

      expect(result.executionAnalyst.analysis).toContain('Execution of execution-analyst failed');
      expect(result.executionAnalyst.analysis).toContain('boom');
    });
  });
});
