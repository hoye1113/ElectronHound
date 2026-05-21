/**
 * EATA Compaction - Type Definitions
 *
 * Shared types for the compaction module including
 * branch summary result and entry interfaces.
 */

/**
 * Result returned by BranchSummarization.summarizeBranch().
 * Contains the generated summary, tracked files, and metadata.
 */
export interface BranchSummaryResult {
  /** Name of the summarized branch */
  branchName: string;
  /** Generated markdown summary */
  summary: string;
  /** Files read during the branch (cumulative) */
  readFiles: string[];
  /** Files modified during the branch (cumulative) */
  modifiedFiles: string[];
  /** Estimated token count of the summary */
  tokenCount: number;
  /** ISO timestamp of when the summary was generated */
  timestamp: string;
}

/**
 * Entry type for branch summary storage.
 * Used to persist branch summaries across compaction cycles.
 * Supports cumulative file tracking via readFiles/modifiedFiles arrays.
 */
export interface BranchSummaryEntry {
  /** Discriminator field */
  entryType: 'branch_summary';
  /** Name of the branch this summary belongs to */
  branchName: string;
  /** The generated markdown summary */
  summary: string;
  /** Cumulative list of files read across all compactions */
  readFiles: string[];
  /** Cumulative list of files modified across all compactions */
  modifiedFiles: string[];
  /** Estimated token count of the summary */
  tokenCount: number;
  /** ISO timestamp of when the entry was created/updated */
  timestamp: string;
  /** Optional additional details (e.g., compaction count, last branch navigated from) */
  details?: Record<string, unknown>;
}

/**
 * Result of processing a tool result through the truncation pipeline.
 * Preserves the original token count and whether truncation was applied.
 */
export interface ToolResult {
  /** The (possibly truncated) text content */
  text: string;
  /** Estimated token count of the result text */
  tokenCount: number;
  /** Whether the result was truncated from the original */
  truncated: boolean;
}

/**
 * Breakdown of token counts by message role.
 */
export interface TokenCountBreakdown {
  /** Tokens from system messages */
  system: number;
  /** Tokens from user messages */
  user: number;
  /** Tokens from assistant messages */
  assistant: number;
  /** Tokens from tool/toolResult messages */
  tool: number;
}

/**
 * Result of counting tokens across a set of messages.
 * Provides total count and per-role breakdown.
 */
export interface TokenCount {
  /** Total token count across all messages */
  total: number;
  /** Breakdown by message role */
  breakdown: TokenCountBreakdown;
}

/**
 * Entry details for compaction file tracking.
 * Stores cumulative file operations across multiple compaction cycles.
 * Used by FileTracker to persist read/modified file lists.
 */
export interface CompactionEntryDetails {
  /** Discriminator field identifying this as a compaction entry */
  entryType: 'compaction';
  /** Cumulative list of files read across all compactions */
  readFiles: string[];
  /** Cumulative list of files modified across all compactions */
  modifiedFiles: string[];
  /** Estimated token count at the time of this entry */
  tokenCount: number;
  /** ISO timestamp of when the entry was created/updated */
  timestamp: string;
}
