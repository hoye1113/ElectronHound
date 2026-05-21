# Split Turn Detection

A "split turn" occurs when a single conversation turn (user message → next user message) exceeds the `keepRecentTokens` budget, requiring a split within the turn. This document explains how split turns are detected and handled.

## Overview

Normal compaction cuts at turn boundaries. But when a single turn is too large (e.g., a multi-step agent execution with many tool calls exceeding the token budget), the system must split within the turn.

```
Normal case:                    Split turn case:
[user] Step 1 (small)           [user] Step 1
[assistant] Response            [tool] Call 1
[user] Step 2 (small)           [toolResult] R1
[assistant] Response            [tool] Call 2
                ↑ cut here      [toolResult] R2
                                [tool] Call 3       ← turn is huge
                                [toolResult] R3         ↑ cut here (mid-turn)
                                [assistant] Final
                                [user] Step 2
```

## Detection

### `isSplitTurn(messages, keepRecentTokens?)`

Detect whether the most recent turn exceeds the token budget.

```typescript
import { isSplitTurn } from '@eata/agent-core';

const isSplit = isSplitTurn(messages, 20000);
// true if the last turn's tokens > keepRecentTokens
```

### How It Works

```
1. Find the start of the last turn (last user message)
2. Calculate total tokens from turn start to end
3. Return true if turnTokens > keepRecentTokens
```

### Default Budget

```typescript
const DEFAULT_KEEP_RECENT_TOKENS = 20000;
```

## Splitting

### `splitTurnAtMessage(messages, messageIndex)`

Split a conversation at a specific message within a turn.

```typescript
import { splitTurnAtMessage } from '@eata/agent-core';

const [history, turnPrefix, turnSuffix] = splitTurnAtMessage(messages, cutIndex);
```

**Returns:** Tuple of `[history, turnPrefix, turnSuffix]`

| Part | Description |
|------|-------------|
| `history` | All completed turns before the current turn |
| `turnPrefix` | Messages from turn start up to (not including) `messageIndex` |
| `turnSuffix` | Messages from `messageIndex` onward |

### Example

```typescript
const messages = [
  { role: 'user', content: 'Step 1' },            // 0
  { role: 'assistant', content: 'Response 1' },     // 1
  { role: 'user', content: 'Step 2' },            // 2 ← turn starts here
  { role: 'tool', content: 'Call 1' },             // 3
  { role: 'toolResult', content: 'R1' },           // 4
  { role: 'tool', content: 'Call 2' },             // 5 ← split point
  { role: 'toolResult', content: 'R2' },           // 6
  { role: 'assistant', content: 'Final' },          // 7
];

const [history, turnPrefix, turnSuffix] = splitTurnAtMessage(messages, 5);

// history = [msg0, msg1]  (previous turn)
// turnPrefix = [msg2, msg3, msg4]  (Step 2 + Call 1 + R1)
// turnSuffix = [msg5, msg6, msg7]  (Call 2 + R2 + Final)
```

### Edge Cases

- **Empty messages or index ≤ 0**: Returns `[[], [], messages]`
- **Split at a user message**: Split is at turn boundary, so `turnPrefix` is empty
- **Clamped index**: Index is clamped to `messages.length`

## Merging Summaries

### `mergeSummaries(historySummary, turnPrefixSummary)`

Merge a history summary and a turn prefix summary into a single summary for split turn scenarios.

```typescript
import { mergeSummaries } from '@eata/agent-core';

const merged = mergeSummaries(
  'History summary content...',
  'Turn prefix summary content...'
);
```

### Output Format

When both summaries are non-empty:
```
## History Summary
{historySummary}

## Current Turn Summary
{turnPrefixSummary}
```

When only history summary exists:
```
## History Summary
{historySummary}
```

When only turn prefix summary exists:
```
## Current Turn Summary
{turnPrefixSummary}
```

When both are empty: returns `''`.

## Complete Workflow

```typescript
import {
  isSplitTurn,
  splitTurnAtMessage,
  mergeSummaries,
  findCutPoint,
  generateSummary
} from '@eata/agent-core';

async function handleCompaction(messages, keepRecentTokens = 20000) {
  // 1. Find the cut point
  const cut = findCutPoint(messages, { keepRecentTokens });
  
  if (cut.messagesToSummarize.length === 0) {
    return messages; // Nothing to compact
  }
  
  let summary: string;
  
  if (cut.isSplitTurn) {
    // 2. Split turn handling
    const [history, turnPrefix, _turnSuffix] = 
      splitTurnAtMessage(messages, cut.cutIndex);
    
    // 3. Generate two summaries
    const historySummary = await generateSummary(history);
    const turnPrefixSummary = await generateSummary(turnPrefix);
    
    // 4. Merge them
    summary = mergeSummaries(historySummary, turnPrefixSummary);
  } else {
    // Normal compaction
    summary = await generateSummary(cut.messagesToSummarize);
  }
  
  // 5. Inject summary + keep recent messages
  const summaryMessage = {
    id: `compaction-${Date.now()}`,
    role: 'user',
    content: summary,
    messageType: 'compaction'
  };
  
  return [summaryMessage, ...cut.messagesToKeep];
}
```

## Decision Tree

```
                    Messages need compaction?
                           │
                    ┌──────┴──────┐
                    │             │
                   No            Yes
                    │             │
              Keep as-is    Find cut point
                                  │
                           ┌──────┴──────┐
                           │             │
                     At turn          Split turn
                     boundary         (isSplitTurn)
                           │             │
                      Single         Split at
                      summary        messageIndex
                                         │
                                   ┌─────┴─────┐
                                   │           │
                              History    Turn Prefix
                              Summary     Summary
                                   │           │
                                   └─────┬─────┘
                                        │
                                   Merge into
                                   single summary
```

## Relationship to Cut Point

Split turn detection is a consequence of the cut point algorithm. When `findCutPoint()` returns `isSplitTurn: true`, it means no valid turn-boundary cut point was found within the token budget, so the system must split within a turn.

The `splitTurnAtMessage()` function is used to separate the conversation into:
- **History** (previous turns) → generate first summary
- **Turn prefix** (beginning of oversized turn) → generate second summary
- **Turn suffix** (rest of oversized turn + recent messages) → keep as-is

See [cut-point.md](cut-point.md) for the full cut point algorithm.
