import { Annotation } from '@langchain/langgraph';
import type { ObservationResult, PlanResult, ExecResult, VerdictResult, StepRecord } from '@eata/shared-types';

export const TestState = Annotation.Root({
  goal: Annotation<string>({
    reducer: (_left: string, right: string) => right,
    default: () => '',
  }),
  targetAppPath: Annotation<string>({
    reducer: (_left: string, right: string) => right,
    default: () => '',
  }),
  llmModel: Annotation<string>({
    reducer: (_left: string, right: string) => right,
    default: () => 'gpt-4o',
  }),
  maxSteps: Annotation<number>({
    reducer: (_left: number, right: number) => right,
    default: () => 50,
  }),
  taskId: Annotation<string>({
    reducer: (_left: string, right: string) => right,
    default: () => '',
  }),
  history: Annotation<StepRecord[]>({
    reducer: (left: StepRecord[], right: StepRecord[]) => [...left, ...right],
    default: () => [],
  }),
  currentObservation: Annotation<ObservationResult | null>({
    reducer: (_left: ObservationResult | null, right: ObservationResult | null) => right,
    default: () => null,
  }),
  currentPlan: Annotation<PlanResult | null>({
    reducer: (_left: PlanResult | null, right: PlanResult | null) => right,
    default: () => null,
  }),
  currentExecResult: Annotation<ExecResult | null>({
    reducer: (_left: ExecResult | null, right: ExecResult | null) => right,
    default: () => null,
  }),
  currentVerdict: Annotation<VerdictResult | null>({
    reducer: (_left: VerdictResult | null, right: VerdictResult | null) => right,
    default: () => null,
  }),
  stepCount: Annotation<number>({
    reducer: (_left: number, right: number) => right,
    default: () => 0,
  }),
  stuckCounter: Annotation<number>({
    reducer: (_left: number, right: number) => right,
    default: () => 0,
  }),
  status: Annotation<'running' | 'completed' | 'failed' | 'aborted'>({
    reducer: (_left: string, right: string) => right as 'running' | 'completed' | 'failed' | 'aborted',
    default: () => 'running',
  }),
  lastObservationHash: Annotation<string>({
    reducer: (_left: string, right: string) => right,
    default: () => '',
  }),
});
