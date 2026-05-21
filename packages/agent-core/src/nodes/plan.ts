import type { TestState } from '../state.js';
import type { PlanResult, FeedbackPattern } from '@eata/shared-types';
import { PlanResultSchema } from '@eata/shared-types';
import { guardPlan } from '../guards.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExamples } from '../prompts/few-shot/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const planPrompt = readFileSync(join(__dirname, '..', 'prompts', 'plan.txt'), 'utf-8');

export interface PlanNodeOptions {
  generateObject?: (params: {
    model: unknown;
    schema: typeof PlanResultSchema;
    prompt: string;
    system: string;
  }) => Promise<{ object: unknown }>;
  getRelevantPatterns?: (goal: string) => FeedbackPattern[];
}

export function createPlanNode(
  options: PlanNodeOptions,
): (state: typeof TestState.State) => Promise<Partial<typeof TestState.State>> {
  return async (state: typeof TestState.State): Promise<Partial<typeof TestState.State>> => {
    const patterns: FeedbackPattern[] = options.getRelevantPatterns
      ? options.getRelevantPatterns(state.goal)
      : [];

    const historyContext = state.history
      .slice(-5)
      .map((h) => `Step ${h.stepIndex} [${h.phase}/${h.status}]: ${h.observation ?? 'N/A'}`)
      .join('\n');

    const patternsContext = patterns.length > 0
      ? `\nRelevant failure patterns from past tests:\n${patterns
          .map((p) => `- ${p.errorType}: ${p.remediationHint} (keywords: ${p.similarityKeywords.join(', ')})`)
          .join('\n')}`
      : '';

    const fewShotExamples = await loadExamples({ goal: state.goal, maxExamples: 3 });
    const fewShotContext = fewShotExamples.length > 0
      ? `\n### Few-shot Examples:\n${fewShotExamples
          .map((ex) => `Goal: ${ex.goal}\nSteps: ${ex.steps.map((s) => JSON.stringify(s)).join(', ')}\nExpected Result: ${ex.expectedResult}`)
          .join('\n\n')}`
      : '';

    const prompt = [
      `Goal: ${state.goal}`,
      `Current page: ${state.currentObservation?.ariaTree ?? 'No observation yet'}`,
      `Page title: ${state.currentObservation?.pageTitle ?? 'Unknown'}`,
      `Step: ${state.stepCount}/${state.maxSteps}`,
      `Stuck counter: ${state.stuckCounter}`,
      `Recent history:\n${historyContext}`,
      patternsContext,
      fewShotContext,
    ].join('\n\n');

    let planResult: PlanResult;

    if (options.generateObject) {
      const result = await options.generateObject({
        model: {},
        schema: PlanResultSchema,
        prompt,
        system: planPrompt,
      });
      planResult = guardPlan(result.object);
    } else {
      planResult = {
        reasoning: 'No LLM configured',
        toolCall: { name: 'browser_snapshot', args: {} },
        expectedOutcome: 'Get current page state',
      };
    }

    return {
      currentPlan: planResult,
    };
  };
}

