import { TestState } from '../state.js';
import type { FewShotExample } from '../prompts/few-shot/types.js';
import { loadExamples } from '../prompts/few-shot/index.js';

/**
 * ExecutionAnalyst - 执行分析师
 * 分析测试结果，提出改进建议
 */
export class ExecutionAnalyst {
  /**
   * Analyze the test execution results
   */
  async analyze(state: typeof TestState.State): Promise<{
    success: boolean;
    analysis: {
      passed: boolean;
      message: string;
      recommendations?: string[];
    };
  }> {
    // Load relevant examples
    const examples: FewShotExample[] = await loadExamples({
      goal: state.goal,
      maxExamples: 3,
    });

    // Analyze the execution results
    const verdict = state.currentVerdict?.verdict || 'failed';
    const passed = verdict === 'pass';

    return {
      success: true,
      analysis: {
        passed,
        message: passed
          ? 'Test passed successfully'
          : `Test failed: ${state.currentVerdict?.reasoning || 'Unknown reason'}`,
        recommendations: passed ? [] : ['Please review the test execution'],
      },
    };
  }
}
