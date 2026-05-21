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
