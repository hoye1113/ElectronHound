import type { TestState } from '../state.js';

export const abortNode = async (
  state: typeof TestState.State,
): Promise<Partial<typeof TestState.State>> => {
  const reason = state.stuckCounter >= 3
    ? `Stuck detection: ${state.stuckCounter} identical observations`
    : state.stepCount >= state.maxSteps
      ? `Exceeded max steps: ${state.stepCount}/${state.maxSteps}`
      : 'Aborted by verify verdict: escalate';

  return {
    status: 'aborted',
  };
};
