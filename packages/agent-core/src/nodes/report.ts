import type { TestState } from '../test-state-types.js';
import type { ReportState } from '../report-graph/report-state-types.js';
import { safetyNode } from '../report-graph/nodes/safety.js';
import { performanceNode } from '../report-graph/nodes/performance.js';
import { accessibilityNode } from '../report-graph/nodes/accessibility.js';
import { patternNode } from '../report-graph/nodes/pattern.js';
import { summarizeNode } from '../report-graph/nodes/summarize.js';

export const reportNode = async (
  state: TestState,
): Promise<Partial<TestState>> => {
  const verdict = state.currentVerdict?.verdict;

  // Fan-out/fan-in: run safety, performance, accessibility, and pattern
  // analysis in parallel via Promise.all, then summarize the results.
  try {
    const baseState: ReportState = {
      goal: state.goal,
      history: state.history,
      safetyReport: null,
      performanceReport: null,
      accessibilityReport: null,
      newPatterns: null,
      summaryText: '',
    };

    // Fan-out: call all 4 analysis nodes in parallel
    const [safetyResult, performanceResult, accessibilityResult, patternResult] =
      await Promise.all([
        safetyNode(baseState),
        performanceNode(baseState),
        accessibilityNode(baseState),
        patternNode(baseState),
      ]);

    // Fan-in: summarize all results
    const summaryResult = await summarizeNode({
      goal: state.goal,
      history: state.history,
      safetyReport: safetyResult.safetyReport ?? null,
      performanceReport: performanceResult.performanceReport ?? null,
      accessibilityReport: accessibilityResult.accessibilityReport ?? null,
      newPatterns: patternResult.newPatterns ?? null,
      summaryText: '',
    });

    console.log(
      `[reportNode] Report analysis completed: safety=${safetyResult.safetyReport?.riskLevel ?? 'n/a'}, ` +
      `summaryLength=${summaryResult.summaryText?.length ?? 0}`,
    );
  } catch (err) {
    console.warn('[reportNode] Report sub-graph invocation failed, skipping analysis:', err);
  }

  const isPass = verdict === 'pass';
  if (isPass) {
    return { status: 'completed' };
  }

  const isExplicitFail = verdict === 'fail';
  const isMaxSteps = state.stepCount >= state.maxSteps;

  if (isExplicitFail || isMaxSteps) {
    return { status: 'failed' };
  }

  return { status: 'completed' };
};
