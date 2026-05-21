import type { SubAgentInput, SubAgentOutput, AuditFinding, AuditReport } from './types.js';

/**
 * ReportSynthesizer - 报告综合师
 *
 * Aggregates outputs from test-planner, execution-analyst, and security-reviewer
 * (carried in context) into a single unified audit report.
 */
export class ReportSynthesizer {
  /** Context key under which each upstream output is expected. */
  static readonly CONTEXT_KEYS = {
    testPlanner: 'testPlannerOutput',
    executionAnalyst: 'executionAnalystOutput',
    securityReviewer: 'securityReviewerOutput',
  } as const;

  /**
   * Synthesize all upstream outputs into a unified report.
   */
  async run(input: SubAgentInput): Promise<SubAgentOutput> {
    const upstreamOutputs: SubAgentOutput[] = [];
    const recommendations: string[] = [];
    const findings: AuditFinding[] = [];

    // Collect outputs from context.
    for (const key of Object.values(ReportSynthesizer.CONTEXT_KEYS)) {
      const raw = input.context[key] as SubAgentOutput | undefined;
      if (!raw) {
        findings.push({
          category: 'chain-integrity',
          description: `Missing upstream output for key "${key}" — chain may be incomplete`,
          severity: 'warn',
        });
        recommendations.push(`Investigate missing upstream output: ${key}`);
        continue;
      }
      upstreamOutputs.push(raw);

      // Merge findings.
      findings.push(
        ...raw.auditReport.findings.map((f) => ({
          ...f,
          description: `[${raw.role}] ${f.description}`,
        })),
      );

      // Merge recommendations (deduplicate).
      for (const rec of raw.recommendations) {
        if (!recommendations.includes(rec)) {
          recommendations.push(rec);
        }
      }
    }

    // Determine overall severity (worst-of).
    const severityOrder: Record<AuditReport['severity'], number> = {
      pass: 0,
      info: 1,
      warn: 2,
      fail: 3,
    };

    let worstSeverity: AuditReport['severity'] = 'pass';
    for (const output of upstreamOutputs) {
      const s = severityOrder[output.auditReport.severity] ?? 0;
      if (s > severityOrder[worstSeverity]) {
        worstSeverity = output.auditReport.severity;
      }
    }

    // If chain-integrity findings exist, bump to warn.
    if (findings.some((f) => f.severity === 'fail') && worstSeverity !== 'fail') {
      worstSeverity = 'warn';
    }

    const chainComplete = upstreamOutputs.length === 3;
    const summary = chainComplete
      ? `All 3 upstream stages present. Overall severity: ${worstSeverity}. Total findings: ${upstreamOutputs.reduce((n, o) => n + o.auditReport.findings.length, 0)}.`
      : `Chain incomplete (${upstreamOutputs.length}/3 upstream outputs). Findings may be partial.`;

    recommendations.push(
      chainComplete
        ? 'Review per-role findings for actionable follow-up.'
        : 'Re-run the full audit chain to ensure complete coverage.',
    );

    const auditReport: AuditReport = {
      severity: worstSeverity,
      summary,
      findings,
      timestamp: new Date().toISOString(),
    };

    return {
      role: 'report-synthesizer',
      auditReport,
      analysis: summary,
      recommendations,
    };
  }
}
