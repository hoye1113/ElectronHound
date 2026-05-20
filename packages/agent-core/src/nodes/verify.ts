import type { TestState } from '../state.js';
import type { VerdictResult } from '@eata/shared-types';
import { VerdictResultSchema } from '@eata/shared-types';
import { guardVerdict } from '../guards.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const verifyPrompt = readFileSync(join(__dirname, '..', 'prompts', 'verify.txt'), 'utf-8');

export interface VerifyNodeOptions {
  generateObject?: (params: {
    model: unknown;
    schema: typeof VerdictResultSchema;
    prompt: string;
    system: string;
  }) => Promise<{ object: unknown }>;
}

export function createVerifyNode(
  options: VerifyNodeOptions,
): (state: typeof TestState.State) => Promise<Partial<typeof TestState.State>> {
  return async (state: typeof TestState.State): Promise<Partial<typeof TestState.State>> => {
    const prompt = [
      `Goal: ${state.goal}`,
      `Expected outcome: ${state.currentPlan?.expectedOutcome ?? 'N/A'}`,
      `Actual result: ${JSON.stringify(state.currentExecResult?.result ?? 'N/A')}`,
      `Action success: ${state.currentExecResult?.success ?? false}`,
      `Step: ${state.stepCount}/${state.maxSteps}`,
      `Stuck counter: ${state.stuckCounter}`,
    ].join('\n');

    let verdictResult: VerdictResult;

    if (options.generateObject) {
      const result = await options.generateObject({
        model: {},
        schema: VerdictResultSchema,
        prompt,
        system: verifyPrompt,
      });
      verdictResult = guardVerdict(result.object);
    } else {
      if (!state.currentExecResult?.success) {
        verdictResult = { verdict: 'retry', reasoning: 'Execution failed' };
      } else if (state.stepCount >= state.maxSteps) {
        verdictResult = { verdict: 'fail', reasoning: 'Max steps reached' };
      } else {
        verdictResult = { verdict: 'pass', reasoning: 'Execution succeeded' };
      }
    }

    return {
      currentVerdict: verdictResult,
    };
  };
}

export const verifyNode = createVerifyNode({});
