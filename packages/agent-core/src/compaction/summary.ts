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
