import type { TestState } from '../state.js';
import type { VerdictResult } from '@eata/shared-types';
import { VerdictResultSchema } from '@eata/shared-types';
import { guardVerdict } from '../guards.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExamples } from '../prompts/few-shot/index.js';
import { runAuditChain } from '../sub-agents/index.js';
import type { AuditChainResult } from '../sub-agents/types.js';

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
    const fewShotExamples = await loadExamples({ goal: state.goal, maxExamples: 3 });
    const fewShotContext = fewShotExamples.length > 0
      ? `\n### Few-shot Examples:\n${fewShotExamples
          .map((ex) => `Goal: ${ex.goal}\nSteps: ${ex.steps.map((s) => JSON.stringify(s)).join(', ')}\nExpected Result: ${ex.expectedResult}`)
          .join('\n\n')}`
      : '';

    const prompt = [
      `Goal: ${state.goal}`,
      `Expected outcome: ${state.currentPlan?.expectedOutcome ?? 'N/A'}`,
      `Actual result: ${JSON.stringify(state.currentExecResult?.result ?? 'N/A')}`,
      `Action success: ${state.currentExecResult?.success ?? false}`,
      `Step: ${state.stepCount}/${state.maxSteps}`,
      `Stuck counter: ${state.stuckCounter}`,
      fewShotContext,
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

    // Run sub-agent audit chain after execution completes
    let auditChainResult: AuditChainResult | null = null;
    try {
      auditChainResult = await runAuditChain({
        goal: state.goal,
        targetAppPath: state.targetAppPath,
        context: state,
      });

      // Audit chain result can inform the verdict
      // If audit chain reports critical issues, consider adjusting verdict
      const auditSeverity = auditChainResult.executionAnalyst.auditReport.severity;
      if (auditSeverity === 'fail' && verdictResult.verdict === 'pass') {
        verdictResult = {
          verdict: 'fail',
          reasoning: `Audit chain reported critical issues: ${auditChainResult.executionAnalyst.auditReport.summary}`,
        };
      }
    } catch (error) {
      // Audit chain failure should not block the graph
      console.error('[verify] audit chain failed:', error);
    }

    return {
      currentVerdict: verdictResult,
      auditChainResult,
    };
  };
}

