import type { SubAgentInput, SubAgentOutput, AuditFinding, AuditReport } from './types.js';

/**
 * ExecutionAnalyst - 执行分析师
 *
 * Analyzes test execution results and produces a structured audit report
 * conforming to the SubAgentOutput contract.
 */
export class ExecutionAnalyst {
  /**
   * Analyze the test execution results and return a SubAgentOutput.
   *
   * Verdict information is read from `input.context.currentVerdict`
   * (carried over from the test state). If no verdict is present the
   * analysis defaults to an "unknown" / warn state.
   */
  async run(input: SubAgentInput): Promise<SubAgentOutput> {
    // Safely read verdict info from context.
    const rawVerdict = input.context['currentVerdict'] as
      | { verdict: string; reasoning?: string }
      | undefined;

    const verdict = rawVerdict?.verdict ?? 'unknown';
    const passed = verdict === 'pass';

    const findings: AuditFinding[] = [];

    if (!passed) {
      findings.push({
        category: 'execution',
        description: `Test did not pass — verdict was "${verdict}"`,
        severity: 'fail',
        evidence: rawVerdict?.reasoning,
      });
    }

    const auditReport: AuditReport = {
      severity: passed ? 'pass' : verdict === 'unknown' ? 'warn' : 'fail',
      summary: passed
        ? 'Test passed successfully.'
        : verdict === 'unknown'
          ? 'No verdict recorded — the test may not have completed.'
          : `Test failed: ${rawVerdict?.reasoning ?? 'Unknown reason'}`,
      findings,
      timestamp: new Date().toISOString(),
    };

    const recommendations: string[] = passed
      ? []
      : ['Review test execution steps and retry logic for failures.'];

    return {
      role: 'execution-analyst',
      auditReport,
      analysis: auditReport.summary,
      recommendations,
    };
  }
}
