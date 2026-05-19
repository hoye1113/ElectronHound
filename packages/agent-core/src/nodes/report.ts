import type { TestState } from '../state.js';

export const reportNode = async (
  state: typeof TestState.State,
): Promise<Partial<typeof TestState.State>> => {
  const verdict = state.currentVerdict?.verdict;
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
