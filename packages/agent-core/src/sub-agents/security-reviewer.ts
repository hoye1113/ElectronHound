import type { SubAgentInput, SubAgentOutput, AuditFinding, AuditReport } from './types.js';

/**
 * SecurityReviewer - 安全审查员
 *
 * Performs a deterministic security audit of the test goal and target app.
 * No LLM calls — uses a rule-based scanner against known Electron risk categories.
 */
export class SecurityReviewer {
  /** Audit rules checked against the target app and goal context. */
  private readonly rules = [
    {
      id: 'cmd-injection',
      category: 'command-injection',
      description: 'Check for shell command construction with unsanitised input',
      keywords: ['exec(', 'execSync(', 'spawn(', 'shell: true', 'child_process'],
      severity: 'fail' as const,
    },
    {
      id: 'data-exposure',
      category: 'data-exposure',
      description: 'Check for secrets or tokens appearing in context or goal',
      keywords: ['password', 'secret', 'token', 'apiKey', 'api_key', 'credential'],
      severity: 'fail' as const,
    },
    {
      id: 'auth-permission',
      category: 'auth-permission',
      description: 'Check whether authentication / permission flows are exercised',
      keywords: ['auth', 'login', 'logout', 'permission', 'role', 'admin'],
      severity: 'warn' as const,
    },
    {
      id: 'electron-nodeint',
      category: 'electron-security',
      description:
        'Electron: nodeIntegration should be disabled in renderer process',
      keywords: ['nodeIntegration', 'nodeIntegration:'],
      severity: 'fail' as const,
    },
    {
      id: 'electron-ctxisolation',
      category: 'electron-security',
      description:
        'Electron: contextIsolation should be enabled',
      keywords: ['contextIsolation', 'contextIsolation:'],
      severity: 'warn' as const,
    },
    {
      id: 'electron-remotemod',
      category: 'electron-security',
      description:
        'Electron: remote module should be disabled in modern apps',
      keywords: ['remote', 'require(’remote’)', "require('remote')"],
      severity: 'warn' as const,
    },
  ];

  /**
   * Scan the goal and context for security concerns and produce an audit report.
   */
  async run(input: SubAgentInput): Promise<SubAgentOutput> {
    const findings: AuditFinding[] = [];
    const recommendations: string[] = [];

    // Flatten all text sources to scan.
    const goalText = input.goal.toLowerCase();
    const contextText = Object.entries(input.context)
      .map(([k, v]) => `${k} ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ')
      .toLowerCase();
    const haystack = `${goalText} ${contextText}`;

    for (const rule of this.rules) {
      const hit = rule.keywords.some((kw) => haystack.includes(kw.toLowerCase()));
      if (hit) {
        findings.push({
          category: rule.category,
          description: rule.description,
          severity: rule.severity,
          evidence: `Keyword pattern matched: ${rule.keywords.find((kw) => haystack.includes(kw.toLowerCase())) ?? ''}`,
        });
        recommendations.push(`[SECURITY] ${rule.description}`);
      }
    }

    // Always recommend basic Electron hardening if no specific findings.
    if (findings.length === 0) {
      recommendations.push(
        'Verify that nodeIntegration=false, contextIsolation=true, and webSecurity=true in webPreferences.',
      );
    }

    // Derive overall severity.
    const hasFailure = findings.some((f) => f.severity === 'fail');
    const hasWarning = findings.some((f) => f.severity === 'warn');
    const severity: AuditReport['severity'] = hasFailure ? 'fail' : hasWarning ? 'warn' : 'pass';

    const auditReport: AuditReport = {
      severity,
      summary:
        findings.length === 0
          ? 'No security concerns identified by static rule scan.'
          : `${findings.length} security finding(s): ${findings.some((f) => f.severity === 'fail') ? 'FAIL' : 'WARN'} level issues detected.`,
      findings,
      timestamp: new Date().toISOString(),
    };

    return {
      role: 'security-reviewer',
      auditReport,
      analysis: auditReport.summary,
      recommendations,
    };
  }
}
