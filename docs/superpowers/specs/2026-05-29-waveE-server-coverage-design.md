# Wave E: server.ts Coverage Improvement

## Goal

Improve `apps/server/src/server.ts` coverage from 71.32% to ~85%.

## Current State

| Metric | Value |
|--------|-------|
| File lines | 188 |
| Current coverage | 71.32% stmts |
| Test file | `server.test.ts` (basic buildServer + DB checks) |

## Untested Code Paths

| Function/Block | Lines | Status |
|----------------|-------|--------|
| `normalizeRouteLabel` | 16-19 | 0% — UUID regex replacement |
| API key auth hook | 64-75 | 0% — skip paths, unauthorized → 401 |
| HTTP metrics hook | 77-80 | 0% — `httpRequestsTotal.inc` |
| Config partial override | 31-35 | untested |
| Auto-start block | 163-188 | 0% — process-level, skip |

## Approach: Unit Tests for Pure Functions + inject for Auth Hook

**Why this approach:**
- `normalizeRouteLabel` is a pure function, trivially testable
- Auth hook testable via `server.inject()` with different `buildServer` configs
- Auto-start block is process-level code, not suitable for unit testing

**Alternatives considered:**
- Only test `normalizeRouteLabel` — rejected: auth hook is security-critical
- Mock process.argv for auto-start — rejected: fragile, low value

## Detailed Test Plan

### 1. normalizeRouteLabel (exported or tested via buildServer)

Need to check if it's exported. If not, test indirectly via server route labels.

```ts
// If exported:
import { normalizeRouteLabel } from '../server.js';

it('replaces UUID with :id', () => {
  expect(normalizeRouteLabel('/api/tasks/550e8400-e29b-41d4-a716-446655440000/report'))
    .toBe('/api/tasks/:id/report');
});

it('handles URL without UUID', () => {
  expect(normalizeRouteLabel('/api/health')).toBe('/api/health');
});

it('replaces multiple UUIDs', () => {
  expect(normalizeRouteLabel('/api/tasks/aaa/bbb/550e8400-e29b-41d4-a716-446655440000'))
    .toBe('/api/tasks/aaa/bbb/:id');
});
```

If not exported, test indirectly by checking `server.printRoutes()` output after build.

### 2. API Key Auth Hook (4 tests)

```ts
describe('API key authentication', () => {
  it('passes all requests when no apiKey configured', async () => {
    const server = await buildServer({ databasePath: tmpPath });
    const res = await server.inject({ method: 'GET', url: '/api/tasks' });
    expect(res.statusCode).not.toBe(401);
    await server.close();
  });

  it('returns 401 when apiKey set and header missing', async () => {
    const server = await buildServer({ databasePath: tmpPath, apiKey: 'secret' });
    const res = await server.inject({ method: 'GET', url: '/api/tasks' });
    expect(res.statusCode).toBe(401);
    await server.close();
  });

  it('passes when apiKey header matches', async () => {
    const server = await buildServer({ databasePath: tmpPath, apiKey: 'secret' });
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks',
      headers: { 'x-api-key': 'secret' },
    });
    expect(res.statusCode).not.toBe(401);
    await server.close();
  });

  it('skips auth for /health endpoint', async () => {
    const server = await buildServer({ databasePath: tmpPath, apiKey: 'secret' });
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    await server.close();
  });

  it('skips auth for /api/stream endpoint', async () => {
    const server = await buildServer({ databasePath: tmpPath, apiKey: 'secret' });
    // Stream route will fail for other reasons, but should not be 401
    const res = await server.inject({
      method: 'GET',
      url: '/api/stream/tasks/550e8400-e29b-41d4-a716-446655440000',
    });
    expect(res.statusCode).not.toBe(401);
    await server.close();
  });
});
```

### 3. Config Override (1 test)

```ts
it('merges partial config with defaults', async () => {
  const { server } = await buildServer({ databasePath: tmpPath });
  // Verify server starts successfully with minimal config
  const res = await server.inject({ method: 'GET', url: '/health' });
  expect(res.statusCode).toBe(200);
  await server.close();
});
```

## Expected Coverage

| After | Stmts | Branches |
|-------|-------|----------|
| server.ts | ~85% | ~75% |
| Overall project | +0.3% | |

## Verification

- `npx vitest run apps/server/src/__tests__/server.test.ts` — all tests pass
- `npx vitest run --coverage` — server.ts ≥ 80%
