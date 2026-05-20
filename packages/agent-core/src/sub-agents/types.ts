/**
 * Sub-Agent Role Types & Audit Chain Interfaces
 *
 * Defines the 4 specialized roles for the sub-agent audit chain,
 * along with input/output contracts and chained result aggregation.
 */

/** Specialized roles in the sub-agent audit pipeline. */
export type SubAgentRole =
  | 'test-planner'
  | 'execution-analyst'
  | 'security-reviewer'
  | 'report-synthesizer';

/** Input contract for any sub-agent invocation. */
export interface SubAgentInput {
  /** Natural-language goal for this sub-agent task. */
  goal: string;
  /** Absolute path to the target Electron app under test. */
  targetAppPath: string;
  /** Additional context carried from upstream agents or the orchestrator. */
  context: Record<string, unknown>;
}

/** Output contract returned by every sub-agent. */
export interface SubAgentOutput {
  /** Role that produced this output. */
  role: SubAgentRole;
  /** Structured audit findings produced by this role. */
  auditReport: AuditReport;
  /** Free-form analysis narrative. */
  analysis: string;
  /** Actionable recommendations (may be empty). */
  recommendations: string[];
}

/** Generic audit report produced by a sub-agent. */
export interface AuditReport {
  /** Severity assessment. */
  severity: 'pass' | 'warn' | 'fail' | 'info';
  /** Human-readable summary. */
  summary: string;
  /** Individual findings; empty when nothing notable found. */
  findings: AuditFinding[];
  /** ISO-8601 timestamp of report generation. */
  timestamp: string;
}

/** A single finding within an audit report. */
export interface AuditFinding {
  /** Category tag (e.g. 'security', 'performance', 'accessibility'). */
  category: string;
  /** Short description of the finding. */
  description: string;
  /** Severity at the finding level. */
  severity: 'info' | 'warn' | 'fail';
  /** Optional evidence or raw data supporting this finding. */
  evidence?: string;
}

/** Aggregated output of the full 4-role audit chain. */
export interface AuditChainResult {
  /** Original goal that initiated the chain. */
  goal: string;
  /** Output from the test-planner role. */
  testPlanner: SubAgentOutput;
  /** Output from the execution-analyst role. */
  executionAnalyst: SubAgentOutput;
  /** Output from the security-reviewer role. */
  securityReviewer: SubAgentOutput;
  /** Output from the report-synthesizer role. */
  reportSynthesizer: SubAgentOutput;
  /** Ordered list of roles that ran (guaranteed 4, in pipeline order). */
  chainOrder: SubAgentRole[];
  /** Total wall-clock duration in milliseconds. */
  durationMs: number;
  /** ISO-8601 timestamp of chain completion. */
  completedAt: string;
}
