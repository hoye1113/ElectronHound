# Wave A: taskStore.ts Coverage Improvement

## Goal

Improve `apps/dashboard/src/stores/taskStore.ts` coverage from 9.37% to ~80%.

## Current State

| Metric | Value |
|--------|-------|
| File lines | 116 |
| Current coverage | 9.37% stmts |
| Test file | `apps/dashboard/src/__tests__/stores.test.ts` |
| Existing tests | fetchTasks (success+error), fetchTask, createTask, deleteTask, subscribeToTask (cleanup only) |

## Untested Code Paths

| Function | Lines | Branches | Status |
|----------|-------|----------|--------|
| `extractErrorMessage` | 13-22 | 4 (Error, string, object with error/message, fallback) | 0% |
| `cancelTask` | 74-83 | 2 (success, error) | 0% |
| `subscribeToTask.onStep` | 97-103 | 2 (normal append, MAX_STEPS slice) | 0% |
| `subscribeToTask.onComplete` | 105-108 | 1 | 0% |
| `subscribeToTask.onError` | 109-111 | 1 | 0% |
| `createTask` error path | 69-71 | 1 | untested |
| `deleteTask` error path | 89-91 | 1 | untested |
| `fetchTask` error path | 60-62 | 1 | untested |

## Approach: Extend Existing stores.test.ts

**Why this approach:**
- Reuses existing `mockFetch`, `mockEventSourceInstance`, `mockTask` fixtures
- Follows project pattern (stores.test.ts already has the store setup)
- Zero new files

**Alternatives considered:**
- Split into `taskStore.unit.test.ts` — rejected: adds file count, extractErrorMessage can be tested inline

## Detailed Test Plan

### 1. extractErrorMessage (4 tests)

```ts
describe('extractErrorMessage', () => {
  // Access via store error state after a rejected action
  // Error instance → err.message
  it('extracts message from Error instance', async () => {
    mockFetch.mockRejectedValueOnce(new Error('specific error'));
    await useTaskStore.getState().fetchTasks();
    expect(useTaskStore.getState().error).toBe('specific error');
  });

  // String throw → return string
  it('extracts string thrown value', async () => {
    mockFetch.mockRejectedValueOnce('string error');
    await useTaskStore.getState().fetchTasks();
    expect(useTaskStore.getState().error).toBe('string error');
  });

  // Object with error key → return obj.error
  it('extracts error from object with error key', async () => {
    mockFetch.mockRejectedValueOnce({ error: 'API error' });
    await useTaskStore.getState().fetchTasks();
    expect(useTaskStore.getState().error).toBe('API error');
  });

  // Object with message key → return obj.message
  it('extracts message from object with message key', async () => {
    mockFetch.mockRejectedValueOnce({ message: 'msg error' });
    await useTaskStore.getState().fetchTasks();
    expect(useTaskStore.getState().error).toBe('msg error');
  });

  // Fallback
  it('returns fallback for unknown error type', async () => {
    mockFetch.mockRejectedValueOnce(42);
    await useTaskStore.getState().fetchTasks();
    expect(useTaskStore.getState().error).toBe('An unexpected error occurred');
  });
});
```

### 2. cancelTask (2 tests)

```ts
describe('cancelTask', () => {
  it('updates task status to cancelled on success', async () => {
    useTaskStore.setState({ tasks: [mockTask] });
    const cancelledTask = { ...mockTask, status: 'cancelled' };
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(cancelledTask),
    });
    await useTaskStore.getState().cancelTask(mockTask.id);
    expect(useTaskStore.getState().tasks[0].status).toBe('cancelled');
  });

  it('sets error on cancel failure', async () => {
    useTaskStore.setState({ tasks: [mockTask] });
    mockFetch.mockRejectedValueOnce(new Error('Cancel failed'));
    await useTaskStore.getState().cancelTask(mockTask.id);
    expect(useTaskStore.getState().error).toContain('Cancel failed');
  });
});
```

### 3. subscribeToTask callbacks (3 tests)

```ts
describe('subscribeToTask callbacks', () => {
  it('onStep appends step to currentTaskSteps', () => {
    // Mock connectSSE to capture callbacks
    // ... invoke captured onStep with mock data
    // Assert currentTaskSteps contains the step
  });

  it('onStep slices when exceeding MAX_STEPS (1000)', () => {
    // Set currentTaskSteps to 999 items
    // Invoke onStep twice (1001 total)
    // Assert length is 1000, first item was removed
  });

  it('onComplete closes ES and fetches task', async () => {
    // Mock api.tasks.get
    // Invoke captured onComplete
    // Assert es.close() called AND api.tasks.get called
  });

  it('onError closes ES without fetching', () => {
    // Invoke captured onError
    // Assert es.close() called AND api.tasks.get NOT called
  });
});
```

### 4. Error paths for existing actions (3 tests)

```ts
it('createTask sets error on failure', async () => {
  mockFetch.mockRejectedValueOnce(new Error('Create failed'));
  await useTaskStore.getState().createTask({...});
  expect(useTaskStore.getState().error).toContain('Create failed');
});

it('deleteTask sets error on failure', async () => {
  useTaskStore.setState({ tasks: [mockTask] });
  mockFetch.mockRejectedValueOnce(new Error('Delete failed'));
  await useTaskStore.getState().deleteTask(mockTask.id);
  expect(useTaskStore.getState().error).toContain('Delete failed');
});

it('fetchTask sets error on failure', async () => {
  mockFetch.mockRejectedValueOnce(new Error('Fetch failed'));
  await useTaskStore.getState().fetchTask('bad-id');
  expect(useTaskStore.getState().error).toContain('Fetch failed');
});
```

## Expected Coverage

| After | Stmts | Branches |
|-------|-------|----------|
| taskStore.ts | ~85% | ~75% |
| Overall project | +3-4% | |

## Verification

- `npx vitest run apps/dashboard/src/__tests__/stores.test.ts` — all tests pass
- `npx vitest run --coverage` — taskStore.ts ≥ 80%
