# Wave C: stream.ts Coverage Improvement

## Goal

Improve `apps/server/src/routes/stream.ts` coverage from 30% to ~90%.

## Current State

| Metric | Value |
|--------|-------|
| File lines | 29 |
| Current coverage | 30% stmts |
| Test file | `sse.test.ts` (SSEHub unit tests + route registration only) |
| Constraint | SSE connections stay open, `server.inject()` hangs on success path |

## Untested Code Paths

| Path | Lines | Status |
|------|-------|--------|
| Invalid UUID → 400 | 14-16 | untested via inject |
| `addClient` returns false → 429 | 20-22 | untested |
| Happy path: addClient + broadcast status | 24-28 | untested (inject hangs) |

## Approach: Mock SSEHub + server.inject for Error Paths

**Why this approach:**
- `server.inject()` works perfectly for 400 and 429 paths (they return immediately)
- Happy path tested by verifying `sseHub.addClient` was called with correct args
- Mock `sseHub` to control `addClient` return value

**Alternatives considered:**
- Skip route testing entirely — rejected: 400/429 paths are important
- Use `server.inject()` with timeout — rejected: fragile, not project pattern

## Detailed Test Plan

### Mock Setup

```ts
vi.mock('../streams/sseHub.js', () => ({
  sseHub: {
    addClient: vi.fn(() => true),
    broadcast: vi.fn(),
  },
}));
```

### Tests

```ts
describe('stream routes', () => {
  // Setup: buildServer with temp DB
  beforeAll(async () => {
    const { dbPath, cleanupDir } = createTempDbPath();
    server = await buildServer({ databasePath: dbPath });
    // ...
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/stream/tasks/not-a-uuid',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 429 when addClient returns false', async () => {
    vi.mocked(sseHub.addClient).mockReturnValueOnce(false);
    const res = await server.inject({
      method: 'GET',
      url: '/api/stream/tasks/550e8400-e29b-41d4-a716-446655440000',
    });
    expect(res.statusCode).toBe(429);
  });

  it('calls addClient with correct taskId on valid UUID', async () => {
    // Note: inject will hang on success, so we need to handle this
    // Option A: Use AbortController/timeout
    // Option B: Verify addClient was called before inject resolves
    const validId = '550e8400-e29b-41d4-a716-446655440000';
    vi.mocked(sseHub.addClient).mockReturnValueOnce(true);
    // Use a race with timeout to avoid hanging
    await Promise.race([
      server.inject({ method: 'GET', url: `/api/stream/tasks/${validId}` }),
      new Promise(resolve => setTimeout(resolve, 100)),
    ]);
    expect(sseHub.addClient).toHaveBeenCalledWith(validId, expect.anything());
  });
});
```

### Handling the Hanging Connection

For the success path, `server.inject()` won't resolve because the SSE connection stays open. Options:

1. **Timeout race** (recommended): `Promise.race([inject, timeout])` — simple, works
2. **Mock addClient to close reply**: Have the mock call `reply.raw.end()` — more complete but modifies behavior
3. **Skip success path**: Only test 400/429, rely on SSEHub unit tests — simplest

I recommend option 1 for the broadcast verification, option 3 as fallback.

## Expected Coverage

| After | Stmts | Branches |
|-------|-------|----------|
| stream.ts | ~85-90% | ~80% |
| Overall project | +0.1% | |

## Verification

- `npx vitest run apps/server/src/__tests__/stream-routes.test.ts` — all tests pass
- `npx vitest run --coverage` — stream.ts ≥ 80%
