/**
 * EATA Compaction - Summary Generation
 *
 * Generates structured summaries of conversation history.
 * Based on Pi compaction architecture.
 */

import type { CompactionMessage } from './cut-point.js';

/**
 * Structured summary format (matches Pi project).
 */
export interface StructuredSummary {
  /**
   * What the user is trying to accomplish.
   */
  goal: string;

  /**
   * User-specified requirements and preferences.
   */
  constraints?: string[];

  /**
   * Progress tracking.
   */
  progress: {
    done: string[];
    inProgress?: string[];
    blocked?: string[];
  };

  /**
   * Key decisions made during the session.
   */
  decisions?: Array<{
    decision: string;
    rationale: string;
  }>;

  /**
   * Recommended next steps.
   */
  nextSteps?: string[];

  /**
   * Critical context needed to continue.
   */
  criticalContext?: string[];

  /**
   * Files that were read (not modified).
   */
  readFiles?: string[];

  /**
   * Files that were modified.
   */
  modifiedFiles?: string[];
}

/**
 * Summary generation options.
 */
export interface SummaryOptions {
  /**
   * Custom system prompt for summarization.
   */
  customPrompt?: string;

  /**
   * Previous summary to iterate on.
   */
  previousSummary?: string;

  /**
   * Maximum length of tool result content in serialized output.
   * @default 2000
   */
  toolResultMaxChars?: number;
}

/**
 * Summary result.
 */
export interface SummaryResult {
  /**
   * The generated summary text (markdown format).
   */
  summary: string;

  /**
   * Parsed structured summary (if parsing succeeds).
   */
  structured?: StructuredSummary;

  /**
   * Files tracked during summarization.
   */
  fileTracking: {
    readFiles: string[];
    modifiedFiles: string[];
  };
}

/**
 * Default summarization system prompt.
 */
export const SUMMARIZATION_SYSTEM_PROMPT = `You are a context summarization assistant. Your task is to read a conversation and produce a structured summary following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.

## Output Format

You MUST output the summary in the following markdown format:

## Goal
[What the user is trying to accomplish]

## Constraints & Preferences
- [Requirements mentioned by user]

## Progress
### Done
- [x] [Completed tasks]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues, if any - omit this section if no blockers]

## Key Decisions
- **[Decision]**: [Rationale]

## Next Steps
1. [What should happen next]

## Critical Context
- [Data needed to continue]

<read-files>
path/to/file1.ts
path/to/file2.ts
</read-files>

<modified-files>
path/to/changed.ts
</modified-files>

## Rules
1. Include ALL relevant context needed to continue the task
2. Track all file operations (reads and modifications)
3. Preserve key decisions and rationale
4. List concrete next steps
5. Include any constraints or preferences mentioned`;

/**
 * Maximum characters for tool results in summaries.
 */
const TOOL_RESULT_MAX_CHARS = 2000;

/**
 * Truncate text for summary output.
 */
function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const truncatedChars = text.length - maxChars;
  return `${text.slice(0, maxChars)}\n\n[... ${truncatedChars} more characters truncated]`;
}

/**
 * Extract text content from message content.
 */
function extractTextContent(content: string | unknown[]): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter(
        (c): c is { type: 'text'; text: string } =>
          typeof c === 'object' && c !== null && 'type' in c && c.type === 'text',
      )
      .map((c) => c.text)
      .join('');
  }

  return '';
}

/**
 * Serialize a single message for summarization.
 */
function serializeMessage(message: CompactionMessage, maxChars: number): string {
  const content = extractTextContent(message.content);

  switch (message.role) {
    case 'user':
      return `[User]: ${content}`;

    case 'assistant': {
      const parts: string[] = [];

      // Check if content is array with thinking blocks
      if (Array.isArray(message.content)) {
        const thinkingBlocks = message.content
          .filter(
            (c): c is { type: 'thinking'; thinking: string } =>
              typeof c === 'object' && c !== null && 'type' in c && c.type === 'thinking',
          )
          .map((c) => c.thinking);

        const textBlocks = message.content
          .filter(
            (c): c is { type: 'text'; text: string } =>
              typeof c === 'object' && c !== null && 'type' in c && c.type === 'text',
          )
          .map((c) => c.text);

        if (thinkingBlocks.length > 0) {
          parts.push(`[Assistant thinking]: ${thinkingBlocks.join('\n')}`);
        }
        if (textBlocks.length > 0) {
          parts.push(`[Assistant]: ${textBlocks.join('\n')}`);
        }
      } else {
        if (content) {
          parts.push(`[Assistant]: ${content}`);
        }
      }

      // Check for tool calls
      if (Array.isArray(message.content)) {
        const toolCalls = message.content
          .filter(
            (c): c is { type: 'toolCall'; name: string; arguments: unknown } =>
              typeof c === 'object' &&
              c !== null &&
              'type' in c &&
              c.type === 'toolCall',
          )
          .map((c) => {
            const args = c.arguments as Record<string, unknown>;
            const argsStr = Object.entries(args)
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join(', ');
            return `${c.name}(${argsStr})`;
          });

        if (toolCalls.length > 0) {
          parts.push(`[Assistant tool calls]: ${toolCalls.join('; ')}`);
        }
      }

      return parts.join('\n');
    }

    case 'toolResult':
    case 'tool':
      return `[Tool result]: ${truncateText(content, maxChars)}`;

    default:
      return `[${message.role}]: ${content}`;
  }
}

/**
 * Serialize conversation messages to text for summarization.
 * This prevents the model from treating it as a conversation to continue.
 */
export function serializeConversation(
  messages: CompactionMessage[],
  maxChars = TOOL_RESULT_MAX_CHARS,
): string {
  return messages
    .map((msg) => serializeMessage(msg, maxChars))
    .filter((s) => s.length > 0)
    .join('\n\n');
}

/**
 * File operations tracker for summaries.
 */
export interface FileOperations {
  read: Set<string>;
  written: Set<string>;
  edited: Set<string>;
}

/**
 * Create a new file operations tracker.
 */
export function createFileOps(): FileOperations {
  return {
    read: new Set(),
    written: new Set(),
    edited: new Set(),
  };
}

/**
 * Extract file operations from a message.
 */
export function extractFileOpsFromMessage(
  message: CompactionMessage,
  fileOps: FileOperations,
): void {
  if (message.role !== 'assistant') return;
  if (!Array.isArray(message.content)) return;

  for (const block of message.content) {
    if (typeof block !== 'object' || block === null) continue;
    if (!('type' in block) || block.type !== 'toolCall') continue;
    if (!('arguments' in block) || !('name' in block)) continue;

    const args = block.arguments as Record<string, unknown> | undefined;
    if (!args) continue;

    const path = typeof args.path === 'string' ? args.path : undefined;
    if (!path) continue;

    switch (block.name) {
      case 'read':
        fileOps.read.add(path);
        break;
      case 'write':
        fileOps.written.add(path);
        break;
      case 'edit':
        fileOps.edited.add(path);
        break;
    }
  }
}

/**
 * Compute file lists from operations.
 */
export function computeFileLists(fileOps: FileOperations): {
  readFiles: string[];
  modifiedFiles: string[];
} {
  const modified = new Set([...fileOps.edited, ...fileOps.written]);
  const readOnly = [...fileOps.read].filter((f) => !modified.has(f)).sort();
  const modifiedFiles = [...modified].sort();
  return { readFiles: readOnly, modifiedFiles };
}

/**
 * Format file operations as XML tags for summary.
 */
export function formatFileOperations(
  readFiles: string[],
  modifiedFiles: string[],
): string {
  const sections: string[] = [];

  if (readFiles.length > 0) {
    sections.push(`<read-files>\n${readFiles.join('\n')}\n</read-files>`);
  }

  if (modifiedFiles.length > 0) {
    sections.push(`<modified-files>\n${modifiedFiles.join('\n')}\n</modified-files>`);
  }

  if (sections.length === 0) return '';
  return `\n\n${sections.join('\n\n')}`;
}

/**
 * Parse file operations from summary text.
 */
export function parseFileOperations(summary: string): {
  readFiles: string[];
  modifiedFiles: string[];
} {
  const readFiles: string[] = [];
  const modifiedFiles: string[] = [];

  // Parse <read-files> section
  const readMatch = summary.match(/<read-files>([\s\S]*?)<\/read-files>/);
  if (readMatch) {
    const content = readMatch[1].trim();
    if (content) {
      readFiles.push(
        ...content
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      );
    }
  }

  // Parse <modified-files> section
  const modifiedMatch = summary.match(/<modified-files>([\s\S]*?)<\/modified-files>/);
  if (modifiedMatch) {
    const content = modifiedMatch[1].trim();
    if (content) {
      modifiedFiles.push(
        ...content
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      );
    }
  }

  return { readFiles, modifiedFiles };
}

/**
 * Prepare summarization prompt.
 */
export function prepareSummarizationPrompt(
  messages: CompactionMessage[],
  options: SummaryOptions = {},
): { systemPrompt: string; userPrompt: string } {
  const { previousSummary, toolResultMaxChars = TOOL_RESULT_MAX_CHARS } = options;

  // Serialize messages
  const serializedConversation = serializeConversation(messages, toolResultMaxChars);

  // Build user prompt
  let userPrompt = `Please summarize the following conversation:\n\n${serializedConversation}`;

  if (previousSummary) {
    userPrompt = `Previous summary (incorporate and update):\n${previousSummary}\n\n---\n\nNew conversation to summarize:\n\n${serializedConversation}`;
  }

  return {
    systemPrompt: options.customPrompt ?? SUMMARIZATION_SYSTEM_PROMPT,
    userPrompt,
  };
}

/**
 * Create a summary result from a summary string.
 */
export function createSummaryResult(
  summary: string,
  messages: CompactionMessage[],
): SummaryResult {
  // Track file operations from messages
  const fileOps = createFileOps();
  for (const msg of messages) {
    extractFileOpsFromMessage(msg, fileOps);
  }

  // Also parse from previous summary if included
  const fileLists = computeFileLists(fileOps);

  return {
    summary,
    fileTracking: fileLists,
  };
}

/**
 * Merge file tracking from multiple summaries.
 */
export function mergeFileTracking(
  ...trackings: Array<{ readFiles: string[]; modifiedFiles: string[] }>
): { readFiles: string[]; modifiedFiles: string[] } {
  const readSet = new Set<string>();
  const modifiedSet = new Set<string>();

  for (const tracking of trackings) {
    for (const file of tracking.readFiles) {
      readSet.add(file);
    }
    for (const file of tracking.modifiedFiles) {
      modifiedSet.add(file);
    }
  }

  // Remove files that were later modified from "read only"
  for (const file of modifiedSet) {
    readSet.delete(file);
  }

  return {
    readFiles: [...readSet].sort(),
    modifiedFiles: [...modifiedSet].sort(),
  };
}

// ============================================================================
// Pi Summary Generation - Extraction Functions
// ============================================================================

/**
 * Patterns for extracting structured information from messages.
 */
const GOAL_PATTERNS = [
  /\bgoal[:\s]+(.+)/i,
  /\bobjective[:\s]+(.+)/i,
  /\btask[:\s]+(.+)/i,
  /\bimplement\s+(.+)/i,
  /\bcreate\s+(.+)/i,
  /\bbuild\s+(.+)/i,
  /\badd\s+(.+)/i,
  /\bfix\s+(.+)/i,
];

const COMPLETED_PATTERNS = [
  /\b(done|completed|finished|created|added|fixed|resolved|merged|implemented|set up)\b/i,
  /\b[x]\s+(.+)/i,
];

const IN_PROGRESS_PATTERNS = [
  /\b(working on|in progress|currently|ongoing|processing)\b/i,
  /\b[ ]\s+(.+)/i,
];

const BLOCKED_PATTERNS = [
  /\b(blocked|blocker|issue|stuck|waiting for|error:|failed to)\b/i,
];

const DECISION_KEYWORDS = [
  'decided',
  'decision',
  'chose',
  'chosen',
  'going with',
  'using ... because',
  'we will use',
  'switched to',
  'picking',
];

const NEXT_STEP_PATTERNS = [
  /\bnext[:\s]+(.+)/i,
  /\bthen[:\s]+(.+)/i,
  /\bTODO[:\s]+(.+)/i,
  /\bremaining[:\s]+(.+)/i,
  /\bneeds?\s+to\s+be\s+(.+)/i,
];

const CRITICAL_CONTEXT_PATTERNS = [
  /\bimportant[:\s]+(.+)/i,
  /\bcritical[:\s]+(.+)/i,
  /\bnote[:\s]+(.+)/i,
  /\bremember[:\s]+(.+)/i,
  /\bwarning[:\s]+(.+)/i,
  /\bdon'?t\s+forget\s+(.+)/i,
];

/**
 * Collect all text content from messages, joined by newlines.
 */
function collectAllText(messages: CompactionMessage[]): string[] {
  const lines: string[] = [];

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      lines.push(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (typeof block === 'object' && block !== null && 'type' in block) {
          if (block.type === 'text' && 'text' in block) {
            lines.push((block as { text: string }).text);
          }
          if (block.type === 'thinking' && 'thinking' in block) {
            lines.push((block as { thinking: string }).thinking);
          }
        }
      }
    }
  }

  return lines;
}

/**
 * Extract the user's goal from conversation messages.
 * Prioritizes the first user message and explicit goal/objective/task patterns.
 */
export function extractGoal(messages: CompactionMessage[]): string {
  // First, check user messages for explicit goal patterns
  const userMessages = messages.filter((m) => m.role === 'user');

  for (const msg of userMessages) {
    const text = extractTextContent(msg.content);
    for (const pattern of GOAL_PATTERNS) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  }

  // Fallback: use the first user message content
  if (userMessages.length > 0) {
    const text = extractTextContent(userMessages[0].content);
    if (text) {
      // Truncate if too long
      return text.length > 200 ? text.slice(0, 200).trim() + '...' : text.trim();
    }
  }

  return 'No goal identified';
}

/**
 * Extract progress from messages: Done, In Progress, and Blocked items.
 */
export function extractProgress(messages: CompactionMessage[]): {
  done: string[];
  inProgress: string[];
  blocked: string[];
} {
  const done: string[] = [];
  const inProgress: string[] = [];
  const blocked: string[] = [];
  const allTexts = collectAllText(messages);

  for (const text of allTexts) {
    const lines = text.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length === 0) continue;

      let isBlocked = false;
      let isInProgress = false;
      let isDone = false;

      for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(line)) {
          blocked.push(line);
          isBlocked = true;
          break;
        }
      }

      if (isBlocked) continue;

      for (const pattern of IN_PROGRESS_PATTERNS) {
        if (pattern.test(line)) {
          inProgress.push(line);
          isInProgress = true;
          break;
        }
      }

      if (isInProgress) continue;

      for (const pattern of COMPLETED_PATTERNS) {
        if (pattern.test(line)) {
          done.push(line);
          isDone = true;
          break;
        }
      }

      if (isDone) continue;
    }
  }

  return { done, inProgress, blocked };
}

/**
 * Extract key decisions from messages.
 * Looks for decision keywords and extracts the surrounding sentence/line.
 */
export function extractKeyDecisions(messages: CompactionMessage[]): string[] {
  const decisions: string[] = [];
  const allTexts = collectAllText(messages);

  for (const text of allTexts) {
    const lines = text.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length === 0) continue;

      const lowerLine = line.toLowerCase();
      for (const keyword of DECISION_KEYWORDS) {
        if (lowerLine.includes(keyword)) {
          // Avoid duplicates
          if (!decisions.some((d) => d === line)) {
            decisions.push(line);
          }
          break;
        }
      }
    }
  }

  return decisions;
}

/**
 * Extract next steps from messages.
 */
export function extractNextSteps(messages: CompactionMessage[]): string[] {
  const steps: string[] = [];
  const allTexts = collectAllText(messages);

  for (const text of allTexts) {
    const lines = text.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length === 0) continue;

      for (const pattern of NEXT_STEP_PATTERNS) {
        if (pattern.test(line)) {
          const match = line.match(pattern);
          const step = match && match[1] ? match[1].trim() : line;
          if (!steps.some((s) => s === step)) {
            steps.push(step);
          }
          break;
        }
      }
    }
  }

  return steps;
}

/**
 * Extract critical context from messages.
 */
export function extractCriticalContext(messages: CompactionMessage[]): string {
  const contextItems: string[] = [];
  const allTexts = collectAllText(messages);

  for (const text of allTexts) {
    const lines = text.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length === 0) continue;

      for (const pattern of CRITICAL_CONTEXT_PATTERNS) {
        if (pattern.test(line)) {
          if (!contextItems.some((c) => c === line)) {
            contextItems.push(line);
          }
          break;
        }
      }
    }
  }

  return contextItems.length > 0
    ? contextItems.map((c) => `- ${c}`).join('\n')
    : '- No critical context identified';
}

/**
 * Extract file operations (read and modified) from messages.
 * Uses the existing fileOps infrastructure.
 */
export function extractFileOperations(messages: CompactionMessage[]): {
  readFiles: string[];
  modifiedFiles: string[];
} {
  const fileOps = createFileOps();
  for (const msg of messages) {
    extractFileOpsFromMessage(msg, fileOps);
  }
  return computeFileLists(fileOps);
}

/**
 * Data structure for building the summary markdown.
 */
export interface SummaryData {
  goal: string;
  progress: {
    done: string[];
    inProgress: string[];
    blocked: string[];
  };
  keyDecisions: string[];
  nextSteps: string[];
  criticalContext: string;
  readFiles: string[];
  modifiedFiles: string[];
}

/**
 * Build the Pi-format summary markdown from structured data.
 */
export function buildSummaryMarkdown(data: SummaryData): string {
  const parts: string[] = [];

  // Goal
  parts.push('## Goal');
  parts.push(data.goal);

  // Progress
  parts.push('');
  parts.push('## Progress');
  parts.push('### Done');
  if (data.progress.done.length > 0) {
    for (const item of data.progress.done) {
      parts.push(`- ${item}`);
    }
  } else {
    parts.push('- No completed tasks');
  }

  if (data.progress.inProgress.length > 0) {
    parts.push('');
    parts.push('### In Progress');
    for (const item of data.progress.inProgress) {
      parts.push(`- ${item}`);
    }
  }

  if (data.progress.blocked.length > 0) {
    parts.push('');
    parts.push('### Blocked');
    for (const item of data.progress.blocked) {
      parts.push(`- ${item}`);
    }
  }

  // Key Decisions
  parts.push('');
  parts.push('## Key Decisions');
  if (data.keyDecisions.length > 0) {
    for (const decision of data.keyDecisions) {
      parts.push(`- ${decision}`);
    }
  } else {
    parts.push('- No key decisions recorded');
  }

  // Next Steps
  parts.push('');
  parts.push('## Next Steps');
  if (data.nextSteps.length > 0) {
    for (let i = 0; i < data.nextSteps.length; i++) {
      parts.push(`${i + 1}. ${data.nextSteps[i]}`);
    }
  } else {
    parts.push('1. Continue with current tasks');
  }

  // Critical Context
  parts.push('');
  parts.push('## Critical Context');
  parts.push(data.criticalContext);

  // File tracking
  const fileSection = formatFileOperations(data.readFiles, data.modifiedFiles);
  if (fileSection) {
    parts.push('');
    parts.push(fileSection.trim());
  }

  return parts.join('\n');
}

/**
 * Generate a structured Pi-format summary from conversation messages.
 *
 * This function extracts Goal, Progress, Key Decisions, Next Steps, Critical Context,
 * and file operations from messages, and assembles them into the standard Pi summary format.
 *
 * Supports iterative summary generation via `previousSummary` and cumulative file tracking.
 */
export async function generateSummary(
  messages: CompactionMessage[],
  options?: {
    model?: string;
    previousSummary?: string;
    customInstructions?: string;
  },
): Promise<string> {
  // Extract structured data from messages
  const goal = extractGoal(messages);
  const progress = extractProgress(messages);
  const keyDecisions = extractKeyDecisions(messages);
  const nextSteps = extractNextSteps(messages);
  const criticalContext = extractCriticalContext(messages);
  const fileOps = extractFileOperations(messages);

  // Handle cumulative file tracking with previous summary
  let finalReadFiles = fileOps.readFiles;
  let finalModifiedFiles = fileOps.modifiedFiles;

  if (options?.previousSummary) {
    const previousFileOps = parseFileOperations(options.previousSummary);
    const merged = mergeFileTracking(
      previousFileOps,
      { readFiles: fileOps.readFiles, modifiedFiles: fileOps.modifiedFiles },
    );
    finalReadFiles = merged.readFiles;
    finalModifiedFiles = merged.modifiedFiles;
  }

  const summaryData: SummaryData = {
    goal,
    progress,
    keyDecisions,
    nextSteps,
    criticalContext,
    readFiles: finalReadFiles,
    modifiedFiles: finalModifiedFiles,
  };

  // Optionally prepend custom instructions as a header
  let result = buildSummaryMarkdown(summaryData);

  if (options?.customInstructions) {
    result = `> **Note:** ${options.customInstructions}\n\n${result}`;
  }

  return result;
}
