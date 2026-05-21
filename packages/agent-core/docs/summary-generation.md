# Summary Generation

Summary generation creates structured summaries of conversation history for compaction. The system extracts Goal, Progress, Key Decisions, Next Steps, Critical Context, and File Operations from messages, assembling them into the standard **Pi summary format**.

## Overview

The summary generation system has two layers:

1. **Extraction functions** — Pull structured data from messages via pattern matching
2. **Assembly functions** — Build the final markdown from extracted data

All summaries follow the Pi format for consistency across compaction cycles.

## Pi Summary Format

```markdown
## Goal
[What the user is trying to accomplish]

## Progress
### Done
- [x] Completed tasks
- Created file tracking system

### In Progress
- [ ] Implementing split turn detection

### Blocked
- Need to resolve CDP connection timeout

## Key Decisions
- Used CDP instead of MCP because of lower latency
- Chose Zod for schema validation

## Next Steps
1. Implement browser_navigate tool
2. Add error handling for CDP disconnection

## Critical Context
- CDP port 9222 must be specified in launch args
- Tool results are limited to 2000 chars in summaries

<read-files>
src/graph.ts
src/state.ts
</read-files>

<modified-files>
src/tools/cdp.ts
src/compaction/summary.ts
</modified-files>
```

## Extraction Functions

### `extractGoal(messages)`

Extract the user's primary goal from conversation messages.

```typescript
import { extractGoal } from '@eata/agent-core';

const goal = extractGoal(messages);
// "Implement a CDP browser_snapshot tool"
```

**Pattern matching priority:**
1. First user message with explicit patterns: `goal:`, `objective:`, `task:`, `implement ...`, `create ...`, `build ...`, `add ...`, `fix ...`
2. Fallback: First user message content (truncated to 200 chars)

### `extractProgress(messages)`

Extract progress from messages: Done, In Progress, and Blocked items.

```typescript
import { extractProgress } from '@eata/agent-core';

const progress = extractProgress(messages);
// {
//   done: ['Created CDPClient class', 'Fixed WebSocket connection'],
//   inProgress: ['Working on browser_snapshot tool'],
//   blocked: ['Blocked: Need Electron main process access']
// }
```

**Pattern matching:**

| Category | Patterns |
|----------|----------|
| **Done** | `done`, `completed`, `finished`, `[x]`, ... |
| **In Progress** | `working on`, `in progress`, `currently`, `[ ]`, ... |
| **Blocked** | `blocked`, `blocker`, `stuck`, `waiting for`, `error:`, ... |

### `extractKeyDecisions(messages)`

Extract key decisions made during the session.

```typescript
import { extractKeyDecisions } from '@eata/agent-core';

const decisions = extractKeyDecisions(messages);
// [
//   'Decided to use CDP instead of Playwright API',
//   'Chose Zod for parameter validation',
//   'Switched to WebSocket for lower latency'
// ]
```

**Keywords:** `decided`, `decision`, `chose`, `chosen`, `going with`, `pick`, `switched to`, ...

### `extractNextSteps(messages)`

Extract recommended next steps.

```typescript
import { extractNextSteps } from '@eata/agent-core';

const steps = extractNextSteps(messages);
// [
//   'Implement browser_navigate tool',
//   'Add error handling for CDP disconnection',
//   'Write integration tests'
// ]
```

**Patterns:** `next:`, `then:`, `TODO:`, `remaining:`, `needs to be ...`

### `extractCriticalContext(messages)`

Extract critical context needed to continue the task.

```typescript
import { extractCriticalContext } from '@eata/agent-core';

const context = extractCriticalContext(messages);
// - Important: CDP port must be 9222
// - Warning: Don't forget to disconnect on abort
```

**Keywords:** `important`, `critical`, `note:`, `remember:`, `warning:`, `don't forget ...`

### `extractFileOperations(messages)`

Extract file operations (read and modified) from tool calls.

```typescript
import { extractFileOperations } from '@eata/agent-core';

const fileOps = extractFileOperations(messages);
// {
//   readFiles: ['src/graph.ts', 'src/state.ts'],
//   modifiedFiles: ['src/tools/cdp.ts']
// }
```

### `createFileOps()` / `extractFileOpsFromMessage()`

Lower-level file tracking for summary generation:

```typescript
import { createFileOps, extractFileOpsFromMessage, computeFileLists } from '@eata/agent-core';

const fileOps = createFileOps();
// { read: Set, written: Set, edited: Set }

for (const msg of messages) {
  extractFileOpsFromMessage(msg, fileOps);
}

const { readFiles, modifiedFiles } = computeFileLists(fileOps);
```

## Assembly Functions

### `buildSummaryMarkdown(data)`

Build the Pi-format summary from structured data.

```typescript
import { buildSummaryMarkdown } from '@eata/agent-core';

const summary = buildSummaryMarkdown({
  goal: 'Implement CDP browser_snapshot tool',
  progress: {
    done: ['Created CDPClient class', 'Fixed WebSocket'],
    inProgress: ['Implementing snapshot tool'],
    blocked: []
  },
  keyDecisions: ['Used CDP instead of Playwright API'],
  nextSteps: ['Add navigate tool', 'Write tests'],
  criticalContext: '- CDP port 9222',
  readFiles: ['src/graph.ts'],
  modifiedFiles: ['src/tools/cdp.ts']
});
```

### `generateSummary(messages, options?)`

The main summary generation function. Extracts all data from messages and builds the final markdown.

```typescript
import { generateSummary } from '@eata/agent-core';

const summary = await generateSummary(messages, {
  previousSummary: existingSummary,
  customInstructions: 'Focus on Electron integration context',
  model: 'gpt-4o-mini'
});
```

### Options

| Option | Description |
|--------|-------------|
| `model` | LLM model to use (reserved for future LLM integration) |
| `previousSummary` | Previous summary to iterate on (merges file tracking) |
| `customInstructions` | Custom instructions prepended as a note |

### Cumulative File Tracking

When `previousSummary` is provided, file operations are merged:

```typescript
// Previous summary contains:
// <read-files>
// src/old-a.ts
// </read-files>
// <modified-files>
// src/old-b.ts
// </modified-files>

// New messages: read src/new-c.ts, modified src/new-d.ts

// Result:
// readFiles: ['src/old-a.ts', 'src/new-c.ts']
// modifiedFiles: ['src/old-b.ts', 'src/new-d.ts']
```

### `parseFileOperations(summary)`

Parse file operations from an existing summary text (for cumulative tracking).

```typescript
import { parseFileOperations } from '@eata/agent-core';

const fileOps = parseFileOperations(existingSummary);
// { readFiles: ['a.ts'], modifiedFiles: ['b.ts'] }
```

### `formatFileOperations(readFiles, modifiedFiles)`

Format file lists as XML tags for summary output.

```typescript
import { formatFileOperations } from '@eata/agent-core';

const section = formatFileOperations(
  ['src/a.ts', 'src/b.ts'],
  ['src/c.ts']
);
// "\n\n<read-files>
//  src/a.ts
//  src/b.ts
//  </read-files>
//  
//  <modified-files>
//  src/c.ts
//  </modified-files>"
```

### `mergeFileTracking(...trackings)`

Merge multiple file tracking objects into one.

```typescript
import { mergeFileTracking } from '@eata/agent-core';

const merged = mergeFileTracking(
  { readFiles: ['a.ts'], modifiedFiles: [] },
  { readFiles: ['b.ts'], modifiedFiles: ['c.ts'] }
);
// { readFiles: ['a.ts', 'b.ts'], modifiedFiles: ['c.ts'] }
```

## Serialization

### `serializeConversation(messages, maxChars?)`

Serialize conversation to text for summarization. This prevents the LLM from treating the content as a conversation to respond to.

```typescript
import { serializeConversation } from '@eata/agent-core';

const text = serializeConversation(messages, 2000);
// "[User]: Hello\n\n[Assistant]: Hi there\n\n[Tool result]: { truncated: true }"
```

Message serialization format:
- `[User]: {content}` — User messages
- `[Assistant]: {text}\n[Assistant thinking]: {thinking}` — Assistant messages
- `[Assistant calls]: tool1(params); tool2(params)` — Tool calls
- `[Tool result]: {content}` — Tool results (truncated to `maxChars`)

## Complete Example

```typescript
import {
  generateSummary,
  extractGoal,
  extractProgress,
  extractKeyDecisions,
  extractNextSteps,
  extractCriticalContext,
  extractFileOperations,
  buildSummaryMarkdown,
  serializeConversation,
  parseFileOperations,
  mergeFileTracking,
  SummaryData
} from '@eata/agent-core';

async function customSummarization(messages, previousSummary) {
  // Step 1: Extract structured data
  const goal = extractGoal(messages);
  const progress = extractProgress(messages);
  const keyDecisions = extractKeyDecisions(messages);
  const nextSteps = extractNextSteps(messages);
  const criticalContext = extractCriticalContext(messages);
  const fileOps = extractFileOperations(messages);

  // Step 2: Handle cumulative file tracking
  let finalReadFiles = fileOps.readFiles;
  let finalModifiedFiles = fileOps.modifiedFiles;

  if (previousSummary) {
    const prevOps = parseFileOperations(previousSummary);
    const merged = mergeFileTracking(prevOps, fileOps);
    finalReadFiles = merged.readFiles;
    finalModifiedFiles = merged.modifiedFiles;
  }

  // Step 3: Build summary
  const data: SummaryData = {
    goal,
    progress,
    keyDecisions,
    nextSteps,
    criticalContext,
    readFiles: finalReadFiles,
    modifiedFiles: finalModifiedFiles
  };

  return buildSummaryMarkdown(data);
}

// Or use the high-level API:
const summary = await generateSummary(messages, {
  previousSummary: existingSummary
});
console.log(summary);
```

## Summarization System Prompt

The default system prompt used for LLM-based summarization:

```typescript
import { SUMMARIZATION_SYSTEM_PROMPT } from '@eata/agent-core';

// This prompt instructs the LLM to:
// 1. NOT continue the conversation
// 2. ONLY output the structured summary
// 3. Include ALL relevant context
// 4. Track all file operations
// 5. Preserve key decisions
// 6. List concrete next steps
```
