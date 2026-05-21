/**
 * EATA Compaction Module
 *
 * Provides context compaction functionality for managing long conversations.
 * Based on Pi compaction architecture.
 */

// Trigger logic
export {
  createCompactionTrigger,
  shouldTriggerCompaction,
  estimateTokens,
  COMPACTION_DEFAULTS,
} from './trigger.js';

export type {
  CompactionTriggerConfig,
  TriggerResult,
} from './trigger.js';

// Cut point rules
export {
  findCutPoint,
  isValidCutPoint,
  isToolResult,
  isToolCall,
  isTurnBoundary,
  getTurnMessages,
  groupByTurns,
  DEFAULT_CUT_POINT_CONFIG,
} from './cut-point.js';

export type {
  CompactionMessage,
  MessageRole,
  MessageWithTokens,
  CutPointResult,
  CutPointConfig,
} from './cut-point.js';

// Summary generation
export {
  serializeConversation,
  prepareSummarizationPrompt,
  createSummaryResult,
  extractFileOpsFromMessage,
  computeFileLists,
  formatFileOperations,
  parseFileOperations,
  createFileOps,
  mergeFileTracking,
  SUMMARIZATION_SYSTEM_PROMPT,
  // Pi summary generation
  generateSummary,
  extractGoal,
  extractProgress,
  extractKeyDecisions,
  extractNextSteps,
  extractCriticalContext,
  extractFileOperations,
  buildSummaryMarkdown,
} from './summary.js';

export type {
  StructuredSummary,
  SummaryOptions,
  SummaryResult,
  FileOperations,
  SummaryData,
} from './summary.js';

// Branch summarization (function-based)
export {
  shouldGenerateBranchSummary,
  generateBranchSummary,
  injectBranchSummary,
} from './branch-summary.js';

// Branch summarization (class-based, with cumulative tracking)
export { BranchSummarization } from './branchSummarization.js';

// Types
export type {
  BranchSummaryResult,
  BranchSummaryEntry,
} from './types.js';

// Split turn detection
export {
  isSplitTurn,
  splitTurnAtMessage,
  mergeSummaries,
} from './splitTurn.js';
