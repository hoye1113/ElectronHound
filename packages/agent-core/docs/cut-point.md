# Cut Point Rules

Cut points determine where a conversation is split for compaction. The algorithm must find valid split locations that preserve conversation coherence, especially tool call/result pairs.

## Overview

A cut point splits the conversation into two parts:
- **Before the cut**: Messages to be summarized (compressed)
- **After the cut**: Messages to be kept (preserved)

The choice of cut point affects summary quality. Cutting at natural boundaries (user message starts) produces better summaries than cutting mid-turn.

## Valid Cut Points

### Allowed

```
┌────────────────────────────────────┐
│ VALID                              │
│                                    │
│ ✓ User messages (turn boundaries)  │
│ ✓ Assistant messages                │
│ ✓ Custom messages (messageType set) │
│   (branch_summary, BashExecution)   │
└────────────────────────────────────┘
```

**User messages** are preferred because they mark turn boundaries — the start of a new user request and its assistant response.

### Forbidden

```
┌────────────────────────────────────┐
│ INVALID                            │
│                                    │
│ ✗ Tool results (toolResult role)    │
│ ✗ Tool calls (tool role)            │
│ ✗ System messages                   │
└────────────────────────────────────┘
```

Tool results MUST stay with their tool call. Cutting between a tool call and its result would lose the execution context.

### `isValidCutPoint(message)`

```typescript
import { isValidCutPoint } from '@eata/agent-core';

isValidCutPoint({ role: 'user', content: 'Hello' });       // true
isValidCutPoint({ role: 'assistant', content: '...' });     // true
isValidCutPoint({ role: 'system', content: '...' });        // false
isValidCutPoint({ role: 'toolResult', content: '...' });    // false
isValidCutPoint({ role: 'tool', content: '...' });         // false
isValidCutPoint({ role: 'user', content: '...', messageType: 'branch_summary' }); // true
```

## Helper Functions

### `isToolResult(message)`

Check if a message is a tool result. Tool results must never be cut.

```typescript
import { isToolResult } from '@eata/agent-core';

isToolResult({ role: 'toolResult', content: '...' }); // true
isToolResult({ role: 'user', content: '...' });       // false
```

### `isToolCall(message)`

Check if a message is a tool call. Tool calls should not be cut either.

```typescript
import { isToolCall } from '@eata/agent-core';

isToolCall({ role: 'tool', content: '...' });  // true
isToolCall({ role: 'user', content: '...' });  // false
```

### `isTurnBoundary(message)`

Check if a message is a user message (turn boundary).

```typescript
import { isTurnBoundary } from '@eata/agent-core';

isTurnBoundary({ role: 'user', content: '...' });     // true
isTurnBoundary({ role: 'assistant', content: '...' }); // false
```

## Finding Cut Points

### `findCutPoint(messages, config?)`

The main cut point finder. Algorithm:

```
1. Walk backwards from newest message, accumulating tokens
2. Stop when keepRecentTokens is reached
3. Look backwards from initial cut for:
   a. Best: Turn boundary (user message) that is valid
   b. Acceptable: Any valid cut point
4. Return split with messagesToSummarize and messagesToKeep
5. Detect if result is a split turn
```

### Configuration

```typescript
const DEFAULT_CUT_POINT_CONFIG = {
  keepRecentTokens: 20000,   // Tokens to preserve from recent messages
  minMessagesToKeep: 4,       // Minimum messages that must remain
};
```

### Usage

```typescript
import { findCutPoint } from '@eata/agent-core';

// Messages with token counts
const messages: MessageWithTokens[] = [
  { role: 'user', content: 'Step 1', tokenCount: 50 },
  { role: 'assistant', content: 'Response 1', tokenCount: 200 },
  { role: 'user', content: 'Step 2', tokenCount: 60 },
  // ... many more messages ...
  { role: 'user', content: 'Step 10', tokenCount: 80 },
  { role: 'assistant', content: 'Response 10', tokenCount: 15000 },
];

const result = findCutPoint(messages, {
  keepRecentTokens: 20000,
  minMessagesToKeep: 4,
});

console.log(result.cutIndex);               // Index where the cut occurs
console.log(result.messagesToSummarize.length); // Messages to compact
console.log(result.messagesToKeep.length);      // Messages to preserve
console.log(result.isSplitTurn);            // Whether cut is mid-turn
```

### Result Format

```typescript
interface CutPointResult {
  cutIndex: number;              // Index of first message to keep
  messagesToSummarize: Message[]; // Messages before the cut
  messagesToKeep: Message[];      // Messages after the cut
  isSplitTurn: boolean;           // Whether cut falls mid-turn
  turnPrefixMessages?: Message[]; // Prefix messages when isSplitTurn
  firstKeptMessageId?: string;    // ID of first kept message
}
```

## Turn-Based Grouping

### `getTurnMessages(messages, startIndex)`

Get all messages belonging to the same turn. A turn starts with a user message and includes all subsequent messages until the next user message.

```typescript
import { getTurnMessages } from '@eata/agent-core';

const { messages: turn, endIndex } = getTurnMessages(messages, 0);
// turn = [user msg, assistant msgs, tool calls/results...]
// endIndex = last message index in this turn
```

### `groupByTurns(messages)`

Group all messages by turns.

```typescript
import { groupByTurns } from '@eata/agent-core';

const turns = groupByTurns(messages);
// [
//   [user1, assistant1, toolCall1, toolResult1],
//   [user2, assistant2],
//   [user3, assistant3, toolCall2, toolResult2]
// ]
```

## Split Turn Handling

When `findCutPoint()` returns `isSplitTurn: true`, it means the cut falls within a single turn that exceeds the `keepRecentTokens` budget.

### Scenario

```
[user] Step 1 (50 tokens)
[assistant] Response (15000 tokens)  ← cut lands HERE
[tool] Call 1 (200 tokens)
[toolResult] Result 1 (300 tokens)
[tool] Call 2 (200 tokens)
[toolResult] Result 2 (300 tokens)
[user] Step 2 (60 tokens)        ← next turn
```

If `keepRecentTokens = 500`, the cut must fall within the oversized turn, triggering split turn handling. See [split-turn.md](split-turn.md) for how this is handled.

## Complete Example

```typescript
import { findCutPoint, isValidCutPoint, isTurnBoundary, groupByTurns } from '@eata/agent-core';

// Build a message array with token counts
const messages = [];
for (let i = 0; i < 20; i++) {
  messages.push({
    id: `msg-${i}`,
    role: i % 3 === 0 ? 'user' : i % 3 === 1 ? 'assistant' : 'toolResult',
    content: `Message ${i} content`,
    tokenCount: 500
  });
}

// Find cut point
const result = findCutPoint(messages, {
  keepRecentTokens: 3000,
  minMessagesToKeep: 6
});

// Check what's happening
console.log('Cut at index:', result.cutIndex);
console.log('To summarize:', result.messagesToSummarize.length, 'messages');
console.log('To keep:', result.messagesToKeep.length, 'messages');
console.log('Split turn:', result.isSplitTurn);

// All cut points are valid
for (const msg of result.messagesToKeep) {
  console.assert(isValidCutPoint(msg), `Invalid cut point at ${msg.id}`);
}

// Prefer turn boundaries
for (const msg of result.messagesToKeep) {
  if (msg.role === 'user') {
    console.log('Cut at turn boundary:', msg.id);
  }
}

// Group the messages to keep by turns
const keptTurns = groupByTurns(result.messagesToKeep);
console.log('Kept turns:', keptTurns.length);
```
