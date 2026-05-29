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
import type { AgentCheckpoint } from '../session/checkpointManager.js';
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
import { toErrorMessage } from '../utils/error.js';
import { createStderrLogger } from '../utils/logger.js';

// ── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_STEPS = 20;
const DEFAULT_STUCK_THRESHOLD = 3;

// ── System prompts ────────────────────────────────────────────────────────

const OBSERVE_SYSTEM = [
  'You are an observation agent for testing an Electron application.',
  'Your job is to analyze the current state of the TEST EXECUTION (not your own environment).',
  '',
  'Return a JSON object with:',
  '  - "summary": a concise description of the current test state',
  '  - "details": any structured data about the test execution',
  '',
  'Important context:',
  '- If no tool has been executed yet, report: "No actions taken yet. App needs to be launched."',
  '- If a tool was executed, describe its result and the current app state.',
  '- Focus on the Electron app being tested, NOT your own environment.',
  '- Be precise and factual about what the test has accomplished so far.',
].join('\n');

const PLAN_SYSTEM = [
  'You are a planning agent for testing an Electron application.',
  'Based on the current observation, decide the NEXT action to take.',
  '',
  'Return a JSON object with:',
  '  - "reasoning": explain why you chose this action',
  '  - "action": a human-readable description of the action',
  '  - "toolName": the name of the tool to invoke',
  '  - "toolArgs": an object with the arguments for the tool',
  '  - "expectedOutcome": what you expect to happen after executing this action',
  '',
  'Available tools:',
  '  - electron_launch: Launch an Electron app. Args: { targetAppPath: string, debuggingPort?: number }',
  '  - electron_close: Close a running Electron app. Args: { pid: number }',
  '  - execute_main: Execute JS code in Electron main process. Args: { code: string, timeout?: number }',
  '  - trigger_ipc: Send IPC message to Electron app. Args: { channel: string, data?: unknown }',
  '  - mock_dialog: Mock native dialog. Args: { type: "open"|"save"|"message", response: unknown }',
  '  - browser_snapshot: Get page accessibility tree. Args: {}',
  '  - browser_click: Click an element. Args: { ref: string }',
  '  - browser_type: Type text. Args: { ref: string, text: string }',
  '  - browser_navigate: Navigate to URL. Args: { url: string }',
  '',
  '## CRITICAL: Workflow Order',
  '',
  'You MUST follow this exact sequence:',
  '1. FIRST: Use `electron_launch` to start the app (if not already launched)',
  '2. THEN: Use `browser_snapshot` to see the UI',
  '3. THEN: Use browser_* tools to interact with the UI',
  '4. FINALLY: Use `electron_close` to clean up',
  '',
  'Rules:',
  '- If the observation says "No actions taken yet" or "App needs to be launched", you MUST use electron_launch first',
  '- NEVER use execute_main or browser_* tools before the app is launched',
  '- Always use the targetAppPath from the task context for electron_launch',
  '- If a tool fails, try launching the app again before giving up',
].join('\n');

const VERIFY_SYSTEM = [
  'You are a verification agent for Electron app testing.',
  'Evaluate whether the TEST GOAL has been fully achieved based on the execution results.',
  '',
  'Return a JSON object with:',
  '  - "verdict": one of "pass" (goal fully achieved), "fail" (goal cannot be achieved),',
  '             "stuck" (no progress being made), or "retry" (continue testing)',
  '  - "reasoning": explain your verdict with specific evidence',
  '',
  'Rules for verdict:',
  '  - "pass": ONLY when the goal has been FULLY achieved with evidence (e.g., UI verified, elements found)',
  '  - "retry": when progress is being made but goal is not yet complete (e.g., app launched but UI not checked)',
  '  - "fail": when the goal is impossible (e.g., app crashed, critical error)',
  '  - "stuck": when no progress after multiple attempts',
  '',
  'Be strict: launching the app alone is NOT enough to pass. You must verify the actual goal.',
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
  private readonly logger = createStderrLogger('agentLoop');

  constructor(config: AgentLoopConfig) {
    this.llm = config.llmProvider;
    this.session = config.sessionManager;
    this.mcp = config.mcpClient;
    this.maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS;
    this.stuckThreshold = config.stuckThreshold ?? DEFAULT_STUCK_THRESHOLD;
  }

  /**
   * Resume an agent loop from a checkpoint.
   * Restores session entries and continues from checkpoint.currentStep + 1.
   *
   * @param checkpoint - The checkpoint to resume from.
   * @returns Terminal result with verdict, report, and session ID.
   */
  async resume(checkpoint: AgentCheckpoint): Promise<AgentRunResult> {
    const sessionId = checkpoint.sessionId;

    // Restore session entries into the session manager
    for (const entry of checkpoint.sessionEntries) {
      this.session.addEntry(sessionId, {
        role: entry.role,
        content: entry.content,
        type: entry.type,
        id: entry.id,
        timestamp: entry.timestamp,
      });
    }

    // Reconstruct state from checkpoint
    const state: AgentLoopState = {
      sessionId,
      taskPrompt: checkpoint.taskPrompt,
      stepCount: checkpoint.currentStep,
      currentObservation: checkpoint.lastObservation as unknown as Observation | null,
      lastPlan: checkpoint.lastPlan as unknown as Plan | null,
      lastExecution: checkpoint.lastExecutionResult as unknown as ExecutionResult | null,
      stuckCount: 0,
    };

    // Track recent observation fingerprints for stuck detection
    const fingerprintWindow: string[] = [];

    try {
      while (state.stepCount < this.maxSteps) {
        // ── 1. Observe ──────────────────────────────────────────────
        this.logger.info(`[resume] Step ${state.stepCount + 1}: Observing...`);
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
        this.logger.info(`Observation: ${observation.summary.substring(0, 100)}`);
        this.logger.info('Planning...');
        const plan = await this.plan(observation, state);
        state.lastPlan = plan;

        this.session.addEntry(sessionId, {
          role: 'assistant',
          content: JSON.stringify(plan),
          type: 'assistant',
        });

        // ── 3. Execute ──────────────────────────────────────────────
        this.logger.info(`Plan: ${plan.action} (tool: ${plan.toolName})`);
        this.logger.info(`Executing ${plan.toolName}...`);
        const execution = await this.execute(plan);
        state.lastExecution = execution;
        state.stepCount++;

        this.session.addEntry(sessionId, {
          role: 'system',
          content: JSON.stringify(execution),
          type: 'system',
        });

        // ── 4. Verify ───────────────────────────────────────────────
        this.logger.info(`Execution result: success=${execution.success}, error=${execution.error ?? 'none'}`);
        this.logger.info('Verifying...');
        const verdict = await this.verify(execution, plan, state);

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
    } finally {
      // Disconnect all MCP servers
      if (this.mcp) {
        await this.mcp.disconnect().catch((err: unknown) => {
          this.logger.error(`MCP disconnect error: ${toErrorMessage(err)}`);
        });
      }
    }
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

    try {
      while (state.stepCount < this.maxSteps) {
        // ── 1. Observe ──────────────────────────────────────────────
        this.logger.info(`Step ${state.stepCount + 1}: Observing...`);
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
        this.logger.info(`Observation: ${observation.summary.substring(0, 100)}`);
        this.logger.info('Planning...');
        const plan = await this.plan(observation, state);
        state.lastPlan = plan;

        this.session.addEntry(sessionId, {
          role: 'assistant',
          content: JSON.stringify(plan),
          type: 'assistant',
        });

        // ── 3. Execute ──────────────────────────────────────────────
        this.logger.info(`Plan: ${plan.action} (tool: ${plan.toolName})`);
        this.logger.info(`Executing ${plan.toolName}...`);
        const execution = await this.execute(plan);
        state.lastExecution = execution;
        state.stepCount++;

        this.session.addEntry(sessionId, {
          role: 'system',
          content: JSON.stringify(execution),
          type: 'system',
        });

        // ── 4. Verify ───────────────────────────────────────────────
        this.logger.info(`Execution result: success=${execution.success}, error=${execution.error ?? 'none'}`);
        this.logger.info('Verifying...');
        const verdict = await this.verify(execution, plan, state);

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
    } finally {
      // Disconnect all MCP servers
      if (this.mcp) {
        await this.mcp.disconnect().catch((err: unknown) => {
          this.logger.error(`MCP disconnect error: ${toErrorMessage(err)}`);
        });
      }
    }
  }

  // ── Loop phases ────────────────────────────────────────────────────────

  /**
   * Observe — gather the current state via the LLM.
   */
  async observe(state: AgentLoopState): Promise<Observation> {
    const contextParts: string[] = [];

    contextParts.push(`Task: ${state.taskPrompt}`);

    if (state.lastPlan) {
      contextParts.push(`Last action: ${state.lastPlan.action} (tool: ${state.lastPlan.toolName})`);
    }
    if (state.lastExecution) {
      contextParts.push(
        `Last result: ${state.lastExecution.success ? 'success' : 'failure'} — ${JSON.stringify(state.lastExecution.result)}`,
      );
    }

    const context = contextParts.length > 0 ? `\nContext:\n${contextParts.join('\n')}` : '';

    const prompt = `Step ${state.stepCount + 1}. Observe the current state of the Electron app test execution.${context}`;

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
  async plan(observation: Observation, state: AgentLoopState): Promise<Plan> {
    const prompt = [
      `Task: ${state.taskPrompt}`,
      `Current step: ${state.stepCount + 1}`,
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
    } catch (err: unknown) {
      const errorMessage = toErrorMessage(err);
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
  async verify(execution: ExecutionResult, plan: Plan, state: AgentLoopState): Promise<Verdict> {
    const toolsUsed = state.stepCount;
    const prompt = [
      `Task goal: ${state.taskPrompt}`,
      `Steps completed so far: ${toolsUsed}`,
      ``,
      `Last action: ${plan.action}`,
      `Expected outcome: ${plan.expectedOutcome}`,
      `Execution success: ${execution.success}`,
      `Execution result: ${JSON.stringify(execution.result)}`,
      execution.error ? `Error: ${execution.error}` : '',
      ``,
      `Evaluate whether the FULL TASK GOAL has been achieved.`,
      `Remember: launching the app is only the first step. You must verify the actual goal requirements.`,
      `If the goal asks to "check UI elements" or "verify content", you need browser_snapshot results.`,
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
