/**
 * Runner Types
 *
 * Defines the return type for the runTest function when using AgentLoop.
 * Maintains backward compatibility with the existing interface.
 */

import type { StepRecord } from '@eata/shared-types';
import type { Observation, Plan, ExecutionResult, Verdict } from './runtime/types.js';
import type { AuditChainResult } from './sub-agents/types.js';

/**
 * Result returned by runTest when using AgentLoop.
 * Compatible with the existing TestState interface.
 */
export interface RunTestResult {
  goal: string;
  targetAppPath: string;
  llmModel: string;
  maxSteps: number;
  taskId: string;
  history: StepRecord[];
  currentObservation: Observation | null;
  currentPlan: Plan | null;
  currentExecResult: ExecutionResult | null;
  currentVerdict: Verdict | null;
  stepCount: number;
  stuckCounter: number;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  lastObservationHash: string;
  auditChainResult: AuditChainResult | null;
}
