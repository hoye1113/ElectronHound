import type { ReportState } from '../report-state-types.js';
import type { SafetyReport } from '@eata/shared-types';
import { SafetyReportSchema } from '@eata/shared-types';

export interface SafetyNodeOptions {
  generateObject?: (params: {
    model: unknown;
    schema: typeof SafetyReportSchema;
    prompt: string;
    system: string;
  }) => Promise<{ object: Partial<SafetyReport> }>;
}

export function createSafetyNode(
  options: SafetyNodeOptions,
): (state: ReportState) => Promise<Partial<ReportState>> {
  return async (state: ReportState): Promise<Partial<ReportState>> => {
    const historyContext = state.history
      .slice(-10)
      .map((h) => `Step ${h.stepIndex} [${h.phase}/${h.status}]: ${h.observation ?? 'N/A'}`)
      .join('\n');

    const failedSteps = state.history.filter((h) => h.status === 'failed');
    const failedContext = failedSteps.length > 0
      ? `\nFailed steps:\n${failedSteps.map((s) => `- Step ${s.stepIndex}: ${s.reasoning ?? s.observation ?? 'No details'}`).join('\n')}`
      : '';

    const prompt = [
      `Goal: ${state.goal}`,
      `Total steps: ${state.history.length}`,
      `Recent history:\n${historyContext}`,
      failedContext,
    ].join('\n\n');

    let safetyReport: SafetyReport;

    if (options.generateObject) {
      const result = await options.generateObject({
        model: {},
        schema: SafetyReportSchema,
        prompt,
        system: 'Analyze the test execution history for safety concerns. Identify potential security risks, data exposure, privilege escalation, or any dangerous operations. If nothing found, return riskLevel "none" with empty findings.',
      });
      safetyReport = result.object as SafetyReport;
    } else {
      safetyReport = {
        riskLevel: 'none',
        findings: [],
      };
    }

    return {
      safetyReport,
    };
  };
}

export const safetyNode = createSafetyNode({});
