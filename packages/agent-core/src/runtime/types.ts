/**
 * Agent Loop Runtime — Type Definitions
 *
 * Types for the self-built agent loop runtime:
 * observe → plan → execute → verify → report cycle.
 *
 * Uses the custom LLMProvider interface (not Vercel AI SDK)
 * and SessionManager for state persistence.
 */

import type { LLMProvider } from '../llm/types.js';
import type { SessionManager } from '../session/sessionManager.js';
import type { MCPClient } from '../mcp/client.js';

/**
 * Configuration for the AgentLoop runtime.
 */
export interface AgentLoopConfig {
  /** LLM provider using the custom fetch-based interface (Layer 1). */
  llmProvider: LLMProvider;
  /** Session manager for persisting agent state and entries. */
  sessionManager: SessionManager;
  /** Optional MCP client for tool execution. When not provided, execute returns a stub result. */
  mcpClient?: MCPClient;
  /** Maximum number of observe→verify cycles before aborting. @default 20 */
  maxSteps?: number;
  /** Number of consecutive identical observations before stuck detection triggers. @default 3 */
  stuckThreshold?: number;
}

/**
 * Observation gathered during the observe phase.
 */
export interface Observation {
  /** Human-readable summary of the current state. */
  summary: string;
  /** Structured details captured from the observed state. */
  details: Record<string, unknown>;
  /** ISO 8601 timestamp of when the observation was made. */
  timestamp: string;
}

/**
 * Action plan generated during the plan phase.
 */
export interface Plan {
  /** LLM reasoning behind the chosen action. */
  reasoning: string;
  /** Human-readable description of the action. */
  action: string;
  /** Name of the tool to invoke. */
  toolName: string;
  /** Arguments to pass to the tool. */
  toolArgs: Record<string, unknown>;
  /** What the LLM expects the outcome of this action to be. */
  expectedOutcome: string;
}

/**
 * Result of executing a planned action.
 */
export interface ExecutionResult {
  /** Whether the tool execution succeeded. */
  success: boolean;
  /** Raw result from the tool execution. */
  result: unknown;
  /** Error message if execution failed. */
  error?: string;
}

/** Possible verdict values for a verification step. */
export type VerdictValue = 'pass' | 'fail' | 'stuck' | 'retry';

/**
 * Verdict produced during the verify phase.
 */
export interface Verdict {
  /** Whether the goal was met, not met, the agent is stuck, or should retry. */
  verdict: VerdictValue;
  /** LLM reasoning behind the verdict. */
  reasoning: string;
}

/**
 * Final test report generated during the report phase.
 */
export interface Report {
  /** The original task goal/prompt. */
  goal: string;
  /** Final verdict (pass / fail / stuck). */
  verdict: string;
  /** Explanation of the final outcome. */
  reasoning: string;
  /** Total number of observe→verify cycles executed. */
  stepCount: number;
  /** Condensed summary of the entire run. */
  summary: string;
  /** ISO 8601 timestamp of report generation. */
  timestamp: string;
}

/**
 * Mutable state tracked throughout a single agent run.
 */
export interface AgentLoopState {
  /** Session ID from SessionManager. */
  sessionId: string;
  /** How many observe→verify cycles have been completed. */
  stepCount: number;
  /** Most recent observation. */
  currentObservation: Observation | null;
  /** Most recent action plan. */
  lastPlan: Plan | null;
  /** Most recent execution result. */
  lastExecution: ExecutionResult | null;
  /** Consecutive count of identical observations (for stuck detection). */
  stuckCount: number;
}

/**
 * Final result returned by AgentLoop.run().
 */
export interface AgentRunResult {
  /** Terminal verdict. */
  verdict: 'pass' | 'fail' | 'stuck';
  /** Full report if a terminal verdict was reached, null on unexpected errors. */
  report: Report | null;
  /** Session ID for post-run analysis. */
  sessionId: string;
}
