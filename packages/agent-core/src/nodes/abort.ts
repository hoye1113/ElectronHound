import type { TestState } from '../test-state-types.js';

export const abortNode = async (
  state: TestState,
): Promise<Partial<TestState>> => {
  const reason = state.stuckCounter >= 3
    ? `Stuck detection: ${state.stuckCounter} identical observations`
    : state.stepCount >= state.maxSteps
      ? `Exceeded max steps: ${state.stepCount}/${state.maxSteps}`
      : 'Aborted by verify verdict: escalate';

  return {
    status: 'aborted',
  };
};
