/**
 * EATA Compaction - Branch Summarization
 *
 * Provides branch summary functionality for preserving context when switching
 * between conversation branches.
 * Based on Pi compaction architecture.
 */

import type { CompactionMessage } from './cut-point.js';
import {
  serializeConversation,
  parseFileOperations,
  formatFileOperations,
} from './summary.js';

/**
 * Configuration for branch summary generation.
 */
export interface BranchSummaryConfig {
  /**
   * Minimum message count to trigger branch summary.
   * @default 3
   */
  minMessages?: number;

  /**
   * Minimum token count to trigger branch summary.
   * @default 500
   */
  minTokens?: number;

  /**
   * Maximum characters for tool results in summary.
   * @default 2000
   */
  toolResultMaxChars?: number;
}

/**
 * Default branch summary configuration.
 */
export const BRANCH_SUMMARY_DEFAULTS: Required<BranchSummaryConfig> = {
  minMessages: 3,
  minTokens: 500,
  toolResultMaxChars: 2000,
};

/**
 * Options for shouldGenerateBranchSummary.
 */
export interface ShouldGenerateOptions {
  /**
   * Messages from the source branch.
   */
  sourceBranchMessages: CompactionMessage[];

  /**
   * Whether a branch summary already exists.
   * @default false
   */
  existingSummary?: boolean;
}

/**
 * Branch summary result.
 */
export interface BranchSummaryResult {
  /**
   * The formatted branch summary (markdown).
   */
  summary: string;

  /**
   * Files read in the source branch.
   */
  readFiles: string[];

  /**
   * Files modified in the source branch.
   */
  modifiedFiles: string[];

  /**
   * Token estimate of the summary.
   */
  tokenEstimate: number;
}

/**
 * Options for branch summary generation.
 */
export interface GenerateOptions {
  /**
   * Custom title for the branch.
   */
  branchTitle?: string;

  /**
   * Custom summarization prompt.
   */
  customPrompt?: string;

  /**
   * Maximum characters for tool results.
   * @default 2000
   */
  toolResultMaxChars?: number;
}

/**
 * Check if a branch summary should be generated for the given source branch.
 *
 * A branch summary should be generated when:
 * 1. The source branch has sufficient messages (>= minMessages)
 * 2. The source branch has sufficient content (>= minTokens estimated)
 * 3. No existing branch summary is present
 *
 * @param options - Options containing source branch messages
 * @param config - Optional configuration overrides
 * @returns Whether a branch summary should be generated
 */
export function shouldGenerateBranchSummary(
  options: ShouldGenerateOptions,
  config: BranchSummaryConfig = {},
): boolean {
  const {
    sourceBranchMessages,
    existingSummary = false,
  } = options;

  const {
    minMessages = BRANCH_SUMMARY_DEFAULTS.minMessages,
    minTokens = BRANCH_SUMMARY_DEFAULTS.minTokens,
  } = config;

  // Don't generate if summary already exists
  if (existingSummary) {
    return false;
  }

  // Don't generate for empty or very small branches
  if (!sourceBranchMessages || sourceBranchMessages.length < minMessages) {
    return false;
  }

  // Estimate token count from messages
  const estimatedTokens = estimateBranchTokens(sourceBranchMessages);

  // Don't generate if branch is too small
  if (estimatedTokens < minTokens) {
    return false;
  }

  return true;
}

/**
 * Estimate token count from messages.
 * Rough approximation: 1 token ≈ 4 characters for English text.
 */
function estimateBranchTokens(messages: CompactionMessage[]): number {
  let totalChars = 0;

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      totalChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (typeof block === 'object' && block !== null && 'text' in block) {
          const text = (block as { text: string }).text;
          if (typeof text === 'string') {
            totalChars += text.length;
          }
        }
      }
    }
  }

  return Math.ceil(totalChars / 4);
}

/**
 * Generate a branch summary from source branch messages.
 *
 * The branch summary includes:
 * - Branch context header
 * - Serialized conversation
 * - File operations (read/modified files)
 *
 * @param messages - Messages from the source branch
 * @param options - Generation options
 * @returns The branch summary result
 */
export function generateBranchSummary(
  messages: CompactionMessage[],
  options: GenerateOptions = {},
): BranchSummaryResult {
  const {
    branchTitle = 'Source Branch Context',
    toolResultMaxChars = BRANCH_SUMMARY_DEFAULTS.toolResultMaxChars,
  } = options;

  // Serialize the conversation
  const serialized = serializeConversation(messages, toolResultMaxChars);

  // Extract file operations from messages
  const { readFiles, modifiedFiles } = extractFileOpsFromMessages(messages);

  // Format file operations
  const fileOpsSection = formatFileOperations(readFiles, modifiedFiles);

  // Build the summary
  const summaryParts: string[] = [
    `## ${branchTitle}`,
    '',
    'The following context is from a previous branch and should be used as background knowledge:',
    '',
    serialized,
    fileOpsSection,
    '',
    '---',
    'End of branch context.',
  ];

  const summary = summaryParts.join('\n');

  return {
    summary,
    readFiles,
    modifiedFiles,
    tokenEstimate: Math.ceil(summary.length / 4),
  };
}

/**
 * Extract file operations from messages.
 */
function extractFileOpsFromMessages(messages: CompactionMessage[]): {
  readFiles: string[];
  modifiedFiles: string[];
} {
  const readSet = new Set<string>();
  const writtenSet = new Set<string>();
  const editedSet = new Set<string>();

  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;
    if (!Array.isArray(msg.content)) continue;

    for (const block of msg.content) {
      if (typeof block !== 'object' || block === null) continue;
      if (!('type' in block) || block.type !== 'toolCall') continue;
      if (!('arguments' in block) || !('name' in block)) continue;

      const args = block.arguments as Record<string, unknown> | undefined;
      if (!args) continue;

      const path = typeof args.path === 'string' ? args.path : undefined;
      if (!path) continue;

      switch (block.name) {
        case 'read':
          readSet.add(path);
          break;
        case 'write':
          writtenSet.add(path);
          break;
        case 'edit':
          editedSet.add(path);
          break;
      }
    }
  }

  const modified = new Set([...writtenSet, ...editedSet]);
  const readOnly = [...readSet].filter((f) => !modified.has(f)).sort();
  const modifiedFiles = [...modified].sort();

  return { readFiles: readOnly, modifiedFiles };
}

/**
 * Inject a branch summary into the target branch messages.
 *
 * The summary is injected as a system message at the beginning of the conversation,
 * providing context from the source branch.
 *
 * @param targetMessages - Messages in the target branch
 * @param summary - The branch summary to inject
 * @returns New messages array with summary injected
 */
export function injectBranchSummary(
  targetMessages: CompactionMessage[],
  summary: BranchSummaryResult | string,
): CompactionMessage[] {
  const summaryText = typeof summary === 'string' ? summary : summary.summary;

  // Create the system message with branch summary
  const summaryMessage: CompactionMessage = {
    role: 'system',
    content: summaryText,
    messageType: 'branch_summary',
  };

  // Inject at the beginning of the messages
  return [summaryMessage, ...targetMessages];
}
