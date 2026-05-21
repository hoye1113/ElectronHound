/**
 * EATA Agent Loop — Public API
 *
 * Re-exports AgentLoop, runTest entry function, and all related types.
 */

export { AgentLoop, runTest } from './agentLoop.js';
export type {
  AgentLoopOptions,
  CompactionConfig,
  TestResult,
  ToolRegistry,
  ObservationResult,
  PlanResult,
  ExecResult,
  VerdictResult,
  StepRecord,
} from './types.js';
