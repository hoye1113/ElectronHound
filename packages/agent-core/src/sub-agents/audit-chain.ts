import type { SubAgentInput, AuditChainResult, SubAgentOutput, SubAgentRole } from './types.js';
import { TestPlanner } from './test-planner.js';
import { ExecutionAnalyst } from './execution-analyst.js';
import { SecurityReviewer } from './security-reviewer.js';
import { ReportSynthesizer } from './report-synthesizer.js';
import { toErrorMessage } from '../utils/error.js';
import { createStderrLogger } from '../utils/logger.js';

const logger = createStderrLogger('audit-chain');

/**
 * Create a failure output placeholder for a sub-agent that threw an exception.
 */
function makeFailureOutput(role: SubAgentRole, error: unknown): SubAgentOutput {
  const message = toErrorMessage(error);
  return {
    role,
    auditReport: {
      severity: 'fail',
      summary: `Agent '${role}' threw: ${message}`,
      findings: [],
      timestamp: new Date().toISOString(),
    },
    analysis: `Execution of ${role} failed: ${message}`,
    recommendations: [],
  };
}

/**
 * Runs the full 4-role sub-agent audit chain sequentially.
 *
 * Pipeline order:
 *   1. test-planner → output injected into downstream context
 *   2. execution-analyst → receives planner output in context
 *   3. security-reviewer → receives planner + analyst outputs
 *   4. report-synthesizer → receives all three upstream outputs
 *
 * Returns `AuditChainResult` with every role's output, chain ordering,
 * wall-clock duration, and completion timestamp.
 *
 * If any agent throws, the chain stops and returns a partial result
 * with all successful outputs plus a failure placeholder for the agent
 * that failed. Downstream agents receive the failure placeholder as context.
 */
export async function runAuditChain(input: SubAgentInput): Promise<AuditChainResult> {
  const startTime = Date.now();

  const planner = new TestPlanner();
  const analyst = new ExecutionAnalyst();
  const security = new SecurityReviewer();
  const synthesizer = new ReportSynthesizer();

  // 1. TestPlanner — uses original input.
  let testPlannerOutput: SubAgentOutput;
  try {
    testPlannerOutput = await planner.run(input);
  } catch (err: unknown) {
    logger.error(`test-planner failed: ${toErrorMessage(err)}`);
    return {
      goal: input.goal,
      testPlanner: makeFailureOutput('test-planner', err),
      executionAnalyst: makeFailureOutput('execution-analyst', 'Skipped: test-planner failed'),
      securityReviewer: makeFailureOutput('security-reviewer', 'Skipped: test-planner failed'),
      reportSynthesizer: makeFailureOutput('report-synthesizer', 'Skipped: test-planner failed'),
      chainOrder: ['test-planner', 'execution-analyst', 'security-reviewer', 'report-synthesizer'],
      durationMs: Date.now() - startTime,
      completedAt: new Date().toISOString(),
    };
  }

  // 2. ExecutionAnalyst — carries planner output in context.
  const executionInput: SubAgentInput = {
    ...input,
    context: {
      ...input.context,
      testPlannerOutput,
    },
  };
  let executionAnalystOutput: SubAgentOutput;
  try {
    executionAnalystOutput = await analyst.run(executionInput);
  } catch (err: unknown) {
    logger.error(`execution-analyst failed: ${toErrorMessage(err)}`);
    return {
      goal: input.goal,
      testPlanner: testPlannerOutput,
      executionAnalyst: makeFailureOutput('execution-analyst', err),
      securityReviewer: makeFailureOutput('security-reviewer', 'Skipped: execution-analyst failed'),
      reportSynthesizer: makeFailureOutput('report-synthesizer', 'Skipped: execution-analyst failed'),
      chainOrder: ['test-planner', 'execution-analyst', 'security-reviewer', 'report-synthesizer'],
      durationMs: Date.now() - startTime,
      completedAt: new Date().toISOString(),
    };
  }

  // 3. SecurityReviewer — carries planner + analyst outputs.
  const securityInput: SubAgentInput = {
    ...input,
    context: {
      ...input.context,
      testPlannerOutput,
      executionAnalystOutput,
    },
  };
  let securityReviewerOutput: SubAgentOutput;
  try {
    securityReviewerOutput = await security.run(securityInput);
  } catch (err: unknown) {
    logger.error(`security-reviewer failed: ${toErrorMessage(err)}`);
    return {
      goal: input.goal,
      testPlanner: testPlannerOutput,
      executionAnalyst: executionAnalystOutput,
      securityReviewer: makeFailureOutput('security-reviewer', err),
      reportSynthesizer: makeFailureOutput('report-synthesizer', 'Skipped: security-reviewer failed'),
      chainOrder: ['test-planner', 'execution-analyst', 'security-reviewer', 'report-synthesizer'],
      durationMs: Date.now() - startTime,
      completedAt: new Date().toISOString(),
    };
  }

  // 4. ReportSynthesizer — carries all three upstream outputs.
  const synthesizerInput: SubAgentInput = {
    ...input,
    context: {
      ...input.context,
      testPlannerOutput,
      executionAnalystOutput,
      securityReviewerOutput,
    },
  };
  let reportSynthesizerOutput: SubAgentOutput;
  try {
    reportSynthesizerOutput = await synthesizer.run(synthesizerInput);
  } catch (err: unknown) {
    logger.error(`report-synthesizer failed: ${toErrorMessage(err)}`);
    return {
      goal: input.goal,
      testPlanner: testPlannerOutput,
      executionAnalyst: executionAnalystOutput,
      securityReviewer: securityReviewerOutput,
      reportSynthesizer: makeFailureOutput('report-synthesizer', err),
      chainOrder: ['test-planner', 'execution-analyst', 'security-reviewer', 'report-synthesizer'],
      durationMs: Date.now() - startTime,
      completedAt: new Date().toISOString(),
    };
  }

  return {
    goal: input.goal,
    testPlanner: testPlannerOutput,
    executionAnalyst: executionAnalystOutput,
    securityReviewer: securityReviewerOutput,
    reportSynthesizer: reportSynthesizerOutput,
    chainOrder: ['test-planner', 'execution-analyst', 'security-reviewer', 'report-synthesizer'],
    durationMs: Date.now() - startTime,
    completedAt: new Date().toISOString(),
  };
}
