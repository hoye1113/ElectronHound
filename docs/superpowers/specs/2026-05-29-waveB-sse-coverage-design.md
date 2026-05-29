# Wave B: sse.ts Coverage Improvement

## Goal

Improve `apps/dashboard/src/lib/sse.ts` coverage from 47.05% to ~95%.

## Current State

| Metric | Value |
|--------|-------|
| File lines | 50 |
| Current coverage | 47.05% stmts |
| Test file | None (new file needed) |
| Related tests | `stores.test.ts` mocks EventSource globally, `LiveMonitor.test.tsx` mocks `../lib/sse` module |

## Untested Code Paths

| Function | Lines | Description |
|----------|-------|-------------|
| `safeParseEventData` | 8-15 | JSON.parse with catch, returns null on failure |
| `connectSSE` URL construction | 20-22 | Builds `/api/stream/tasks/{taskId}` URL |
| `connectSSE` step listener | 24-27 | addEventListener('step') + safeParseEventData + callback |
| `connectSSE` log listener | 29-32 | addEventListener('log') + safeParseEventData + callback |
| `connectSSE` status listener | 34-37 | addEventListener('status') + safeParseEventData + callback |
| `connectSSE` complete listener | 39-42 | addEventListener('complete') + safeParseEventData + callback |
| `connectSSE` error listener | 44-46 | addEventListener('error') + raw event forwarding |
| `connectSSE` onerror handler | 48-49 | Logs warning about auto-reconnect |

## Approach: New sse.test.ts with Mock EventSource

**Why this approach:**
- Tests the real module logic (not a mock of the module)
- EventSource mock is simple: just needs `addEventListener` and `close`
- Follows pattern from `stores.test.ts` EventSource mock

**Alternatives considered:**
- Only export and test `safeParseEventData` — rejected: doesn't cover connectSSE
- Rely on LiveMonitor integration tests — rejected: those mock `../lib/sse`, don't test real code

## Detailed Test Plan

### Mock Setup

```ts
// Mock EventSource
const listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
const mockESInstance = {
  addEventListener: vi.fn((event: string, handler: (e: MessageEvent) => void) => {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(handler);
  }),
  close: vi.fn(),
  onerror: null as ((e: Event) => void) | null,
};
vi.stubGlobal('EventSource', vi.fn(() => mockESInstance));
```

### safeParseEventData (3 tests)

```ts
describe('safeParseEventData', () => {
  it('parses valid JSON data', () => {
    const event = new MessageEvent('step', { data: '{"foo":"bar"}' });
    expect(safeParseEventData(event)).toEqual({ foo: 'bar' });
  });

  it('returns null for invalid JSON', () => {
    const event = new MessageEvent('step', { data: 'not json' });
    expect(safeParseEventData(event)).toBeNull();
  });

  it('returns null for empty data', () => {
    const event = new MessageEvent('step', { data: '' });
    // empty string is valid JSON.parse input but returns empty string
    // verify behavior
  });
});
```

### connectSSE (8 tests)

```ts
describe('connectSSE', () => {
  it('creates EventSource with correct URL', () => {
    connectSSE('task-123', {});
    expect(EventSource).toHaveBeenCalledWith(
      expect.stringContaining('/api/stream/tasks/task-123')
    );
  });

  it('registers all 5 event listeners', () => {
    connectSSE('task-123', {});
    expect(mockESInstance.addEventListener).toHaveBeenCalledWith('step', expect.any(Function));
    expect(mockESInstance.addEventListener).toHaveBeenCalledWith('log', expect.any(Function));
    expect(mockESInstance.addEventListener).toHaveBeenCalledWith('status', expect.any(Function));
    expect(mockESInstance.addEventListener).toHaveBeenCalledWith('complete', expect.any(Function));
    expect(mockESInstance.addEventListener).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('calls onStep with parsed data when step event fires', () => {
    const onStep = vi.fn();
    connectSSE('task-123', { onStep });
    const handler = listeners['step'][0];
    handler(new MessageEvent('step', { data: '{"index":0}' }));
    expect(onStep).toHaveBeenCalledWith({ index: 0 });
  });

  it('skips callback when data parsing returns null', () => {
    const onStep = vi.fn();
    connectSSE('task-123', { onStep });
    listeners['step'][0](new MessageEvent('step', { data: 'bad' }));
    expect(onStep).not.toHaveBeenCalled();
  });

  it('calls onLog with parsed data', () => { /* similar pattern */ });
  it('calls onStatus with parsed data', () => { /* similar pattern */ });
  it('calls onComplete with parsed data', () => { /* similar pattern */ });

  it('calls onError with raw event (no parsing)', () => {
    const onError = vi.fn();
    connectSSE('task-123', { onError });
    const rawEvent = new Event('error');
    listeners['error'][0](rawEvent);
    expect(onError).toHaveBeenCalledWith(rawEvent);
  });

  it('does not throw when callback is not provided', () => {
    connectSSE('task-123', {});
    expect(() => {
      listeners['step'][0](new MessageEvent('step', { data: '{}' }));
    }).not.toThrow();
  });

  it('returns the EventSource instance', () => {
    const es = connectSSE('task-123', {});
    expect(es).toBe(mockESInstance);
  });
});
```

## Expected Coverage

| After | Stmts | Branches |
|-------|-------|----------|
| sse.ts | ~95% | ~90% |
| Overall project | +0.3% | |

## Verification

- `npx vitest run apps/dashboard/src/__tests__/sse.test.ts` — all tests pass
- `npx vitest run --coverage` — sse.ts ≥ 90%
