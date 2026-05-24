import type { ReportState } from '../report-state-types.js';
import type { FeedbackPattern } from '@eata/shared-types';
import { FeedbackPatternSchema } from '@eata/shared-types';

export interface PatternNodeOptions {
  generateObject?: (params: {
    model: unknown;
    schema: typeof FeedbackPatternSchema;
    prompt: string;
    system: string;
  }) => Promise<{ object: Partial<FeedbackPattern> }>;
}

function extractErrorContext(state: ReportState): string {
  const failedSteps = state.history.filter((h) => h.status === 'failed');
  if (failedSteps.length === 0) return '';

  return failedSteps
    .map((s) => {
      const details = [
        `Step ${s.stepIndex} (phase: ${s.phase})`,
        s.observation ? `Observation: ${s.observation}` : null,
        s.reasoning ? `Reasoning: ${s.reasoning}` : null,
        s.action ? `Action: ${s.action.name}(${JSON.stringify(s.action.args)})` : null,
      ].filter(Boolean).join('\n');
      return details;
    })
    .join('\n\n---\n\n');
}

export function createPatternNode(
  options: PatternNodeOptions,
): (state: ReportState) => Promise<Partial<ReportState>> {
  return async (state: ReportState): Promise<Partial<ReportState>> => {
    const failedSteps = state.history.filter((h) => h.status === 'failed');
    if (failedSteps.length === 0) {
      return { newPatterns: [] };
    }

    const errorContext = extractErrorContext(state);

    const prompt = [
      `Goal: ${state.goal}`,
      `Failed steps:\n${errorContext}`,
    ].join('\n\n');

    let pattern: FeedbackPattern;

    if (options.generateObject) {
      const result = await options.generateObject({
        model: {},
        schema: FeedbackPatternSchema,
        prompt,
        system: `You are analyzing test execution failures to extract reusable patterns.

For each pattern, generate:
- errorType: A short label for the failure type (e.g., "element_not_found", "timeout", "unexpected_page_state")
- targetDescription: What was being attempted when the failure occurred
- remediationHint: A concrete suggestion for how to avoid this failure in future tests
- similarityKeywords: An array of 3-5 keywords that can be used to match similar failures

Output a single FeedbackPattern object. Use crypto.randomUUID() equivalent for id, set frequency=1, lastSeen=now, and relatedGoalPatterns to keywords from the goal.`,
      });
      pattern = result.object as FeedbackPattern;
    } else {
      // Deterministic fallback for testing - no patterns generated without LLM
      return { newPatterns: [] };
    }

    return {
      newPatterns: [pattern],
    };
  };
}

export const patternNode = createPatternNode({});
