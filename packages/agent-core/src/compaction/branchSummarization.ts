/**
 * EATA Compaction - Branch Summarization
 *
 * Class-based branch summarization with cumulative file tracking,
 * /tree navigation context preservation, and multi-branch support.
 *
 * Key features:
 * - Summarizes branch context when switching via /tree navigation
 * - Cumulative file tracking across multiple compactions
 * - Branch context injection when navigating to a target branch
 * - Stores and updates branch summaries in a Map<string, BranchSummaryEntry>
 */

import type { BranchSummaryResult, BranchSummaryEntry } from './types.js';
import type { ToolRegistry } from '../tools/types.js';
import type { CompactionMessage } from './cut-point.js';

/**
 * Default token threshold for generating a branch summary.
 * If the estimated token count exceeds this, always generate a summary.
 */
const DEFAULT_TOKEN_THRESHOLD = 500;

/**
 * Keyword categories for detecting key information in messages.
 */
const KEY_CATEGORIES = {
  decisions: ['decided', 'because', 'chose', 'selected', 'opted', 'decision'] as const,
  problems: ['problem', 'solution', 'fixed', 'resolved', 'issue', 'bug'] as const,
  unfinished: ['todo', 'fixme', 'pending', 'outstanding', 'incomplete'] as const,
  nextSteps: ['next', 'then', 'later', 'after', 'finally', 'remaining'] as const,
} as const;

/**
 * Estimate token count from text content.
 * Rough approximation: 1 token ≈ 4 characters for English text.
 */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Extract all text content from messages, joined with newlines.
 */
function extractAllText(messages: CompactionMessage[]): string {
  const parts: string[] = [];
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      parts.push(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (typeof block === 'object' && block !== null && 'text' in block) {
          const text = (block as { text: string }).text;
          if (typeof text === 'string') parts.push(text);
        }
      }
    }
  }
  return parts.join('\n');
}

/**
 * Extract file operations from message content (tool calls for read/write/edit).
 */
function extractFileOps(messages: CompactionMessage[]): {
  readFiles: string[];
  modifiedFiles: string[];
} {
  const readSet = new Set<string>();
  const modifiedSet = new Set<string>();

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
        case 'edit':
          modifiedSet.add(path);
          break;
      }
    }
  }

  // Remove read files that were later modified
  const readOnly = [...readSet].filter((f) => !modifiedSet.has(f)).sort();
  const modified = [...modifiedSet].sort();

  return { readFiles: readOnly, modifiedFiles: modified };
}

/**
 * Merge cumulative file lists: previous + new, deduplicating and removing
 * read-only files that were later modified.
 */
function mergeFileTracking(
  previous: { readFiles: string[]; modifiedFiles: string[] },
  current: { readFiles: string[]; modifiedFiles: string[] },
): { readFiles: string[]; modifiedFiles: string[] } {
  const readSet = new Set([...previous.readFiles, ...current.readFiles]);
  const modifiedSet = new Set([...previous.modifiedFiles, ...current.modifiedFiles]);

  // Files that were later modified should not appear in readFiles
  for (const file of modifiedSet) {
    readSet.delete(file);
  }

  return {
    readFiles: [...readSet].sort(),
    modifiedFiles: [...modifiedSet].sort(),
  };
}

/**
 * Extract lines matching specific keywords from message text.
 * Returns deduplicated lines containing at least one keyword.
 */
function extractKeywordLines(
  text: string,
  keywords: readonly string[],
): string[] {
  const lines = text.split('\n');
  const seen = new Set<string>();
  const results: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const lowerLine = trimmed.toLowerCase();
    const matches = keywords.some((kw) => lowerLine.includes(kw));
    if (!matches) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    results.push(trimmed);
  }

  return results;
}

/**
 * BranchSummarization class.
 *
 * Manages branch summaries for /tree navigation context preservation.
 * Tracks cumulative file operations across multiple compactions.
 *
 * Usage:
 * ```typescript
 * const summarizer = new BranchSummarization(toolRegistry);
 *
 * // When navigating via /tree from one branch to another:
 * const result = await summarizer.summarizeBranch('feature-A', messages);
 * const injected = await summarizer.injectBranchSummary('main', result.summary);
 *
 * // Check if summary is needed:
 * if (summarizer.shouldGenerateSummary('feature-A', 'main', messages)) { ... }
 * ```
 */
export class BranchSummarization {
  private readonly tools: ToolRegistry;
  private readonly summaries: Map<string, BranchSummaryEntry> = new Map();

  constructor(tools: ToolRegistry) {
    this.tools = tools;
  }

  /**
   * Summarize a branch from its message history.
   *
   * - Extracts context (decisions, file ops, next steps) from messages
   * - Merges cumulative file tracking with any previous summary
   * - Stores the updated summary entry for the branch
   *
   * @param branchName - Name of the branch to summarize
   * @param messages - Messages from the branch conversation
   * @returns BranchSummaryResult with the generated summary and file tracking
   */
  async summarizeBranch(
    branchName: string,
    messages: CompactionMessage[],
  ): Promise<BranchSummaryResult> {
    const context = this.extractBranchContext(messages);
    const fileOps = extractFileOps(messages);

    // Merge with previous cumulative tracking
    const previous = this.summaries.get(branchName);
    const previousFiles = previous
      ? { readFiles: previous.readFiles, modifiedFiles: previous.modifiedFiles }
      : { readFiles: [], modifiedFiles: [] };

    const cumulative = mergeFileTracking(previousFiles, fileOps);

    // Build the markdown summary
    const summary = this.buildBranchSummary(branchName, context, cumulative);

    const timestamp = new Date().toISOString();
    const tokenCount = estimateTokenCount(summary);

    // Store the entry for cumulative tracking
    const entry: BranchSummaryEntry = {
      entryType: 'branch_summary',
      branchName,
      summary,
      readFiles: cumulative.readFiles,
      modifiedFiles: cumulative.modifiedFiles,
      tokenCount,
      timestamp,
      details: {
        compactionCount: (previous?.details?.compactionCount as number ?? 0) + 1,
      },
    };
    this.summaries.set(branchName, entry);

    return {
      branchName,
      summary,
      readFiles: cumulative.readFiles,
      modifiedFiles: cumulative.modifiedFiles,
      tokenCount,
      timestamp,
    };
  }

  /**
   * Inject a branch summary into the conversation for the target branch.
   *
   * Creates a system message with the branch context so the model
   * knows what was happening on the branch it's navigating to.
   *
   * @param targetBranch - Name of the branch being navigated to
   * @param summary - The summary to inject (or lookup from stored summaries)
   * @returns Array containing the injected system message
   */
  async injectBranchSummary(
    targetBranch: string,
    summary: string,
  ): Promise<CompactionMessage[]> {
    const systemMessage: CompactionMessage = {
      role: 'system',
      content:
        `You are continuing work from the ${targetBranch} branch. Here is the previous context:\n\n${summary}`,
      messageType: 'branch_summary',
    };

    return [systemMessage];
  }

  /**
   * Determine whether a summary should be generated when navigating branches.
   *
   * Logic:
   * 1. Branch switch (currentBranch !== targetBranch) → always true
   * 2. Empty message history → false
   * 3. Token estimate > threshold → true
   * 4. Messages contain key information keywords → true
   * 5. Otherwise → false
   *
   * @param currentBranch - The branch currently on
   * @param targetBranch - The branch being navigated to
   * @param messageCount - Number of messages (or array of messages)
   * @returns Whether to generate a branch summary
   */
  private shouldGenerateSummary(
    currentBranch: string,
    targetBranch: string,
    messageCount: number | CompactionMessage[],
  ): boolean {
    // 1. Branch switch → always generate
    if (currentBranch !== targetBranch) {
      return true;
    }

    // Handle both number and array overloads
    const messages = Array.isArray(messageCount) ? messageCount : [];
    const count = Array.isArray(messageCount) ? messageCount.length : messageCount;

    // 2. Empty history → nothing to summarize
    if (count === 0) {
      return false;
    }

    // 3. Token threshold check (use messages if available)
    if (messages.length > 0) {
      const text = extractAllText(messages);
      const tokens = estimateTokenCount(text);
      if (tokens > DEFAULT_TOKEN_THRESHOLD) {
        return true;
      }
    } else if (count > DEFAULT_TOKEN_THRESHOLD / 4) {
      // Heuristic: large message count likely exceeds threshold
      return true;
    }

    // 4. Check for key information keywords in messages
    if (messages.length > 0) {
      const text = extractAllText(messages).toLowerCase();
      const allKeywords = [
        ...KEY_CATEGORIES.decisions,
        ...KEY_CATEGORIES.problems,
        ...KEY_CATEGORIES.unfinished,
        ...KEY_CATEGORIES.nextSteps,
      ];
      if (allKeywords.some((kw) => text.includes(kw))) {
        return true;
      }
    }

    // 5. Otherwise → skip
    return false;
  }

  /**
   * Extract contextual information from branch messages.
   *
   * @param messages - Messages from the branch
   * @returns Extracted context with categorized information
   */
  private extractBranchContext(
    messages: CompactionMessage[],
  ): Record<string, string[]> {
    const text = extractAllText(messages);

    return {
      decisions: extractKeywordLines(text, KEY_CATEGORIES.decisions),
      problems: extractKeywordLines(text, KEY_CATEGORIES.problems),
      unfinished: extractKeywordLines(text, KEY_CATEGORIES.unfinished),
      nextSteps: extractKeywordLines(text, KEY_CATEGORIES.nextSteps),
    };
  }

  /**
   * Build a markdown branch summary from extracted context and file operations.
   */
  private buildBranchSummary(
    branchName: string,
    context: Record<string, string[]>,
    fileOps: { readFiles: string[]; modifiedFiles: string[] },
  ): string {
    const sections: string[] = [];

    // Header
    sections.push(`# ${branchName} Branch Summary`);

    // Key Decisions
    sections.push('');
    sections.push('## Key Decisions');
    if (context.decisions.length > 0) {
      for (const d of context.decisions) sections.push(`- ${d}`);
    } else {
      sections.push('- None');
    }

    // File Operations
    sections.push('');
    sections.push('## File Operations');
    if (fileOps.readFiles.length > 0) {
      sections.push('<read-files>');
      for (const f of fileOps.readFiles) sections.push(`- ${f}`);
      sections.push('</read-files>');
    }
    if (fileOps.modifiedFiles.length > 0) {
      sections.push('');
      sections.push('<modified-files>');
      for (const f of fileOps.modifiedFiles) sections.push(`- ${f}`);
      sections.push('</modified-files>');
    }
    if (fileOps.readFiles.length === 0 && fileOps.modifiedFiles.length === 0) {
      sections.push('- None');
    }

    // Problems & Solutions
    sections.push('');
    sections.push('## Problems & Solutions');
    if (context.problems.length > 0) {
      for (const p of context.problems) sections.push(`- ${p}`);
    } else {
      sections.push('- None');
    }

    // Unfinished Tasks
    sections.push('');
    sections.push('## Unfinished Tasks');
    if (context.unfinished.length > 0) {
      for (const t of context.unfinished) sections.push(`- TODO: ${t}`);
    } else {
      sections.push('- None');
    }

    // Next Steps
    sections.push('');
    sections.push('## Next Steps');
    if (context.nextSteps.length > 0) {
      for (const s of context.nextSteps) sections.push(`- ${s}`);
    } else {
      sections.push('- None');
    }

    return sections.join('\n');
  }

  /**
   * Get stored summary entry for a branch (if any).
   */
  getBranchSummary(branchName: string): BranchSummaryEntry | undefined {
    return this.summaries.get(branchName);
  }

  /**
   * Check if a branch has a stored summary.
   */
  hasSummary(branchName: string): boolean {
    return this.summaries.has(branchName);
  }

  /**
   * Get all branch names that have stored summaries.
   */
  listBranches(): string[] {
    return [...this.summaries.keys()];
  }

  /**
   * Clear all stored branch summaries.
   */
  clearSummaries(): void {
    this.summaries.clear();
  }

  /**
   * Navigate from currentBranch to targetBranch: summarize current,
   * inject target summary into conversation.
   *
   * This is the main entry point for /tree navigation context preservation.
   * Steps:
   * 1. If shouldGenerateSummary → summarize current branch
   * 2. If target branch has a stored summary → inject it
   * 3. Return the combined conversation with injected context
   *
   * @param currentBranch - Branch being navigated away from
   * @param targetBranch - Branch being navigated to
   * @param currentMessages - Messages from the current branch
   * @returns Messages with branch context injected (or empty if no summary needed)
   */
  async navigateBranch(
    currentBranch: string,
    targetBranch: string,
    currentMessages: CompactionMessage[],
  ): Promise<CompactionMessage[]> {
    // Step 1: Summarize the branch we're leaving
    if (this.shouldGenerateSummary(currentBranch, targetBranch, currentMessages)) {
      await this.summarizeBranch(currentBranch, currentMessages);
    }

    // Step 2: Inject target branch summary if available
    const targetSummary = this.summaries.get(targetBranch);
    if (targetSummary) {
      return this.injectBranchSummary(targetBranch, targetSummary.summary);
    }

    // Step 3: No target summary yet → return empty (no injection needed)
    return [];
  }
}
