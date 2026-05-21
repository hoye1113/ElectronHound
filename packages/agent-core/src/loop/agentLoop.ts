/**
 * EATA Agent Loop Runtime
 *
 * Self-built agent loop replacing LangGraph:
 * observe → plan → execute → verify → report cycle.
 *
 * Features:
 * - Stuck detection (3 identical observations → escalation)
 * - Compaction integration (check before/after each iteration)
 * - Graceful error handling for tool failures
 */

import type { LLMProvider } from '../llm/provider.js';
import { shouldTriggerCompaction, estimateTokens } from '../compaction/trigger.js';
import { generateSummary } from '../compaction/summary.js';
import type { CompactionMessage } from '../compaction/cut-point.js';
import type {
  ObservationResult,
  PlanResult,
  ExecResult,
  VerdictResult,
  StepRecord,
} from '@eata/shared-types';
import type { AgentLoopOptions, CompactionConfig, TestResult, ToolRegistry } from './types.js';

// Default configuration values
const DEFAULT_MAX_STEPS = 50;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_RESERVE_TOKENS = 16384;
const STUCK_THRESHOLD = 3;

// System prompts for each phase
const OBSERVE_SYSTEM =
  'You are an observation agent. Analyze the current state and return a JSON object with ' +
  'ariaTree (string), pageTitle (string), and url (string). Be concise.';

const PLAN_SYSTEM =
  'You are a planning agent. Decide the next action and return a JSON object with ' +
  'reasoning (string), toolCall: { name (string), args (object) }, and expectedOutcome (string).';

const VERIFY_SYSTEM =
  'You are a verification agent. Evaluate whether the action achieved the expected outcome. ' +
  'Return a JSON object with verdict ("pass"|"retry"|"fail"|"escalate") and reasoning (string).';

const REPORT_SYSTEM =
  'You are a reporting agent. Generate a concise test report summarizing the goal, verdict, ' +
  'reasoning, and all steps taken.';

/**
 * AgentLoop: the core runtime that drives the observe → plan → execute → verify → report cycle.
 */
export class AgentLoop {
  private readonly llm: LLMProvider;
  private readonly tools: ToolRegistry;
  private readonly compactionConfig: CompactionConfig;
  private readonly maxSteps: number;
  private readonly maxRetries: number;
  private messages: CompactionMessage[] = [];
  private readonly observationHistory: ObservationResult[] = [];

  constructor(options: AgentLoopOptions) {
    this.llm = options.llm;
    this.tools = options.tools;
    this.maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.compactionConfig = options.compaction ?? {
      contextWindow: DEFAULT_CONTEXT_WINDOW,
      reserveTokens: DEFAULT_RESERVE_TOKENS,
      enabled: true,
    };
  }

  /**
   * Execute the full agent loop for the given goal.
   * Returns a TestResult with the final verdict and all step records.
   */
  async run(goal: string): Promise<TestResult> {
    const steps: StepRecord[] = [];
    this.messages = [];
    this.observationHistory.length = 0;
    let stepCount = 0;

    while (stepCount < this.maxSteps) {
      // Pre-iteration: check if compaction is needed
      await this.checkAndCompact();

      // Check if stuck before observe
      if (this.isStuck()) {
        return {
          goal,
          verdict: 'escalate',
          reason: `Stuck detected: ${STUCK_THRESHOLD} identical observations`,
          steps,
        };
      }

      const iteration: Partial<{
        observation: ObservationResult;
        plan: PlanResult;
        execResult: ExecResult;
        verdict: VerdictResult;
      }> = {};

      // 1. Observe
      try {
        iteration.observation = await this.observe(goal, steps);
      } catch {
        return {
          goal,
          verdict: 'escalate',
          reason: 'Observe step failed',
          steps,
        };
      }

      // 2. Plan
      try {
        iteration.plan = await this.plan(iteration.observation, goal, steps);
      } catch {
        return {
          goal,
          verdict: 'escalate',
          reason: 'Plan step failed',
          steps,
        };
      }

      // 3. Execute (internal error handling returns success:false on failure)
      iteration.execResult = await this.execute(iteration.plan, steps);

      // 4. Verify
      try {
        iteration.verdict = await this.verify(
          iteration.execResult,
          iteration.plan,
          goal,
          steps,
        );
      } catch {
        return {
          goal,
          verdict: 'escalate',
          reason: 'Verify step failed',
          steps,
        };
      }

      stepCount++;

      // Update message history after execute
      this.messages.push({
        role: 'tool',
        content: `Step ${stepCount}: ${iteration.plan.toolCall.name} → ${iteration.execResult.success ? 'ok' : 'fail'}`,
      });

      const verdictValue = iteration.verdict.verdict;

      if (verdictValue === 'pass' || verdictValue === 'fail' || verdictValue === 'escalate') {
        // 5. Report (generated but not recorded as a step — "report" is not a valid StepPhase)
        await this.report(iteration.verdict, steps);

        return {
          goal,
          verdict: verdictValue,
          reason: iteration.verdict.reasoning,
          steps,
        };
      }

      // verdict === 'retry': continue to next iteration
    }

    // Exhausted maxSteps
    const failVerdict: VerdictResult = {
      verdict: 'fail',
      reasoning: `Exceeded maxSteps (${this.maxSteps})`,
    };
    await this.report(failVerdict, steps);
    return {
      goal,
      verdict: 'fail',
      reason: failVerdict.reasoning,
      steps,
    };
  }

  // ─── Private loop steps ──────────────────────────────────────────────

  private async observe(goal: string, steps: StepRecord[]): Promise<ObservationResult> {
    const recentHistory = this.getRecentHistory();
    const prompt = `Goal: ${goal}\nRecent context:\n${recentHistory}\nObserve the current state.`;
    const start = Date.now();

    const text = await this.llm.generateText(prompt, { system: OBSERVE_SYSTEM });

    let parsed: Record<string, unknown>;
    try {
      parsed = safeJsonParse(text);
    } catch {
      return {
        ariaTree: text,
        pageTitle: 'Unknown',
        url: 'about:blank',
        timestamp: new Date().toISOString(),
      };
    }

    const observation: ObservationResult = {
      ariaTree: String(parsed.ariaTree ?? ''),
      pageTitle: String(parsed.pageTitle ?? 'Unknown'),
      url: String(parsed.url ?? 'about:blank'),
      timestamp: new Date().toISOString(),
    };

    this.trackObservation(observation);

    steps.push({
      id: crypto.randomUUID(),
      taskId: '',
      stepIndex: steps.length,
      phase: 'observe',
      status: 'success',
      observation: text,
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
    });

    return observation;
  }

  private async plan(observation: ObservationResult, goal: string, steps: StepRecord[]): Promise<PlanResult> {
    const prompt =
      `Current state:\n  page: ${observation.pageTitle}\n  url: ${observation.url}\n` +
      `  aria: ${observation.ariaTree}\nGoal: ${goal}\nDecide the next action.`;
    const start = Date.now();

    const text = await this.llm.generateText(prompt, { system: PLAN_SYSTEM });

    let parsed: Record<string, unknown>;
    try {
      parsed = safeJsonParse(text);
    } catch {
      throw new Error(`Plan LLM did not return valid JSON: ${text.slice(0, 80)}`);
    }

    const plan: PlanResult = {
      reasoning: String(parsed.reasoning ?? ''),
      toolCall: {
        name: String((parsed.toolCall as Record<string, unknown>)?.name ?? 'noop'),
        args: ((parsed.toolCall as Record<string, unknown>)?.args ?? {}) as Record<
          string,
          unknown
        >,
      },
      expectedOutcome: String(parsed.expectedOutcome ?? ''),
    };

    this.messages.push({
      role: 'assistant',
      content: `Plan: ${plan.reasoning} → ${plan.toolCall.name}`,
    });

    steps.push({
      id: crypto.randomUUID(),
      taskId: '',
      stepIndex: steps.length,
      phase: 'plan',
      status: 'success',
      reasoning: plan.reasoning,
      action: plan.toolCall,
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
    });

    return plan;
  }

  private async execute(plan: PlanResult, steps: StepRecord[]): Promise<ExecResult> {
    const start = Date.now();
    const { name, args } = plan.toolCall;

    try {
      const result = await this.tools.execute(name, args);

      steps.push({
        id: crypto.randomUUID(),
        taskId: '',
        stepIndex: steps.length,
        phase: 'execute',
        status: 'success',
        action: { name, args },
        result,
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
      });

      return { success: true, result, screenshot: undefined };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';

      steps.push({
        id: crypto.randomUUID(),
        taskId: '',
        stepIndex: steps.length,
        phase: 'execute',
        status: 'failed',
        action: { name, args },
        result: errorMsg,
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
      });

      return { success: false, result: errorMsg, screenshot: undefined };
    }
  }

  private async verify(
    execResult: ExecResult,
    plan: PlanResult,
    goal: string,
    steps: StepRecord[],
  ): Promise<VerdictResult> {
    const prompt =
      `Goal: ${goal}\n` +
      `Plan: ${plan.reasoning}\n` +
      `Expected: ${plan.expectedOutcome}\n` +
      `Tool result: ${JSON.stringify(execResult.result)}\n` +
      `Success: ${execResult.success}`;
    const start = Date.now();

    const text = await this.llm.generateText(prompt, { system: VERIFY_SYSTEM });

    let parsed: Record<string, unknown>;
    try {
      parsed = safeJsonParse(text);
    } catch {
      throw new Error(`Verify LLM did not return valid JSON: ${text.slice(0, 80)}`);
    }

    const verdictStr = String(parsed.verdict ?? 'retry');
    const validVerdicts = ['pass', 'retry', 'fail', 'escalate'] as const;
    const verdict = validVerdicts.includes(verdictStr as (typeof validVerdicts)[number])
      ? (verdictStr as (typeof validVerdicts)[number])
      : 'retry';

    this.messages.push({
      role: 'assistant',
      content: `Verdict: ${verdict} — ${String(parsed.reasoning ?? '')}`,
    });

    steps.push({
      id: crypto.randomUUID(),
      taskId: '',
      stepIndex: steps.length,
      phase: 'verify',
      status: verdict === 'pass' ? 'success' : verdict === 'retry' ? 'retry' : 'failed',
      reasoning: String(parsed.reasoning ?? ''),
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
    });

    return {
      verdict,
      reasoning: String(parsed.reasoning ?? ''),
    };
  }

  private async report(verdict: VerdictResult, steps: StepRecord[]): Promise<string> {
    const phases = steps.map(
      (s, i) =>
        `${i + 1}. [${s.phase}] ${s.status}: ${s.action?.name ?? ''} → ${JSON.stringify(s.result ?? '')}`,
    );
    const prompt =
      `Test Report\n` +
      `Verdict: ${verdict.verdict}\n` +
      `Reasoning: ${verdict.reasoning}\n` +
      `Steps (${steps.length}):\n${phases.join('\n')}`;

    const text = await this.llm.generateText(prompt, { system: REPORT_SYSTEM });
    return text;
  }

  // ─── Compaction ──────────────────────────────────────────────────────

  private async checkAndCompact(): Promise<void> {
    const {
      contextWindow = DEFAULT_CONTEXT_WINDOW,
      reserveTokens = DEFAULT_RESERVE_TOKENS,
      enabled = true,
    } = this.compactionConfig;

    if (!enabled) return;

    const contextTokens = this.getTotalTokens();
    const needsCompact = shouldTriggerCompaction(
      contextTokens,
      contextWindow,
      reserveTokens,
    );

    if (!needsCompact) return;

    const summary = await generateSummary(this.messages);

    // Replace old messages with the compacted summary
    this.messages = [{ role: 'system', content: `[Compacted Summary]\n${summary}` }];
  }

  // ─── Stuck Detection ─────────────────────────────────────────────────

  private trackObservation(obs: ObservationResult): void {
    this.observationHistory.push(obs);
    if (this.observationHistory.length > STUCK_THRESHOLD) {
      this.observationHistory.shift();
    }
  }

  private isStuck(): boolean {
    const recent = this.observationHistory;
    if (recent.length < STUCK_THRESHOLD) return false;

    const h0 = observationFingerprint(recent[recent.length - STUCK_THRESHOLD]);
    const h1 = observationFingerprint(recent[recent.length - STUCK_THRESHOLD + 1]);
    const h2 = observationFingerprint(recent[recent.length - 1]);

    return h0 === h1 && h1 === h2;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private getRecentHistory(maxMessages = 10): string {
    const recent = this.messages.slice(-maxMessages);
    return recent.map((m) => `[${m.role}]: ${String(m.content)}`).join('\n');
  }

  private getTotalTokens(): number {
    return this.messages.reduce(
      (total, m) => total + estimateTokens(String(m.content)),
      0,
    );
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────

/**
 * Compute a fingerprint for an observation to enable stuck detection.
 */
function observationFingerprint(obs: ObservationResult): string {
  const raw = `${obs.ariaTree}::${obs.pageTitle}::${obs.url}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Safely parse JSON from possibly wrapped LLM output.
 * Handles common LLM patterns like ```json ... ``` wrapping.
 */
function safeJsonParse(text: string): Record<string, unknown> {
  const trimmed = text.trim();

  // Try direct parse first
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // Fall through
  }

  // Try extracting from ```json ... ``` blocks
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock?.[1]) {
    return JSON.parse(codeBlock[1].trim()) as Record<string, unknown>;
  }

  // Try finding first {...} block
  const jsonBlock = trimmed.match(/\{[\s\S]*\}/);
  if (jsonBlock) {
    return JSON.parse(jsonBlock[0]) as Record<string, unknown>;
  }

  throw new SyntaxError('Could not parse JSON from text');
}

/**
 * Entry function to run a test with the given goal.
 */
export async function runTest(goal: string, options: AgentLoopOptions): Promise<TestResult> {
  const loop = new AgentLoop(options);
  return loop.run(goal);
}
