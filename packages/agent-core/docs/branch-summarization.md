# Branch Summarization

Branch summarization preserves context when navigating between conversation branches via `/tree`. When a user switches from one branch to another, the system generates a summary of the current branch and injects it into the target branch's conversation, ensuring continuity.

## Overview

Branch summarization comes in two flavors:

1. **Function-based** (`branch-summary.ts`) — Simple, stateless branch summaries
2. **Class-based** (`branchSummarization.ts`) — Cumulative file tracking, multi-branch support

## When to Summarize

The `shouldGenerateBranchSummary()` function determines if a summary is needed:

```typescript
import { shouldGenerateBranchSummary } from '@eata/agent-core';

const needSummary = shouldGenerateBranchSummary(
  'main',        // current branch
  'feature-A',   // target branch
  messages       // conversation messages
);
```

### Decision Logic

```
1. Branch switch (currentBranch !== targetBranch) → ALWAYS true
2. Empty message history → false
3. Token estimate > 500 → true (substantial content)
4. Messages contain key information → true
5. Otherwise → false
```

### Key Information Detection

The system scans for 4 categories of key information (case-insensitive):

| Category | Keywords |
|----------|----------|
| Decisions | decided, because, chose, selected, opted |
| Problems/Solutions | problem, solution, fixed, resolved, issue |
| Unfinished Tasks | TODO, FIXME, pending, outstanding, incomplete |
| Next Steps | next, then, later, after, finally |

## Function-Based API

### `generateBranchSummary(messages, branchName, options?)`

Generate a markdown summary from branch messages.

```typescript
import { generateBranchSummary } from '@eata/agent-core';

const summary = generateBranchSummary(
  messages,
  'feature-A',
  { model: 'gpt-4o-mini', temperature: 0.2 }
);
```

**Returns:** Markdown string with these sections:

```markdown
# feature-A Branch Summary

## Key Decisions
- Decided to use CDP instead of MCP for direct browser control

## File Operations
<read-files>
- src/graph.ts
- src/state.ts
</read-files>

<modified-files>
- src/tools/cdp.ts
</modified-files>

## Problems & Solutions
- Problem: CDP connection timing out → Solution: Added retry logic

## Unfinished Tasks
- TODO: Add keyboard shortcut support

## Next Steps
- Then implement browser_navigate tool
```

### `injectBranchSummary(targetBranch, summary)`

Inject a branch summary as a system message into the conversation.

```typescript
import { injectBranchSummary } from '@eata/agent-core';

const injected = injectBranchSummary('main', summaryContent);
// Returns: [{ role: 'system', content: '...', messageType: 'branch_summary' }]
```

## Class-Based API

The `BranchSummarization` class adds cumulative file tracking and multi-branch management.

### Constructor

```typescript
import { BranchSummarization, ToolRegistry } from '@eata/agent-core';

const summarizer = new BranchSummarization(toolRegistry);
```

### `summarizeBranch(branchName, messages)`

Summarize a branch with cumulative file tracking.

```typescript
const result = await summarizer.summarizeBranch('feature-A', messages);

console.log(result.branchName);    // 'feature-A'
console.log(result.summary);       // Markdown summary
console.log(result.readFiles);     // Cumulative read files
console.log(result.modifiedFiles); // Cumulative modified files
console.log(result.tokenCount);    // Estimated token count
console.log(result.timestamp);     // ISO timestamp
```

**Key feature:** Cumulative tracking. Each call merges with the previous summary's file lists:

```
Call 1: readFiles=[a.ts, b.ts], modifiedFiles=[c.ts]
Call 2: readFiles=[d.ts], modifiedFiles=[e.ts]
Result: readFiles=[a.ts, b.ts, d.ts], modifiedFiles=[c.ts, e.ts]
```

Modified files always take priority — if a file was previously read and later modified, it moves from `readFiles` to `modifiedFiles`.

### `navigateBranch(currentBranch, targetBranch, messages)`

Main entry point for `/tree` navigation. This method:

1. Summarizes the current branch (if needed)
2. Injects the target branch's summary (if available)
3. Returns messages with branch context

```typescript
const context = await summarizer.navigateBranch('feature-A', 'main', messages);
// context = [system message with main branch summary]
// or [] if no target summary exists yet
```

### `injectBranchSummary(targetBranch, summary)`

Inject a summary into the conversation for the target branch.

```typescript
const injected = await summarizer.injectBranchSummary(
  'main',
  'Previous context from main branch...'
);
```

### Management Methods

```typescript
// Get stored summary for a branch
const entry = summarizer.getBranchSummary('feature-A');

// Check if a branch has a summary
summarizer.hasSummary('main'); // true/false

// List all branches with summaries
const branches = summarizer.listBranches(); // ['main', 'feature-A']

// Clear all stored summaries
summarizer.clearSummaries();
```

## BranchSummaryEntry

The storage format for branch summaries:

```typescript
interface BranchSummaryEntry {
  entryType: 'branch_summary';
  branchName: string;
  summary: string;
  readFiles: string[];        // Cumulative
  modifiedFiles: string[];    // Cumulative
  tokenCount: number;
  timestamp: string;          // ISO 8601
  details?: Record<string, unknown>;
}
```

## Complete Example

```typescript
import {
  BranchSummarization,
  ToolRegistry,
  shouldGenerateBranchSummary,
  generateBranchSummary,
  injectBranchSummary
} from '@eata/agent-core';

// ── Function-based workflow ──

function handleBranchNavigation(
  currentBranch: string,
  targetBranch: string,
  messages: any[]
) {
  if (shouldGenerateBranchSummary(currentBranch, targetBranch, messages)) {
    // Generate summary for current branch
    const summary = generateBranchSummary(messages, currentBranch);
    
    // Inject into target branch
    const injected = injectBranchSummary(targetBranch, summary);
    return injected;
  }
  return [];
}

// ── Class-based workflow ──

async function advancedBranchNavigation() {
  const registry = new ToolRegistry();
  const summarizer = new BranchSummarization(registry);
  
  // Summarize a long-running branch
  const result = await summarizer.summarizeBranch('feature-A', longMessages);
  console.log('Summary length:', result.tokenCount, 'tokens');
  console.log('Files read:', result.readFiles.length);
  console.log('Files modified:', result.modifiedFiles.length);
  
  // Navigate from feature-A to main
  const context = await summarizer.navigateBranch(
    'feature-A',  // leaving
    'main',       // entering
    longMessages
  );
  
  // The context contains a system message with the main branch's
  // previous summary (if it exists), so the agent knows what was
  // happening on the main branch.
  
  if (context.length > 0) {
    console.log('Injected context from main branch');
    // Append context to the conversation
  }
  
  // List all tracked branches
  console.log('Tracked branches:', summarizer.listBranches());
}
```
