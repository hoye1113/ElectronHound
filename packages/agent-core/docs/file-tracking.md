# File Tracking

File tracking is a component of the compaction system that maintains cumulative records of file operations (read and modified) across multiple compaction cycles. This ensures that file context is preserved even when conversation history is compacted.

## Overview

The `FileTracker` class tracks two categories of file operations:

- **Read files** — Files that were read (via `read` tool calls) but not modified
- **Modified files** — Files that were written or edited (via `write` or `edit` tool calls)

A file that was read and later modified is automatically moved from the "read" list to the "modified" list.

## FileTracker Class

### Creating a Tracker

```typescript
import { FileTracker } from '@eata/agent-core';

// Manual tracking
const tracker = new FileTracker();
tracker.trackFile('src/index.ts', 'read');
tracker.trackFile('src/utils.ts', 'modified');

// From conversation messages
const fromMsgs = FileTracker.fromMessages(messages);
```

### `trackFile(filePath, type)`

Track a single file operation.

```typescript
const tracker = new FileTracker();

// Track as read
tracker.trackFile('src/graph.ts', 'read');

// Track as modified (automatically removes from read list)
tracker.trackFile('src/tools/cdp.ts', 'modified');

// If a file was previously tracked as read and is now modified,
// it moves from readFiles to modifiedFiles
tracker.trackFile('src/graph.ts', 'modified');
// readFiles no longer contains 'src/graph.ts'
```

### `getFilesByType(type)`

Get files by type, sorted alphabetically.

```typescript
const readFiles = tracker.getFilesByType('read');
// ['packages/agent-core/docs/api.md', 'packages/agent-core/docs/tools.md']

const modifiedFiles = tracker.getFilesByType('modified');
// ['packages/agent-core/src/tools/cdp.ts']
```

### `getAllFiles()`

Get all tracked files (read + modified), sorted and deduplicated.

```typescript
const all = tracker.getAllFiles();
// [...readFiles, ...modifiedFiles] sorted alphabetically
```

## Extracting from Messages

The `FileTracker.fromMessages()` static method extracts file operations directly from conversation messages.

### How It Works

It scans assistant messages for tool call blocks and categorizes them:

| Tool Name | Category |
|-----------|----------|
| `read` | readFiles |
| `write` | modifiedFiles |
| `edit` | modifiedFiles |

```typescript
const messages = [
  {
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        name: 'read',
        arguments: { path: 'src/graph.ts' }
      },
      {
        type: 'toolCall',
        name: 'write',
        arguments: { path: 'src/state.ts', content: '...' }
      }
    ]
  }
];

const tracker = FileTracker.fromMessages(messages);
tracker.getFilesByType('read');     // ['src/graph.ts']
tracker.getFilesByType('modified'); // ['src/state.ts']
```

## Cumulative Merging

The `merge()` method combines current tracker state with previous compaction entries.

### Why Cumulative?

When compaction occurs, only recent messages are preserved. The file tracker maintains a complete record of ALL file operations across ALL compaction cycles, ensuring no context is lost.

### Example

```typescript
// Previous compaction entry
const previous = [{
  entryType: 'compaction',
  readFiles: ['src/a.ts', 'src/b.ts'],
  modifiedFiles: ['src/c.ts'],
  tokenCount: 100,
  timestamp: '2024-01-01T00:00:00Z'
}];

// Current tracker has: readFiles=['src/d.ts'], modifiedFiles=['src/e.ts']
const tracker = new FileTracker();
tracker.trackFile('src/d.ts', 'read');
tracker.trackFile('src/e.ts', 'modified');

// Merge
const result = tracker.merge(previous);

// Result:
// readFiles: ['src/a.ts', 'src/b.ts', 'src/d.ts']  (sorted)
// modifiedFiles: ['src/c.ts', 'src/e.ts']            (sorted)
// tokenCount: 5
```

### Priority Rules

- Modified files always take priority over read files
- A file appearing in modifiedFiles across ANY entry is removed from readFiles
- All lists are deduplicated and sorted

## CompactionEntryDetails

The persistent storage format:

```typescript
interface CompactionEntryDetails {
  entryType: 'compaction';
  readFiles: string[];
  modifiedFiles: string[];
  tokenCount: number;
  timestamp: string;
}
```

## Integration with Summary Generation

File tracking is integrated into the summary generation pipeline:

```typescript
import { generateSummary, FileTracker } from '@eata/agent-core';

async function compactWithFileTracking(messages, previousSummary) {
  // Extract file operations from messages
  const tracker = FileTracker.fromMessages(messages);
  
  // Generate summary (includes file tracking)
  const summary = await generateSummary(messages, {
    previousSummary
  });
  
  // Merge with previous file tracking
  const fileDetails = tracker.merge(previousEntries);
  
  return {
    summary,
    fileTracking: {
      readFiles: fileDetails.readFiles,
      modifiedFiles: fileDetails.modifiedFiles
    }
  };
}
```

## Complete Example

```typescript
import { FileTracker, generateSummary } from '@eata/agent-core';

// Scenario: A testing session with multiple file operations
const sessionMessages = [
  {
    role: 'user',
    content: 'Read the graph.ts file'
  },
  {
    role: 'assistant',
    content: [
      { type: 'toolCall', name: 'read', arguments: { path: 'src/graph.ts' } }
    ]
  },
  {
    role: 'user',
    content: 'Add a new verify node option'
  },
  {
    role: 'assistant',
    content: [
      { type: 'toolCall', name: 'edit', arguments: { path: 'src/graph.ts', content: '...' } },
      { type: 'toolCall', name: 'write', arguments: { path: 'src/new-file.ts', content: '...' } }
    ]
  }
];

// Track files from this session
const tracker = FileTracker.fromMessages(sessionMessages);

// graph.ts was read then modified → moved to modifiedFiles
console.log(tracker.getFilesByType('read'));
// [] — graph.ts was read but then modified

console.log(tracker.getFilesByType('modified'));
// ['src/graph.ts', 'src/new-file.ts']

// Previous compaction had tracked these files
const previousEntries = [{
  entryType: 'compaction',
  readFiles: ['src/old-read.ts', 'src/old-a.ts'],
  modifiedFiles: ['src/old-mod.ts'],
  tokenCount: 200,
  timestamp: '2024-01-15T10:00:00Z'
}];

// Merge cumulative tracking
const merged = tracker.merge(previousEntries);

console.log(merged.readFiles);
// ['src/old-a.ts', 'src/old-read.ts']

console.log(merged.modifiedFiles);
// ['src/graph.ts', 'src/new-file.ts', 'src/old-mod.ts']
```
