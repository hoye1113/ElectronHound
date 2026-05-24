import type { StepRecord } from '@eata/shared-types';
import type { ObservationResult, PlanResult, ExecResult, VerdictResult } from '@eata/shared-types';
import type { AuditChainResult } from './sub-agents/types.js';

export interface TestState {
  goal: string;
  targetAppPath: string;
  llmModel: string;
  maxSteps: number;
  taskId: string;
  stepCount: number;
  stuckCounter: number;
  lastObservationHash: string;
  history: StepRecord[];
  currentObservation: ObservationResult | null;
  currentPlan: PlanResult | null;
  currentExecResult: ExecResult | null;
  currentVerdict: VerdictResult | null;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  auditChainResult: AuditChainResult | null;
}