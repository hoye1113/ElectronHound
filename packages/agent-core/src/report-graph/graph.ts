import { StateGraph, END, START } from '@langchain/langgraph';
import { ReportState } from './state.js';
import { createSafetyNode, safetyNode } from './nodes/safety.js';
import { createPerformanceNode, performanceNode } from './nodes/performance.js';
import { createAccessibilityNode, accessibilityNode } from './nodes/accessibility.js';
import { createPatternNode, patternNode } from './nodes/pattern.js';
import { summarizeNode } from './nodes/summarize.js';
import type { SafetyNodeOptions } from './nodes/safety.js';
import type { PerformanceNodeOptions } from './nodes/performance.js';
import type { AccessibilityNodeOptions } from './nodes/accessibility.js';
import type { PatternNodeOptions } from './nodes/pattern.js';

export interface ReportGraphOptions {
  safety?: SafetyNodeOptions;
  performance?: PerformanceNodeOptions;
  accessibility?: AccessibilityNodeOptions;
  pattern?: PatternNodeOptions;
}

/**
 * Creates a Report Sub Graph using fan-out/fan-in pattern.
 * 4 analysis nodes run in parallel (safety, perf, a11y, pattern),
 * then results are aggregated by the summarize node.
 *
 * Flow: START → (safety, perf, a11y, pattern) → summarize → END
 */
export function createReportGraph(options: ReportGraphOptions = {}) {
  const safety = options.safety ? createSafetyNode(options.safety) : safetyNode;
  const perf = options.performance ? createPerformanceNode(options.performance) : performanceNode;
  const a11y = options.accessibility ? createAccessibilityNode(options.accessibility) : accessibilityNode;
  const pat = options.pattern ? createPatternNode(options.pattern) : patternNode;

  return new StateGraph(ReportState)
    .addNode('safety', safety)
    .addNode('perf', perf)
    .addNode('a11y', a11y)
    .addNode('pattern', pat)
    .addNode('summarize', summarizeNode)
    .addEdge(START, 'safety')
    .addEdge(START, 'perf')
    .addEdge(START, 'a11y')
    .addEdge(START, 'pattern')
    .addEdge('safety', 'summarize')
    .addEdge('perf', 'summarize')
    .addEdge('a11y', 'summarize')
    .addEdge('pattern', 'summarize')
    .addEdge('summarize', END);
}
