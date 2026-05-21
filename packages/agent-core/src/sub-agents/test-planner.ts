import type { SubAgentInput, SubAgentOutput, AuditFinding, AuditReport } from './types.js';

/**
 * TestPlanner - 测试策划师
 *
 * Analyzes the test goal and produces a structured test plan audit report.
 * Deterministic: no LLM calls — uses keyword heuristics and goal analysis.
 */
export class TestPlanner {
  /**
   * Analyze the goal and produce a structured test plan audit.
   */
  async run(input: SubAgentInput): Promise<SubAgentOutput> {
    const findings: AuditFinding[] = [];
    const recommendations: string[] = [];

    // Derive test scenarios from goal text via keyword heuristics.
    const goal = input.goal.toLowerCase();
    const scenarios: string[] = [];

    const scenarioKeywords: Record<string, string> = {
      login: 'Authentication flow',
      signup: 'Registration flow',
      register: 'Registration flow',
      form: 'Form interaction',
      input: 'User input handling',
      click: 'Click interactions',
      navigate: 'Navigation flow',
      menu: 'Menu interactions',
      dialog: 'Dialog handling',
      modal: 'Modal handling',
      file: 'File operations',
      save: 'Save/persist operations',
      open: 'Open/launch operations',
      window: 'Window management',
      settings: 'Settings/preferences',
      dashboard: 'Dashboard view',
      search: 'Search functionality',
      export: 'Export functionality',
      print: 'Print functionality',
    };

    const seen = new Set<string>();
    for (const [keyword, label] of Object.entries(scenarioKeywords)) {
      if (goal.includes(keyword) && !seen.has(label)) {
        seen.add(label);
        scenarios.push(label);
        findings.push({
          category: 'test-scenario',
          description: `Identified scenario: ${label}`,
          severity: 'info',
        });
      }
    }

    // Always include a generic smoke-test scenario if nothing else matched.
    if (scenarios.length === 0) {
      scenarios.push('Generic smoke test');
      findings.push({
        category: 'test-scenario',
        description: 'No specific keyword patterns detected — defaulting to smoke test',
        severity: 'info',
      });
    }

    // Risk assessment.
    const riskIndicators = [
      { keyword: 'auth', label: 'Authentication-related goal — high risk of flakiness' },
      { keyword: 'password', label: 'Password handling — sensitive data in context' },
      { keyword: 'api', label: 'API-dependent — may need network mocking' },
      { keyword: 'async', label: 'Async behavior — potential timing issues' },
      { keyword: 'external', label: 'External resource dependency — isolation risk' },
    ];

    let riskCount = 0;
    for (const { keyword, label } of riskIndicators) {
      if (goal.includes(keyword)) {
        riskCount += 1;
        findings.push({
          category: 'risk',
          description: label,
          severity: 'warn',
        });
        recommendations.push(`Mitigate: ${label}`);
      }
    }

    // Coverage recommendations.
    recommendations.push('Ensure both happy-path and error-path are covered.');
    if (scenarios.length > 1) {
      recommendations.push('Consider combining scenarios to reduce total test count.');
    }

    // Overall severity.
    const hasWarnings = findings.some((f) => f.severity === 'warn');
    const severity: AuditReport['severity'] = hasWarnings ? 'warn' : 'info';

    const auditReport: AuditReport = {
      severity,
      summary:
        `Test plan: ${scenarios.length} scenario(s) identified. ` +
        `${riskCount} risk factor(s) noted.`,
      findings,
      timestamp: new Date().toISOString(),
    };

    return {
      role: 'test-planner',
      auditReport,
      analysis:
        `Goal "${input.goal}" yields scenarios: ${scenarios.join(', ')}. ` +
        `Risk level: ${riskCount > 0 ? 'elevated' : 'normal'}.`,
      recommendations,
    };
  }
}
