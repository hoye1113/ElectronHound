import { describe, it, expect } from 'vitest';
import { TestPlanner } from '../sub-agents/test-planner.js';
import { ExecutionAnalyst } from '../sub-agents/execution-analyst.js';
import { SecurityReviewer } from '../sub-agents/security-reviewer.js';
import { ReportSynthesizer } from '../sub-agents/report-synthesizer.js';
import { runAuditChain } from '../sub-agents/audit-chain.js';
import type { SubAgentInput } from '../sub-agents/types.js';

function makeInput(overrides: Partial<SubAgentInput> = {}): SubAgentInput {
  return {
    goal: 'Test the login form',
    targetAppPath: '/test/app',
    context: {},
    ...overrides,
  };
}

describe('TestPlanner', () => {
  it('identifies login scenario from goal', async () => {
    const planner = new TestPlanner();
    const result = await planner.run(makeInput({ goal: 'Test the login form' }));

    expect(result.role).toBe('test-planner');
    expect(result.auditReport.severity).toBeDefined();
    expect(result.analysis).toContain('login');
    expect(result.auditReport.findings.some((f) => f.description.includes('Authentication flow'))).toBe(true);
  });

  it('identifies multiple scenarios', async () => {
    const planner = new TestPlanner();
    const result = await planner.run(makeInput({ goal: 'Click the login button and navigate to settings menu' }));

    expect(result.auditReport.findings.length).toBeGreaterThanOrEqual(2);
  });

  it('defaults to smoke test for unrecognized goals', async () => {
    const planner = new TestPlanner();
    const result = await planner.run(makeInput({ goal: 'xyzzy foobar' }));

    expect(result.analysis).toContain('Generic smoke test');
    expect(result.auditReport.findings.some((f) => f.description.includes('smoke test'))).toBe(true);
  });

  it('assesses risk for auth-related goals', async () => {
    const planner = new TestPlanner();
    const result = await planner.run(makeInput({ goal: 'Test authentication login flow' }));

    expect(result.auditReport.severity).toBe('warn');
    expect(result.recommendations.some((r) => r.includes('Mitigate'))).toBe(true);
  });

  it('returns info severity for low-risk goals', async () => {
    const planner = new TestPlanner();
    const result = await planner.run(makeInput({ goal: 'Click the settings button' }));

    expect(result.auditReport.severity).toBe('info');
  });

  it('always includes coverage recommendation', async () => {
    const planner = new TestPlanner();
    const result = await planner.run(makeInput());

    expect(result.recommendations.some((r) => r.includes('happy-path'))).toBe(true);
  });

  it('includes timestamp in audit report', async () => {
    const planner = new TestPlanner();
    const result = await planner.run(makeInput());

    expect(result.auditReport.timestamp).toBeDefined();
    expect(new Date(result.auditReport.timestamp).getTime()).not.toBeNaN();
  });
});

describe('ExecutionAnalyst', () => {
  it('reports pass when verdict is pass', async () => {
    const analyst = new ExecutionAnalyst();
    const result = await analyst.run(makeInput({
      context: { currentVerdict: { verdict: 'pass', reasoning: 'All good' } },
    }));

    expect(result.role).toBe('execution-analyst');
    expect(result.auditReport.severity).toBe('pass');
    expect(result.recommendations).toEqual([]);
  });

  it('reports fail when verdict is fail', async () => {
    const analyst = new ExecutionAnalyst();
    const result = await analyst.run(makeInput({
      context: { currentVerdict: { verdict: 'fail', reasoning: 'Element not found' } },
    }));

    expect(result.auditReport.severity).toBe('fail');
    expect(result.auditReport.findings).toHaveLength(1);
    expect(result.auditReport.findings[0].severity).toBe('fail');
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('reports warn when no verdict present', async () => {
    const analyst = new ExecutionAnalyst();
    const result = await analyst.run(makeInput({ context: {} }));

    expect(result.auditReport.severity).toBe('warn');
    expect(result.analysis).toContain('No verdict recorded');
  });

  it('reports fail for retry verdict', async () => {
    const analyst = new ExecutionAnalyst();
    const result = await analyst.run(makeInput({
      context: { currentVerdict: { verdict: 'retry', reasoning: 'Timeout' } },
    }));

    expect(result.auditReport.severity).toBe('fail');
  });
});

describe('SecurityReviewer', () => {
  it('returns pass when no security keywords found', async () => {
    const reviewer = new SecurityReviewer();
    const result = await reviewer.run(makeInput({ goal: 'Click the settings button' }));

    expect(result.role).toBe('security-reviewer');
    expect(result.auditReport.severity).toBe('pass');
    expect(result.auditReport.findings).toHaveLength(0);
  });

  it('detects command injection keywords', async () => {
    const reviewer = new SecurityReviewer();
    const result = await reviewer.run(makeInput({
      goal: 'Test exec() function in the app',
    }));

    expect(result.auditReport.findings.some((f) => f.category === 'command-injection')).toBe(true);
    expect(result.auditReport.severity).toBe('fail');
  });

  it('detects data exposure keywords', async () => {
    const reviewer = new SecurityReviewer();
    const result = await reviewer.run(makeInput({
      goal: 'Test password reset flow',
    }));

    expect(result.auditReport.findings.some((f) => f.category === 'data-exposure')).toBe(true);
  });

  it('detects auth/permission keywords', async () => {
    const reviewer = new SecurityReviewer();
    const result = await reviewer.run(makeInput({
      goal: 'Test login and logout flow',
    }));

    expect(result.auditReport.findings.some((f) => f.category === 'auth-permission')).toBe(true);
    expect(result.auditReport.severity).toBe('warn');
  });

  it('scans context for security keywords', async () => {
    const reviewer = new SecurityReviewer();
    const result = await reviewer.run(makeInput({
      goal: 'Test the app',
      context: { code: 'child_process.execSync("rm -rf /")' },
    }));

    expect(result.auditReport.findings.some((f) => f.category === 'command-injection')).toBe(true);
  });

  it('recommends basic hardening when no findings', async () => {
    const reviewer = new SecurityReviewer();
    const result = await reviewer.run(makeInput({ goal: 'Click button' }));

    expect(result.recommendations.some((r) => r.includes('nodeIntegration'))).toBe(true);
  });
});

describe('ReportSynthesizer', () => {
  it('synthesizes all upstream outputs', async () => {
    const synthesizer = new ReportSynthesizer();
    const result = await synthesizer.run(makeInput({
      context: {
        testPlannerOutput: {
          role: 'test-planner',
          auditReport: { severity: 'info', summary: 'Plan ok', findings: [], timestamp: new Date().toISOString() },
          analysis: 'Plan ok',
          recommendations: [],
        },
        executionAnalystOutput: {
          role: 'execution-analyst',
          auditReport: { severity: 'pass', summary: 'Exec ok', findings: [], timestamp: new Date().toISOString() },
          analysis: 'Exec ok',
          recommendations: [],
        },
        securityReviewerOutput: {
          role: 'security-reviewer',
          auditReport: { severity: 'pass', summary: 'Security ok', findings: [], timestamp: new Date().toISOString() },
          analysis: 'Security ok',
          recommendations: [],
        },
      },
    }));

    expect(result.role).toBe('report-synthesizer');
    // Worst severity: info (testPlanner) > pass (executionAnalyst, securityReviewer)
    expect(result.auditReport.severity).toBe('info');
    expect(result.analysis).toContain('All 3 upstream stages present');
  });

  it('detects missing upstream outputs', async () => {
    const synthesizer = new ReportSynthesizer();
    const result = await synthesizer.run(makeInput({ context: {} }));

    expect(result.auditReport.findings.some((f) => f.category === 'chain-integrity')).toBe(true);
    expect(result.analysis).toContain('Chain incomplete');
  });

  it('propagates worst severity', async () => {
    const synthesizer = new ReportSynthesizer();
    const result = await synthesizer.run(makeInput({
      context: {
        testPlannerOutput: {
          role: 'test-planner',
          auditReport: { severity: 'info', summary: '', findings: [], timestamp: '' },
          analysis: '',
          recommendations: [],
        },
        executionAnalystOutput: {
          role: 'execution-analyst',
          auditReport: { severity: 'fail', summary: '', findings: [{ category: 'exec', description: 'fail', severity: 'fail' }], timestamp: '' },
          analysis: '',
          recommendations: [],
        },
        securityReviewerOutput: {
          role: 'security-reviewer',
          auditReport: { severity: 'pass', summary: '', findings: [], timestamp: '' },
          analysis: '',
          recommendations: [],
        },
      },
    }));

    expect(result.auditReport.severity).toBe('fail');
  });

  it('deduplicates recommendations', async () => {
    const synthesizer = new ReportSynthesizer();
    const result = await synthesizer.run(makeInput({
      context: {
        testPlannerOutput: {
          role: 'test-planner',
          auditReport: { severity: 'info', summary: '', findings: [], timestamp: '' },
          analysis: '',
          recommendations: ['Same recommendation'],
        },
        executionAnalystOutput: {
          role: 'execution-analyst',
          auditReport: { severity: 'pass', summary: '', findings: [], timestamp: '' },
          analysis: '',
          recommendations: ['Same recommendation'],
        },
        securityReviewerOutput: {
          role: 'security-reviewer',
          auditReport: { severity: 'pass', summary: '', findings: [], timestamp: '' },
          analysis: '',
          recommendations: [],
        },
      },
    }));

    const sameRecs = result.recommendations.filter((r) => r === 'Same recommendation');
    expect(sameRecs).toHaveLength(1);
  });
});

describe('runAuditChain', () => {
  it('runs all 4 stages in order', async () => {
    const result = await runAuditChain(makeInput());

    expect(result.goal).toBe('Test the login form');
    expect(result.testPlanner).toBeDefined();
    expect(result.executionAnalyst).toBeDefined();
    expect(result.securityReviewer).toBeDefined();
    expect(result.reportSynthesizer).toBeDefined();
    expect(result.chainOrder).toEqual([
      'test-planner', 'execution-analyst', 'security-reviewer', 'report-synthesizer',
    ]);
  });

  it('includes duration and timestamp', async () => {
    const result = await runAuditChain(makeInput());

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.completedAt).toBeDefined();
    expect(new Date(result.completedAt).getTime()).not.toBeNaN();
  });

  it('each stage has correct role', async () => {
    const result = await runAuditChain(makeInput());

    expect(result.testPlanner.role).toBe('test-planner');
    expect(result.executionAnalyst.role).toBe('execution-analyst');
    expect(result.securityReviewer.role).toBe('security-reviewer');
    expect(result.reportSynthesizer.role).toBe('report-synthesizer');
  });

  it('propagates context between stages', async () => {
    const result = await runAuditChain(makeInput({
      goal: 'Test password authentication login',
      context: { extra: 'data' },
    }));

    // Security reviewer should detect auth + password keywords
    expect(result.securityReviewer.auditReport.findings.length).toBeGreaterThan(0);
  });
});
