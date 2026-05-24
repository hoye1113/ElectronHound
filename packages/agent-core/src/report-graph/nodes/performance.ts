import type { ReportState } from '../report-state-types.js';
import type { PerformanceReport } from '@eata/shared-types';
import { PerformanceReportSchema } from '@eata/shared-types';

export interface PerformanceNodeOptions {
  generateObject?: (params: {
    model: unknown;
    schema: typeof PerformanceReportSchema;
    prompt: string;
    system: string;
  }) => Promise<{ object: Partial<PerformanceReport> }>;
}

export function createPerformanceNode(
  options: PerformanceNodeOptions,
): (state: ReportState) => Promise<Partial<ReportState>> {
  return async (state: ReportState): Promise<Partial<ReportState>> => {
    const steps = state.history;
    const durations = steps.map((s) => s.duration).filter((d) => d > 0);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const retryCount = steps.filter((s) => s.status === 'retry').length;
    const stuckDetected = steps.length >= 3
      && steps.slice(-3).every((s) => s.status === 'retry');

    const slowThreshold = avgDuration > 0 ? avgDuration * 2 : 5000;
    const slowStepCandidates = steps.filter((s) => s.duration > slowThreshold && s.duration > 0);

    const historyContext = steps
      .slice(-10)
      .map((h) => `Step ${h.stepIndex} [${h.phase}/${h.status}]: duration=${h.duration}ms`)
      .join('\n');

    const prompt = [
      `Goal: ${state.goal}`,
      `Total steps: ${steps.length}`,
      `Average step duration: ${avgDuration.toFixed(0)}ms`,
      `Retry count: ${retryCount}`,
      `Stuck detected: ${stuckDetected}`,
      `Slow step candidates (duration > ${slowThreshold.toFixed(0)}ms):`,
      slowStepCandidates.map((s) => `  - Step ${s.stepIndex} (${s.phase}): ${s.duration}ms`).join('\n'),
      `\nStep history:\n${historyContext}`,
    ].join('\n');

    let performanceReport: PerformanceReport;

    if (options.generateObject) {
      const result = await options.generateObject({
        model: {},
        schema: PerformanceReportSchema,
        prompt,
        system: 'Analyze the test execution for performance issues. Identify slow steps, bottlenecks, and patterns of retries. Provide a structured performance report with avgStepDuration, slowSteps, retryCount, and stuckDetected.',
      });
      performanceReport = result.object as PerformanceReport;
    } else {
      performanceReport = {
        avgStepDuration: avgDuration,
        slowSteps: slowStepCandidates.map((s) => ({
          stepIndex: s.stepIndex,
          duration: s.duration,
          phase: s.phase,
        })),
        retryCount,
        stuckDetected,
      };
    }

    return {
      performanceReport,
    };
  };
}

export const performanceNode = createPerformanceNode({});
