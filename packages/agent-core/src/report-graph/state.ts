import { Annotation } from '@langchain/langgraph';
import type { StepRecord, SafetyReport, PerformanceReport, AccessibilityReport, FeedbackPattern } from '@eata/shared-types';

export const ReportState = Annotation.Root({
  goal: Annotation<string>({
    reducer: (_left: string, right: string) => right,
    default: () => '',
  }),
  history: Annotation<StepRecord[]>({
    reducer: (_left: StepRecord[], right: StepRecord[]) => right,
    default: () => [],
  }),
  safetyReport: Annotation<SafetyReport | null>({
    reducer: (_left: SafetyReport | null, right: SafetyReport | null) => right,
    default: () => null,
  }),
  performanceReport: Annotation<PerformanceReport | null>({
    reducer: (_left: PerformanceReport | null, right: PerformanceReport | null) => right,
    default: () => null,
  }),
  accessibilityReport: Annotation<AccessibilityReport | null>({
    reducer: (_left: AccessibilityReport | null, right: AccessibilityReport | null) => right,
    default: () => null,
  }),
  newPatterns: Annotation<FeedbackPattern[]>({
    reducer: (_left: FeedbackPattern[], right: FeedbackPattern[]) => right,
    default: () => [],
  }),
  summaryText: Annotation<string>({
    reducer: (_left: string, right: string) => right,
    default: () => '',
  }),
});
