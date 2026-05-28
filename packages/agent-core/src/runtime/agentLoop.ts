/**
 * Agent Loop Runtime
 *
 * Self-built Agent Loop Runtime:
 * observe → plan → execute → verify → report cycle.
 *
 * Features:
 * - Stuck detection: if N consecutive identical observations → abort with 'stuck'
 * - Session persistence: every step recorded via SessionManager.addEntry()
 * - Uses the custom LLMProvider interface (generateText / generateObject)
 */

import type { LLMProvider } from '../llm/types.js';
import type { SessionManager } from '../session/sessionManager.js';
import type { MCPClient } from '../mcp/client.js';
import type {
  AgentLoopConfig,
  AgentLoopState,
  Observation,
  Plan,
  ExecutionResult,
  Verdict,
  Report,
  AgentRunResult,
} from './types.js';
import { fingerprintObservation } from './stuckDetection.js';

// ── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_STEPS = 20;
const DEFAULT_STUCK_THRESHOLD = 3;

// ── System prompts ────────────────────────────────────────────────────────

const OBSERVE_SYSTEM = [
  'You are an observation agent. Analyze the current state of the system.',
  'Return a JSON object with:',
  '  - "summary": a concise human-readable description of what you see',
  '  - "details": any structured data or metrics about the current state',
  'Be precise and factual.',
].join('\n');

const PLAN_SYSTEM = [
  'You are a planning agent. Based on the current observation, decide the next action.',
  'Return a JSON object with:',
  '  - "reasoning": explain why you chose this action',
  '  - "action": a human-readable description of the action',
  '  - "toolName": the name of the tool to invoke',
  '  - "toolArgs": an object with the arguments for the tool',
  '  - "expectedOutcome": what you expect to happen after executing this action',
  'Choose the action that makes the most progress toward the goal.',
].join('\n');

const VERIFY_SYSTEM = [
  'You are a verification agent. Evaluate whether the last action achieved the expected outcome.',
  'Return a JSON object with:',
  '  - "verdict": one of "pass" (goal complete), "fail" (goal cannot be achieved),',
  '             "stuck" (no progress being made), or "retry" (continue trying)',
  '  - "reasoning": explain your verdict',
  'Be decisive: use "retry" only when more progress is clearly possible.',
].join('\n');

const REPORT_SYSTEM = [
  'You are a reporting agent. Generate a concise test report.',
  'Summarize the goal, final verdict, reasoning, and all steps taken.',
  'Keep it brief but complete.',
].join('\n');

// ── Lightweight schema validators ─────────────────────────────────────────
// The custom LLMProvider checks for a .parse method on the schema object.
// These provide basic runtime validation without adding zod as a dependency.

interface SchemaLike<T> {
  parse(v: unknown): T;
}

function schema<T>(parse: (v: unknown) => T): SchemaLike<T> {
  return { parse };
}

const planSchema: SchemaLike<Plan> = schema((v) => {
  const obj = v as Record<string, unknown>;
  return {
    reasoning: String(obj.reasoning ?? ''),
    action: String(obj.action ?? obj.toolName ?? ''),
    toolName: String(obj.toolName ?? ''),
    toolArgs: (obj.toolArgs ?? {}) as Record<string, unknown>,
    expectedOutcome: String(obj.expectedOutcome ?? ''),
  };
});

const verdictSchema: SchemaLike<Verdict> = schema((v) => {
  const obj = v as Record<string, unknown>;
  const raw = String(obj.verdict ?? 'retry');
  const validVerdicts: Verdict['verdict'][] = ['pass', 'fail', 'stuck', 'retry'];
  const verdict = validVerdicts.includes(raw as Verdict['verdict'])
    ? (raw as Verdict['verdict'])
    : 'retry';
  return {
    verdict,
    reasoning: String(obj.reasoning ?? ''),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Attempt to parse a string as JSON. Returns the parsed value or null.
 */
function tryParseJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();

  // Direct parse
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // continue
  }

  // ```json ... ``` wrapping
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock?.[1]) {
    try {
      return JSON.parse(codeBlock[1].trim()) as Record<string, unknown>;
    } catch {
      // continue
    }
  }

  // First {...} block
  const jsonBlock = trimmed.match(/\{[\s\S]*\}/);
  if (jsonBlock) {
    try {
      return JSON.parse(jsonBlock[0]) as Record<string, unknown>;
    } catch {
      // continue
    }
  }

  return null;
}

// ── AgentLoop ─────────────────────────────────────────────────────────────

/**
 * AgentLoop drives the core observe → plan → execute → verify → report cycle.
 *
 * All state is persisted through the SessionManager (addEntry on each step).
 * Stuck detection aborts after N consecutive identical observations.
 *
 * @example
 * ```ts
 * const loop = new AgentLoop({ llmProvider, sessionManager });
 * const result = await loop.run('Test the login flow');
 * console.log(result.verdict); // 'pass' | 'fail' | 'stuck'
 * ```
 */
export class AgentLoop {
  private readonly llm: LLMProvider;
  private readonly session: SessionManager;
  private readonly mcp: MCPClient | undefined;
  private readonly maxSteps: number;
  private readonly stuckThreshold: number;

  constructor(config: AgentLoopConfig) {
    this.llm = config.llmProvider;
    this.session = config.sessionManager;
    this.mcp = config.mcpClient;
    this.maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS;
    this.stuckThreshold = config.stuckThreshold ?? DEFAULT_STUCK_THRESHOLD;
  }

  /**
   * Run the full agent loop for the given task prompt.
   *
   * @param taskPrompt - Natural language description of the goal / task to accomplish.
   * @returns Terminal result with verdict, report, and session ID.
   */
  async run(taskPrompt: string): Promise<AgentRunResult> {
    const sessionId = this.session.createSession('agent-loop', taskPrompt);

    const state: AgentLoopState = {
      sessionId,
      taskPrompt,
      stepCount: 0,
      currentObservation: null,
      lastPlan: null,
      lastExecution: null,
      stuckCount: 0,
    };

    // Track recent observation fingerprints for stuck detection
    const fingerprintWindow: string[] = [];

    this.session.addEntry(sessionId, {
      role: 'user',
      content: taskPrompt,
      type: 'user',
    });

    while (state.stepCount < this.maxSteps) {
      // ── 1. Observe ──────────────────────────────────────────────
      const observation = await this.observe(state);
      state.currentObservation = observation;

      this.session.addEntry(sessionId, {
        role: 'assistant',
        content: JSON.stringify(observation),
        type: 'assistant',
      });

      // ── Stuck detection ─────────────────────────────────────────
      const fp = fingerprintObservation(observation);
      fingerprintWindow.push(fp);
      if (fingerprintWindow.length > this.stuckThreshold) {
        fingerprintWindow.shift();
      }

      if (
        fingerprintWindow.length >= this.stuckThreshold &&
        fingerprintWindow.every((f) => f === fingerprintWindow[0])
      ) {
        state.stuckCount = this.stuckThreshold;
        const stuckVerdict: Verdict = {
          verdict: 'stuck',
          reasoning: `Stuck: ${this.stuckThreshold} consecutive identical observations detected.`,
        };

        this.session.addEntry(sessionId, {
          role: 'system',
          content: stuckVerdict.reasoning,
          type: 'system',
        });

        const report = await this.report(state, stuckVerdict);
        return { verdict: 'stuck', report, sessionId };
      }

      // ── 2. Plan ─────────────────────────────────────────────────
      const plan = await this.plan(observation);
      state.lastPlan = plan;

      this.session.addEntry(sessionId, {
        role: 'assistant',
        content: JSON.stringify(plan),
        type: 'assistant',
      });

      // ── 3. Execute ──────────────────────────────────────────────
      const execution = await this.execute(plan);
      state.lastExecution = execution;
      state.stepCount++;

      this.session.addEntry(sessionId, {
        role: 'system',
        content: JSON.stringify(execution),
        type: 'system',
      });

      // ── 4. Verify ───────────────────────────────────────────────
      const verdict = await this.verify(execution, plan);

      this.session.addEntry(sessionId, {
        role: 'assistant',
        content: JSON.stringify(verdict),
        type: 'assistant',
      });

      // ── Terminal verdict → 5. Report ────────────────────────────
      if (verdict.verdict === 'pass' || verdict.verdict === 'fail' || verdict.verdict === 'stuck') {
        const report = await this.report(state, verdict);
        return { verdict: verdict.verdict, report, sessionId };
      }

      // verdict === 'retry': continue to next iteration
    }

    // ── Exhausted maxSteps ────────────────────────────────────────
    const exhaustedVerdict: Verdict = {
      verdict: 'fail',
      reasoning: `Exceeded maximum steps (${this.maxSteps}).`,
    };

    this.session.addEntry(sessionId, {
      role: 'system',
      content: exhaustedVerdict.reasoning,
      type: 'system',
    });

    const report = await this.report(state, exhaustedVerdict);
    return { verdict: 'fail', report, sessionId };
  }

  // ── Loop phases ────────────────────────────────────────────────────────

  /**
   * Observe — gather the current state via the LLM.
   */
  async observe(state: AgentLoopState): Promise<Observation> {
    const contextParts: string[] = [];

    if (state.lastPlan) {
      contextParts.push(`Last action: ${state.lastPlan.action}`);
    }
    if (state.lastExecution) {
      contextParts.push(
        `Last result: ${state.lastExecution.success ? 'success' : 'failure'} — ${JSON.stringify(state.lastExecution.result)}`,
      );
    }

    const context = contextParts.length > 0 ? `\nPrevious context:\n${contextParts.join('\n')}` : '';

    const prompt = `Step ${state.stepCount + 1}. Observe the current state.${context}`;

    const { text } = await this.llm.generateText({
      prompt,
      system: OBSERVE_SYSTEM,
      maxTokens: 500,
    });

    const parsed = tryParseJson(text);

    const observation: Observation = {
      summary: parsed?.summary ? String(parsed.summary) : text,
      details: (parsed?.details ?? {}) as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    };

    return observation;
  }

  /**
   * Plan — generate the next action plan via the LLM.
   */
  async plan(observation: Observation): Promise<Plan> {
    const prompt = [
      `Goal steps completed so far: included in session history.`,
      `Current observation: ${observation.summary}`,
      `Details: ${JSON.stringify(observation.details)}`,
      `Decide the next action to make progress toward the goal.`,
    ].join('\n');

    const { object: plan } = await this.llm.generateObject<Plan>({
      prompt,
      system: PLAN_SYSTEM,
      schema: planSchema,
    });

    return plan;
  }

  /**
   * Execute — run the planned action via MCP.
   *
   * Uses the injected MCPClient to call the appropriate tool. Tool names
   * prefixed with "browser_" are routed to the Playwright MCP server; all
   * others are routed to the Electron bridge MCP server.
   *
   * When no MCP client is available, returns a placeholder result so the
   * loop can still proceed (useful for testing / planning-only mode).
   */
  async execute(plan: Plan): Promise<ExecutionResult> {
    if (!this.mcp) {
      return {
        success: true,
        result: {
          toolName: plan.toolName,
          toolArgs: plan.toolArgs,
          note: 'Tool execution is deferred. Wire real tools via the execution layer.',
        },
      };
    }

    const server: 'playwright' | 'electron' = plan.toolName.startsWith('browser_')
      ? 'playwright'
      : 'electron';

    try {
      const toolResult = await this.mcp.callTool(server, plan.toolName, plan.toolArgs);
      return {
        success: toolResult.success,
        result: toolResult.result,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        result: null,
        error: errorMessage,
      };
    }
  }

  /**
   * Verify — evaluate whether the last execution met the expected outcome.
   */
  async verify(execution: ExecutionResult, plan: Plan): Promise<Verdict> {
    const prompt = [
      `Action: ${plan.action}`,
      `Expected outcome: ${plan.expectedOutcome}`,
      `Execution success: ${execution.success}`,
      `Execution result: ${JSON.stringify(execution.result)}`,
      execution.error ? `Error: ${execution.error}` : '',
      `Evaluate whether the goal has been achieved.`,
    ]
      .filter(Boolean)
      .join('\n');

    const { object: verdict } = await this.llm.generateObject<Verdict>({
      prompt,
      system: VERIFY_SYSTEM,
      schema: verdictSchema,
    });

    return verdict;
  }

  /**
   * Report — generate the final run report.
   */
  async report(state: AgentLoopState, verdict: Verdict): Promise<Report> {
    const prompt = [
      `Verdict: ${verdict.verdict}`,
      `Reasoning: ${verdict.reasoning}`,
      `Total steps: ${state.stepCount}`,
      `Generate a concise final report.`,
    ].join('\n');

    const { text } = await this.llm.generateText({
      prompt,
      system: REPORT_SYSTEM,
      maxTokens: 300,
    });

    const report: Report = {
      goal: state.taskPrompt,
      verdict: verdict.verdict,
      reasoning: verdict.reasoning,
      stepCount: state.stepCount,
      summary: text,
      timestamp: new Date().toISOString(),
    };

    this.session.addEntry(state.sessionId, {
      role: 'system',
      content: JSON.stringify(report),
      type: 'system',
    });

    return report;
  }
}
