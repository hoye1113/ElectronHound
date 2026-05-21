/**
 * EATA Agent Loop - Type Definitions
 *
 * Types for the self-built agent loop runtime:
 * observe → plan → execute → verify → report cycle.
 */

import type { LLMProvider } from '../llm/provider.js';
import type {
  ObservationResult,
  PlanResult,
  ExecResult,
  VerdictResult,
  StepRecord,
} from '@eata/shared-types';

/**
 * Registry mapping tool names to async execution functions.
 */
export interface ToolRegistry {
  readonly tools: Readonly<Record<string, (args: Record<string, unknown>) => Promise<unknown>>>;
  execute(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/**
 * Configuration for context compaction within the agent loop.
 */
export interface CompactionConfig {
  /** Total context window size in tokens. @default 128000 */
  contextWindow?: number;
  /** Tokens to reserve for LLM response. @default 16384 */
  reserveTokens?: number;
  /** Threshold percentage (0–1). Overrides reserveTokens. */
  thresholdPercentage?: number;
  /** Enable/disable auto-compaction. @default true */
  enabled?: boolean;
}

/**
 * Options for constructing an AgentLoop.
 */
export interface AgentLoopOptions {
  llm: LLMProvider;
  tools: ToolRegistry;
  compaction?: CompactionConfig;
  /** Maximum number of observe→verify cycles. @default 50 */
  maxSteps?: number;
  /** Maximum consecutive retries before escalation. @default 3 */
  maxRetries?: number;
}

/**
 * Final result of a test run.
 */
export interface TestResult {
  goal: string;
  verdict: 'pass' | 'fail' | 'escalate';
  reason: string;
  steps: StepRecord[];
}

// Re-export shared types used by the agent loop
export type { ObservationResult, PlanResult, ExecResult, VerdictResult, StepRecord };
