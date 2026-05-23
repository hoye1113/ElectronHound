# Task 13: Branch Summarization - Decisions

## Architecture Decision: Class-based over Function-based

The existing `branch-summary.ts` already had function-based utilities (`shouldGenerateBranchSummary`, `generateBranchSummary`, `injectBranchSummary`). 

For Task 13, the spec required a **class-based** `BranchSummarization` with:
- Persistent state (Map of branch summaries)
- Cumulative file tracking across compactions
- Constructor accepting `ToolRegistry` dependency

Decision: Create a new `BranchSummarization` class in `branchSummarization.ts` (camelCase, per spec), keeping the existing `branch-summary.ts` (kebab-case) untouched. Both can coexist—the class-based approach is for the new `/tree` navigation system with cumulative tracking, while the function-based utilities are for simpler one-off cases.

## ToolRegistry in Constructor

The spec requires `ToolRegistry` in the constructor even though it's not actively used in the current implementation. Stored for future LLM integration (e.g., async summary generation via LLM tools). Marked as `private readonly`.

## Cumulative Tracking Strategy

Files tracked in `BranchSummaryEntry.readFiles` and `BranchSummaryEntry.modifiedFiles` arrays. On each `summarizeBranch()` call:
1. Extract new files from current messages
2. Merge with previous entry's files (if any)
3. Remove read files that were later modified
4. Sort both arrays for consistency

## /tree Navigation Entry Point

`navigateBranch()` is the main entry point for branch switching. It:
1. Checks `shouldGenerateSummary()` (private)
2. If true → `summarizeBranch()` current branch
3. If target branch has stored summary → `injectBranchSummary()` and return
4. Else → return empty array (no context to inject)
