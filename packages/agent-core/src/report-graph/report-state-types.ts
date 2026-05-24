import type { StepRecord } from '@eata/shared-types';
import type {
  SafetyReport,
  PerformanceReport,
  AccessibilityReport,
  FeedbackPattern,
} from '@eata/shared-types';

export interface ReportState {
  goal: string;
  history: StepRecord[];
  safetyReport: SafetyReport | null;
  performanceReport: PerformanceReport | null;
  accessibilityReport: AccessibilityReport | null;
  newPatterns: FeedbackPattern[] | null;
  summaryText: string;
}
