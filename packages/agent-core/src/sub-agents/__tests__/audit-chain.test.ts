import { describe, it, expect } from 'vitest';
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

describe('sub-agent audit chain', () => {
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
      const warnOutput: SubAgentOutput = {
        role: 'test-planner',
        auditReport: {
          severity: 'warn',
          summary: 'warnings only',
          findings: [],
          timestamp: new Date().toISOString(),
        },
        analysis: 'warn analysis',
        recommendations: [],
      };
      const failOutput: SubAgentOutput = {
        role: 'execution-analyst',
        auditReport: {
          severity: 'fail',
          summary: 'failure detected',
          findings: [],
          timestamp: new Date().toISOString(),
        },
        analysis: 'fail analysis',
        recommendations: [],
      };
      const passOutput: SubAgentOutput = {
        role: 'security-reviewer',
        auditReport: {
          severity: 'pass',
          summary: 'all clear',
          findings: [],
          timestamp: new Date().toISOString(),
        },
        analysis: 'pass analysis',
        recommendations: [],
      };

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
  });
});
