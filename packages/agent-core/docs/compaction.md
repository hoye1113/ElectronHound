# Compaction System

The compaction system manages long conversations by automatically summarizing context when the token count approaches the context window limit. Based on the Pi compaction architecture, it preserves critical information while reducing context size.

## Overview

When an agent session exceeds the configured token threshold, the compaction system:
1. **Detects** the threshold breach via `CompactionTrigger`
2. **Identifies** valid cut points in the conversation
3. **Handles** split turns (oversized single turns)
4. **Generates** structured summaries with file tracking
5. **Injects** the summary back into the conversation

## Architecture

```
src/compaction/
├── index.ts              # Public exports
├── types.ts              # Shared types (BranchSummaryResult, etc.)
├── trigger.ts            # Token threshold detection
├── cut-point.ts          # Where to cut conversations
├── splitTurn.ts          # Oversized turn detection
├── summary.ts            # Structured Pi-format summary generation
├── branch-summary.ts     # Function-based branch summaries
├── branchSummarization.ts# Class-based branch summaries with cumulative tracking
└── fileTracker.ts        # Cumulative file operation tracking
```

## Trigger Logic

The trigger determines when compaction should occur.

```typescript
import { shouldTriggerCompaction, createCompactionTrigger } from '@eata/agent-core';

// Simple check
const shouldCompact = shouldTriggerCompaction(
  contextTokens: 120000,
  contextWindow: 128000,
  reserveTokens: 16384
);

// Advanced trigger with percentage threshold
const trigger = createCompactionTrigger({
  contextWindow: 128000,
  thresholdPercentage: 0.8,  // Trigger at 80% usage
  enabled: true
});

const result = trigger.shouldTrigger(currentTokens);
console.log(result.usagePercentage);  // 0.85
console.log(result.shouldTrigger);    // true
console.log(result.remainingTokens);  // negative when over threshold
```

### Trigger Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `contextWindow` | 128000 | Total context window size (tokens) |
| `reserveTokens` | 16384 | Tokens reserved for LLM response |
| `thresholdPercentage` | — | Alternative: trigger at X% of window |
| `enabled` | true | Enable/disable auto-compaction |

### Trigger Result

```typescript
interface TriggerResult {
  shouldTrigger: boolean;    // Whether to compact
  contextTokens: number;     // Current token count
  threshold: number;         // Threshold that triggers compaction
  remainingTokens: number;   // Tokens before threshold (negative when over)
  usagePercentage: number;   // Usage ratio (0-1)
}
```

## Cut Point Rules

Cut points determine where the conversation is split for summarization. See [cut-point.md](cut-point.md) for detailed rules.

### Valid Cut Points
- **User messages** — Turn boundaries (preferred)
- **Assistant messages** — General content
- **Custom messages** — `messageType` field set (branch summaries, etc.)

### Invalid Cut Points
- **Tool results** — Must stay with their tool call
- **System messages** — Should not be compacted away

### Algorithm

```
1. Walk backwards from newest message
2. Accumulate tokens until keepRecentTokens is reached
3. Find nearest valid cut point (prefer turn boundaries)
4. Handle split turns if found
5. Split conversation into [toSummarize] and [toKeep]
```

```typescript
import { findCutPoint } from '@eata/agent-core';

const result = findCutPoint(messages, {
  keepRecentTokens: 20000,
  minMessagesToKeep: 4,
});

// result.messagesToSummarize → messages to compact
// result.messagesToKeep      → recent messages to preserve
// result.isSplitTurn          → whether cut lands mid-turn
```

## Split Turn Detection

When a single turn exceeds the `keepRecentTokens` budget, it's a "split turn." The system:

1. Splits the turn at the cut point
2. Generates two summaries:
   - `historySummary` — all turns before the current one
   - `turnPrefixSummary` — the prefix of the oversized turn
3. Merges them into a single summary

See [split-turn.md](split-turn.md) for details.

```typescript
import { isSplitTurn, splitTurnAtMessage, mergeSummaries } from '@eata/agent-core';

if (isSplitTurn(messages, keepRecentTokens)) {
  const [history, turnPrefix, turnSuffix] = splitTurnAtMessage(messages, cutIndex);
  
  const historySummary = await generateSummary(history);
  const turnPrefixSummary = await generateSummary(turnPrefix);
  
  const merged = mergeSummaries(historySummary, turnPrefixSummary);
}
```

## Summary Generation

Summaries follow the **Pi format** with structured sections for Goal, Progress, Key Decisions, Next Steps, Critical Context, and File Tracking.

See [summary-generation.md](summary-generation.md) for the full specification.

### Pi Summary Format

```markdown
## Goal
[What the user is trying to accomplish]

## Progress
### Done
- [x] Completed tasks

### In Progress
- [ ] Current work

### Blocked
- [Issues, if any]

## Key Decisions
- **Decision**: Rationale

## Next Steps
1. What should happen next

## Critical Context
- [Data needed to continue]

<read-files>
path/to/file1.ts
</read-files>

<modified-files>
path/to/changed.ts
</modified-files>
```

### Generation Function

```typescript
import { generateSummary } from '@eata/agent-core';

const summary = await generateSummary(messages, {
  previousSummary: existingSummary,
  customInstructions: 'Focus on Electron integration context'
});
```

The function extracts:
- **Goal** — from first user message, goal/objective/task patterns
- **Progress** — done/in-progress/blocked from task lists and status words
- **Key Decisions** — lines containing decision keywords
- **Next Steps** — TODO, next, then, remaining patterns
- **Critical Context** — important, critical, warning, remember patterns
- **File Operations** — from toolCall blocks (read, write, edit)

### Cumulative File Tracking

When a `previousSummary` is provided, file operations are merged:

```typescript
// Previous summary had: read a.ts, modified b.ts
// New messages: read c.ts, modified d.ts
// Result: readFiles=[a.ts, c.ts], modifiedFiles=[b.ts, d.ts]
// But if d.ts was previously read, it moves to modifiedFiles
```

## Branch Summarization

When navigating between branches via `/tree`, the system preserves context. See [branch-summarization.md](branch-summarization.md) for details.

### Function-based API

```typescript
import { shouldGenerateBranchSummary, generateBranchSummary } from '@eata/agent-core';

if (shouldGenerateBranchSummary('main', 'feature-A', messages)) {
  const summary = generateBranchSummary(messages, 'feature-A');
}
```

### Class-based API (with cumulative tracking)

```typescript
import { BranchSummarization, ToolRegistry } from '@eata/agent-core';

const summarizer = new BranchSummarization(toolRegistry);
const result = await summarizer.summarizeBranch('feature-A', messages);
// result includes cumulative readFiles/modifiedFiles

// Navigate from current branch to target
const context = await summarizer.navigateBranch('feature-A', 'main', messages);
```

## File Tracking

`FileTracker` tracks cumulative read/modified files across compaction cycles. See [file-tracking.md](file-tracking.md) for details.

```typescript
import { FileTracker } from '@eata/agent-core';

const tracker = FileTracker.fromMessages(messages);
tracker.trackFile('src/new-file.ts', 'modified');
const details = tracker.merge(previousEntries);
```

## Complete Example

```typescript
import {
  shouldTriggerCompaction,
  findCutPoint,
  isSplitTurn,
  splitTurnAtMessage,
  mergeSummaries,
  generateSummary,
  FileTracker
} from '@eata/agent-core';

async function compactIfNeeded(messages, contextWindow = 128000) {
  // Step 1: Check if compaction is needed
  const tokenCount = messages.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
  if (!shouldTriggerCompaction(tokenCount, contextWindow)) {
    return messages;
  }

  // Step 2: Find cut point
  const cut = findCutPoint(messages, {
    keepRecentTokens: 20000,
    minMessagesToKeep: 4
  });

  if (cut.messagesToSummarize.length === 0) return messages;

  // Step 3: Handle split turns
  let summary: string;
  if (cut.isSplitTurn) {
    const [history, turnPrefix, turnSuffix] = splitTurnAtMessage(
      messages, cut.cutIndex
    );
    const historySummary = await generateSummary(history);
    const turnPrefixSummary = await generateSummary(turnPrefix);
    summary = mergeSummaries(historySummary, turnPrefixSummary);
  } else {
    summary = await generateSummary(cut.messagesToSummarize);
  }

  // Step 4: Track file operations
  const tracker = FileTracker.fromMessages(cut.messagesToSummarize);
  const fileDetails = tracker.merge([]);

  // Step 5: Inject summary
  const summaryMessage = {
    id: `compaction-${Date.now()}`,
    role: 'user' as const,
    content: summary,
    messageType: 'compaction'
  };

  return [summaryMessage, ...cut.messagesToKeep];
}
```

## Configuration Defaults

```typescript
const COMPACTION_DEFAULTS = {
  contextWindow: 128000,      // GPT-4o context window
  reserveTokens: 16384,       // Reserved for response
  keepRecentTokens: 20000,    // Recent context to preserve
  thresholdPercentage: 0.8,   // 80% of window triggers compact
  toolResultMaxChars: 2000,   // Max chars per tool result in summary
} as const;
```
