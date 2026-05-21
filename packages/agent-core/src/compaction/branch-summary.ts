/**
 * EATA Compaction - Branch Summarization
 *
 * Provides branch summary functionality for preserving context when switching
 * between conversation branches.
 * Based on Pi compaction architecture.
 */

import type { CompactionMessage } from './cut-point.js';

/**
 * Key information keyword categories (case-insensitive detection).
 */
const KEY_INFORMATION_CATEGORIES = {
  decisions: ['decided', 'because', 'chose', 'selected', 'opted'],
  problemsSolutions: ['problem', 'solution', 'fixed', 'resolved', 'issue'],
  unfinishedTasks: ['todo', 'fixme', 'pending', 'outstanding', 'incomplete'],
  nextSteps: ['next', 'then', 'later', 'after', 'finally'],
} as const;

/**
 * Get all text content from messages as a single string.
 */
function extractTextContent(messages: CompactionMessage[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      parts.push(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (typeof block === 'object' && block !== null && 'text' in block) {
          const text = (block as { text: string }).text;
          if (typeof text === 'string') {
            parts.push(text);
          }
        }
      }
    }
  }

  return parts.join('\n');
}

/**
 * Estimate token count from messages.
 * Rough approximation: 1 token ≈ 4 characters for English text.
 */
function estimateTokens(messages: CompactionMessage[]): number {
  const text = extractTextContent(messages);
  return Math.ceil(text.length / 4);
}

/**
 * Check if the message history contains key information worth preserving.
 *
 * Detects 4 categories (case-insensitive):
 * - Decisions: decided, because, chose, selected, opted
 * - Problems/Solutions: problem, solution, fixed, resolved, issue
 * - Unfinished Tasks: TODO, FIXME, pending, outstanding, incomplete
 * - Next Steps: next, then, later, after, finally
 */
function containsKeyInformation(messages: CompactionMessage[]): boolean {
  const text = extractTextContent(messages).toLowerCase();

  const allKeywords = Object.values(KEY_INFORMATION_CATEGORIES).flat();
  return allKeywords.some((keyword) => text.includes(keyword));
}

/**
 * Extract lines matching specific keywords from message text.
 * Returns deduplicated lines containing at least one keyword (case-insensitive).
 */
function extractKeywordLines(
  messages: CompactionMessage[],
  keywords: readonly string[],
): string[] {
  const text = extractTextContent(messages);
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
 * Extract file operations from messages (tool calls for read/write/edit).
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
 * Check if a branch summary should be generated.
 *
 * Logic:
 * 1. currentBranch !== targetBranch → true (switching branches)
 * 2. messageHistory.length === 0 → false (empty history)
 * 3. Token estimate > 500 → true (above threshold)
 * 4. Message history contains key information → true
 * 5. Otherwise → false
 *
 * @param currentBranch - The current branch name
 * @param targetBranch - The target branch name being switched to
 * @param messageHistory - Messages from the conversation
 * @returns Whether a branch summary should be generated
 */
export function shouldGenerateBranchSummary(
  currentBranch: string,
  targetBranch: string,
  messageHistory: CompactionMessage[],
): boolean {
  // 1. Switching branches → always generate
  if (currentBranch !== targetBranch) {
    return true;
  }

  // 2. Empty history → nothing to summarize
  if (messageHistory.length === 0) {
    return false;
  }

  // 3. Token estimate > 500 → generate (substantial content)
  const tokens = estimateTokens(messageHistory);
  if (tokens > 500) {
    return true;
  }

  // 4. Contains key information → generate
  if (containsKeyInformation(messageHistory)) {
    return true;
  }

  // 5. Otherwise → skip
  return false;
}

/**
 * Generate a branch summary from message history.
 *
 * Extracts decisions, file operations, problems/solutions, unfinished tasks,
 * and next steps from the messages, then builds a structured Markdown summary.
 *
 * @param messageHistory - Messages from the branch to summarize
 * @param branchName - Name of the branch
 * @param options - Optional generation parameters
 * @returns Structured Markdown summary string (synchronous)
 */
export function generateBranchSummary(
  messageHistory: CompactionMessage[],
  branchName: string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  },
): string {
  // Suppress unused options (reserved for future LLM integration)
  void options;

  // 1. Extract categorized information from messages
  const decisions = extractKeywordLines(
    messageHistory,
    KEY_INFORMATION_CATEGORIES.decisions,
  );
  const problemsSolutions = extractKeywordLines(
    messageHistory,
    KEY_INFORMATION_CATEGORIES.problemsSolutions,
  );
  const unfinishedTasks = extractKeywordLines(
    messageHistory,
    KEY_INFORMATION_CATEGORIES.unfinishedTasks,
  );
  const nextSteps = extractKeywordLines(
    messageHistory,
    KEY_INFORMATION_CATEGORIES.nextSteps,
  );

  // 2. Extract file operations from tool calls
  const { readFiles, modifiedFiles } = extractFileOpsFromMessages(messageHistory);

  // 3. Build Markdown summary
  const sections: string[] = [];

  // Header
  sections.push(`# ${branchName} Branch Summary`);

  // Key Decisions
  sections.push('');
  sections.push('## Key Decisions');
  if (decisions.length > 0) {
    for (const d of decisions) {
      sections.push(`- ${d}`);
    }
  } else {
    sections.push('- None');
  }

  // File Operations
  sections.push('');
  sections.push('## File Operations');
  if (readFiles.length > 0) {
    sections.push('<read-files>');
    for (const f of readFiles) {
      sections.push(`- ${f}`);
    }
    sections.push('</read-files>');
  }

  if (modifiedFiles.length > 0) {
    sections.push('');
    sections.push('<modified-files>');
    for (const f of modifiedFiles) {
      sections.push(`- ${f}`);
    }
    sections.push('</modified-files>');
  }

  if (readFiles.length === 0 && modifiedFiles.length === 0) {
    sections.push('- None');
  }

  // Problems & Solutions
  sections.push('');
  sections.push('## Problems & Solutions');
  if (problemsSolutions.length > 0) {
    for (const ps of problemsSolutions) {
      sections.push(`- ${ps}`);
    }
  } else {
    sections.push('- None');
  }

  // Unfinished Tasks
  sections.push('');
  sections.push('## Unfinished Tasks');
  if (unfinishedTasks.length > 0) {
    for (const t of unfinishedTasks) {
      sections.push(`- TODO: ${t}`);
    }
  } else {
    sections.push('- None');
  }

  // Next Steps
  sections.push('');
  sections.push('## Next Steps');
  if (nextSteps.length > 0) {
    for (const s of nextSteps) {
      sections.push(`- ${s}`);
    }
  } else {
    sections.push('- None');
  }

  return sections.join('\n');
}

/**
 * Inject a branch summary as a system message.
 *
 * Creates a single system message containing the branch summary context,
 * formatted with a branch prefix for clear attribution.
 *
 * @param targetBranch - The target branch name
 * @param summary - The branch summary content
 * @returns Single-element array containing the system message
 */
export function injectBranchSummary(
  targetBranch: string,
  summary: string,
): CompactionMessage[] {
  const systemMessage: CompactionMessage = {
    role: 'system',
    content: `You are continuing work from the ${targetBranch} branch. Here is the previous context:\n\n${summary}`,
    messageType: 'branch_summary',
  };

  return [systemMessage];
}
