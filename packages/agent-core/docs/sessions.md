# Session Management

EATA uses LangGraph's built-in checkpointer for session persistence. Sessions allow you to pause, resume, and replay test executions.

## Overview

A session represents a single test execution with its own state history. LangGraph's `MemorySaver` (default) or custom checkpointers persist the `TestState` between steps, enabling:

- **Resume**: Continue a paused test from the last checkpoint
- **Replay**: Reproduce test behavior from a previous session
- **Inspect**: Examine state at any point in the execution history

## Checkpointing

EATA provides a factory function for creating checkpointers:

```typescript
import { createCheckpointer } from '@eata/agent-core';

// Create a checkpointer (MemorySaver by default)
const checkpointer = createCheckpointer();
```

## Session Lifecycle

```
┌────────┐     ┌────────┐     ┌──────────┐     ┌──────────┐     ┌────────┐
│  Init  │────▶│Observe │────▶│  Plan    │────▶│Execute   │────▶│Verify  │
└────────┘     └────────┘     └──────────┘     └──────────┘     └────────┘
                                                                       │
                                              ┌────────────────────────┘
                                              ↓
                                    ┌──────────────────┐
                                    │     Route         │
                                    ├──────────────────┤
                                    │ retry → Observe   │
                                    │ pass  → Report    │
                                    │ fail  → Report    │
                                    │ escalate → Abort  │
                                    └──────────────────┘
```

### State Fields

Each session tracks these fields in `TestState`:

| Field | Type | Description |
|-------|------|-------------|
| `goal` | `string` | Natural language test goal |
| `targetAppPath` | `string` | Path to the Electron app |
| `llmModel` | `string` | LLM model being used |
| `maxSteps` | `number` | Maximum execution steps (default: 50) |
| `history` | `StepRecord[]` | Execution history (last 50 steps) |
| `currentObservation` | `ObservationResult \| null` | Latest observation |
| `currentPlan` | `PlanResult \| null` | Latest plan |
| `currentExecResult` | `ExecResult \| null` | Latest execution result |
| `currentVerdict` | `VerdictResult \| null` | Latest verdict |
| `stepCount` | `number` | Number of steps taken |
| `stuckCounter` | `number` | Consecutive stuck attempts |
| `status` | `'running' \| 'completed' \| 'failed' \| 'aborted'` | Session status |
| `lastObservationHash` | `string` | Hash for stuck detection |

### History Reducer

The `history` field uses a reducer that limits the array to the last 50 steps:

```typescript
reducer: (left: StepRecord[], right: StepRecord[]) => {
  const combined = [...left, ...right];
  return combined.length > 50 ? combined.slice(-50) : combined;
}
```

This prevents unbounded growth while preserving the most recent execution context.

## Running a Test

The `runTest` function wraps the LangGraph execution with session management:

```typescript
import { runTest } from '@eata/agent-core';

const result = await runTest({
  goal: 'Verify login flow works',
  targetAppPath: '/path/to/app',
  llmModel: 'gpt-4o',
  maxSteps: 30,
  taskId: 'test-001',
});

// result.status: 'completed' | 'failed' | 'aborted'
// result.history: StepRecord[] — execution history
// result.stepCount: number — total steps taken
```

### RunTestOptions

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `goal` | `string` | Yes | Natural language test goal |
| `targetAppPath` | `string` | Yes | Path to Electron app |
| `llmModel` | `string` | No | LLM model (default: `'gpt-4o'`) |
| `maxSteps` | `number` | No | Max steps (default: 50) |
| `taskId` | `string` | No | Task identifier |

## Session Persistence

### MemorySaver (default)

The default checkpointer stores state in memory:

```typescript
const checkpointer = createCheckpointer();
// State persists only for the lifetime of the process
```

### Custom Checkpointers

For production use, implement a persistent checkpointer (SQLite, Redis, etc.) that stores `TestState` snapshots between steps. LangGraph checkpointers implement the `BaseCheckpointSaver` interface.

## Stuck Detection

EATA detects when an agent is stuck by comparing observation hashes:

```typescript
// In routeAfterObserve:
if (state.stuckCounter >= 3) {
  return 'stuck'; // → abort
}

// In routeAfterVerify:
if (state.stuckCounter >= 3) {
  return 'escalate'; // → abort
}
```

The `stuckCounter` increments when the agent produces the same observation twice in a row (detected via `lastObservationHash`).

## Max Steps Protection

The `maxSteps` field prevents infinite loops:

```typescript
if (state.stepCount >= state.maxSteps) {
  return 'fail'; // Force termination
}
```

## Complete Example

```typescript
import { createTestGraph, runTest } from '@eata/agent-core';

// 1. Create the test graph
const graph = createTestGraph({
  plan: { temperature: 0.2 },
  verify: { strictness: 'medium' }
});

// 2. Run the test
const result = await runTest({
  goal: 'Add a new item to the todo list and verify it appears',
  targetAppPath: '/path/to/todo-app',
  llmModel: 'gpt-4o',
  maxSteps: 25,
  taskId: 'todo-add-test'
});

// 3. Check result
if (result.status === 'completed') {
  console.log('Test passed successfully');
} else if (result.status === 'failed') {
  console.log('Test failed after', result.stepCount, 'steps');
} else {
  console.log('Test aborted — stuck or error');
}

// 4. Inspect history
for (const step of result.history) {
  console.log(`[Step ${step.stepNumber}] ${step.action} → ${step.result}`);
}
```
