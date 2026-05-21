import type { TestState } from '../state.js';
import { createReportGraph } from '../report-graph/index.js';

export const reportNode = async (
  state: typeof TestState.State,
): Promise<Partial<typeof TestState.State>> => {
  const verdict = state.currentVerdict?.verdict;

  // Invoke the Report sub-graph to produce safety, performance, accessibility
  // and pattern analysis. This integrates the fan-out/fan-in Report Graph
  // (safety + perf + a11y + pattern → summarize) into the main test pipeline.
  try {
    const reportGraph = createReportGraph();
    const compiledReportGraph = reportGraph.compile();
    const reportOutput = await compiledReportGraph.invoke({
      goal: state.goal,
      history: state.history,
    });
    console.log(
      `[reportNode] Report graph completed: safety=${reportOutput.safetyReport?.riskLevel ?? 'n/a'}, ` +
      `summaryLength=${reportOutput.summaryText?.length ?? 0}`,
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
