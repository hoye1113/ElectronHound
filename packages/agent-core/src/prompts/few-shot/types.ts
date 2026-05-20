import type { StepRecord } from '@eata/shared-types';

/** Single few-shot example demonstrating a test scenario */
export interface FewShotExample {
  /** Goal description for this example */
  goal: string;
  /** Executed step sequence */
  steps: StepRecord[];
  /** Expected outcome description */
  expectedResult: string;
  /** Metadata for matching and categorization */
  metadata: {
    /** Keywords for keyword matching */
    tags?: string[];
    /** Domain category (testing, navigation, general) */
    domain?: string;
    /** Difficulty level */
    difficulty?: 'easy' | 'medium' | 'hard';
  };
}

/** Context for loading examples based on current state */
export interface FewShotContext {
  /** Current goal description */
  goal: string;
  /** Optional plan steps */
  planSteps?: string[];
  /** Maximum number of examples to return (default: 3) */
  maxExamples?: number;
}
