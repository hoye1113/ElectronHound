import type { ReportState } from '../state.js';
import type { SafetyReport, PerformanceReport, AccessibilityReport } from '@eata/shared-types';

export function createSummarizeNode(): (
  state: typeof ReportState.State,
) => Promise<Partial<typeof ReportState.State>> {
  return async (state: typeof ReportState.State): Promise<Partial<typeof ReportState.State>> => {
    const parts: string[] = [];

    const safety = state.safetyReport as SafetyReport | null;
    const perf = state.performanceReport as PerformanceReport | null;
    const a11y = state.accessibilityReport as AccessibilityReport | null;

    parts.push(`## Test Summary for: ${state.goal}`);
    parts.push(`Total steps executed: ${state.history.length}`);
    parts.push('');

    // Safety
    parts.push('### Safety');
    if (safety) {
      parts.push(`Risk level: ${safety.riskLevel}`);
      if (safety.findings && safety.findings.length > 0) {
        safety.findings.forEach((f) => {
          parts.push(`- [${f.severity}] ${f.category}: ${f.description}`);
        });
      } else {
        parts.push('No safety issues detected.');
      }
    } else {
      parts.push('Safety analysis not performed.');
    }
    parts.push('');

    // Performance
    parts.push('### Performance');
    if (perf) {
      parts.push(`Average step duration: ${perf.avgStepDuration.toFixed(0)}ms`);
      parts.push(`Retry count: ${perf.retryCount}`);
      parts.push(`Stuck detected: ${perf.stuckDetected ? 'Yes' : 'No'}`);
      if (perf.slowSteps && perf.slowSteps.length > 0) {
        parts.push('Slow steps:');
        perf.slowSteps.forEach((s) => {
          parts.push(`  - Step ${s.stepIndex} (${s.phase}): ${s.duration}ms`);
        });
      }
    } else {
      parts.push('Performance analysis not performed.');
    }
    parts.push('');

    // Accessibility
    parts.push('### Accessibility');
    if (a11y) {
      parts.push(`WCAG level: ${a11y.wcagLevel}`);
      if (a11y.issues && a11y.issues.length > 0) {
        a11y.issues.forEach((i) => {
          parts.push(`- [${i.severity}] ${i.type} on ${i.element}: ${i.description}`);
        });
      } else {
        parts.push('No accessibility issues detected.');
      }
    } else {
      parts.push('Accessibility analysis not performed.');
    }
    parts.push('');

    // Patterns
    parts.push('### Patterns');
    const patterns = state.newPatterns || [];
    if (patterns.length > 0) {
      patterns.forEach((p) => {
        parts.push(`- ${p.errorType}: ${p.remediationHint}`);
      });
    } else {
      parts.push('No new failure patterns extracted.');
    }

    return {
      summaryText: parts.join('\n'),
    };
  };
}

export const summarizeNode = createSummarizeNode();
