import type { SubAgentInput, AuditChainResult, SubAgentOutput, SubAgentRole } from './types.js';
import { TestPlanner } from './test-planner.js';
import { ExecutionAnalyst } from './execution-analyst.js';
import { SecurityReviewer } from './security-reviewer.js';
import { ReportSynthesizer } from './report-synthesizer.js';
import { toErrorMessage } from '../utils/error.js';
import { createStderrLogger } from '../utils/logger.js';

const logger = createStderrLogger('audit-chain');

const ROLE_TIMEOUT_MS = 60_000; // 60 seconds per role

/**
 * Race a promise against a timeout. Rejects with a timeout error if the
 * promise does not settle within `ms` milliseconds.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

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
 * Runs the full 4-role sub-agent audit chain.
 *
 * Pipeline order:
 *   1. test-planner, execution-analyst, security-reviewer run IN PARALLEL
 *   2. report-synthesizer receives all three upstream outputs
 *
 * Returns `AuditChainResult` with every role's output, chain ordering,
 * wall-clock duration, and completion timestamp.
 *
 * If any of the first 3 agents throws, the chain continues with the
 * remaining agents and uses a failure placeholder for the failed agent.
 */
export async function runAuditChain(input: SubAgentInput): Promise<AuditChainResult> {
  const startTime = Date.now();

  const planner = new TestPlanner();
  const analyst = new ExecutionAnalyst();
  const security = new SecurityReviewer();
  const synthesizer = new ReportSynthesizer();

  // Phase 1: Run planner, analyst, and security in parallel (with per-role timeout)
  const [planResult, analysisResult, securityResult] = await Promise.allSettled([
    withTimeout(planner.run(input), ROLE_TIMEOUT_MS, 'test-planner'),
    withTimeout(analyst.run(input), ROLE_TIMEOUT_MS, 'execution-analyst'),
    withTimeout(security.run(input), ROLE_TIMEOUT_MS, 'security-reviewer'),
  ]);

  // Extract results with fallback for failed agents
  const testPlannerOutput: SubAgentOutput =
    planResult.status === 'fulfilled'
      ? planResult.value
      : (logger.error(`test-planner failed: ${toErrorMessage(planResult.reason)}`),
        makeFailureOutput('test-planner', planResult.reason));

  const executionAnalystOutput: SubAgentOutput =
    analysisResult.status === 'fulfilled'
      ? analysisResult.value
      : (logger.error(`execution-analyst failed: ${toErrorMessage(analysisResult.reason)}`),
        makeFailureOutput('execution-analyst', analysisResult.reason));

  const securityReviewerOutput: SubAgentOutput =
    securityResult.status === 'fulfilled'
      ? securityResult.value
      : (logger.error(`security-reviewer failed: ${toErrorMessage(securityResult.reason)}`),
        makeFailureOutput('security-reviewer', securityResult.reason));

  // Phase 2: Run report-synthesizer with all three upstream outputs
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
    reportSynthesizerOutput = await withTimeout(synthesizer.run(synthesizerInput), ROLE_TIMEOUT_MS, 'report-synthesizer');
  } catch (err: unknown) {
    logger.error(`report-synthesizer failed: ${toErrorMessage(err)}`);
    reportSynthesizerOutput = makeFailureOutput('report-synthesizer', err);
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
