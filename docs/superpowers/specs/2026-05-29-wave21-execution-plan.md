# Wave 21+ Execution Plan

## Overview

6 sequential waves to improve test coverage from 86.99% to ~91-92%.

| Wave | Target File | Current → Goal | Est. Impact | New Tests |
|------|-------------|----------------|-------------|-----------|
| A | taskStore.ts | 9.37% → ~85% | +3-4% | ~12 |
| B | sse.ts | 47.05% → ~95% | +0.3% | ~11 |
| C | stream.ts | 30% → ~85% | +0.1% | ~3 |
| D | reports.ts | 67.32% → ~90% | +0.5% | ~8 |
| E | server.ts | 71.32% → ~85% | +0.3% | ~7 |
| F | CreateTaskForm.tsx | 79.43% → ~90% | +0.2% | ~5 |

---

## Wave A: taskStore.ts — Detailed Steps

**File:** `apps/dashboard/src/__tests__/stores.test.ts` (extend)

### Step 1: Add extractErrorMessage tests (5 tests)

Add a new `describe('extractErrorMessage')` block inside the existing `describe('taskStore')`. Test each branch by triggering a fetch rejection with different error types and checking `state.error`:

1. `new Error('msg')` → state.error === 'msg'
2. `'string error'` → state.error === 'string error'
3. `{ error: 'API error' }` → state.error === 'API error'
4. `{ message: 'msg error' }` → state.error === 'msg error'
5. `42` (number) → state.error === 'An unexpected error occurred'

### Step 2: Add cancelTask tests (2 tests)

Add a `describe('cancelTask')` block:

1. **Success:** Set initial tasks, mock fetch to return cancelled task, call `cancelTask`, assert task status updated
2. **Error:** Mock fetch rejection, call `cancelTask`, assert `state.error` set

### Step 3: Add subscribeToTask callback tests (4 tests)

Need to mock `connectSSE` to capture callbacks. Add `vi.mock('../lib/sse.js')` at top of file with factory that captures the callbacks parameter.

1. **onStep appends:** Invoke captured `onStep`, assert `currentTaskSteps` updated
2. **onStep MAX_STEPS slice:** Set 999 steps, invoke onStep twice, assert length 1000
3. **onComplete closes and refetches:** Mock `api.tasks.get`, invoke `onComplete`, assert close + fetch called
4. **onError closes without fetch:** Invoke `onError`, assert close called, fetch NOT called

### Step 4: Add error path tests for existing actions (3 tests)

1. `createTask` rejection → state.error set
2. `deleteTask` rejection → state.error set
3. `fetchTask` rejection → state.error set

### Step 5: Verify

```bash
npx vitest run apps/dashboard/src/__tests__/stores.test.ts
npx vitest run --coverage | grep taskStore
```

---

## Wave B: sse.ts — Detailed Steps

**File:** `apps/dashboard/src/__tests__/sse.test.ts` (new file)

### Step 1: Create test file with EventSource mock

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listeners: Record<string, ((e: Event) => void)[]> = {};
let mockESInstance: {
  addEventListener: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onerror: ((e: Event) => void) | null;
};

beforeEach(() => {
  listeners.length = 0; // reset
  // ... setup mock
});

// Import after mock setup
const { connectSSE, safeParseEventData } = await import('../lib/sse.js');
```

### Step 2: safeParseEventData tests (3 tests)

1. Valid JSON → parsed object
2. Invalid JSON → null
3. Empty string → verify behavior

### Step 3: connectSSE tests (8 tests)

1. Creates EventSource with correct URL
2. Registers all 5 event listeners
3. Calls onStep with parsed data
4. Skips callback when parse returns null
5. Calls onLog with parsed data
6. Calls onStatus with parsed data
7. Calls onComplete with parsed data
8. Calls onError with raw event (no parsing)
9. Does not throw when callback missing
10. Returns EventSource instance

### Step 4: Verify

```bash
npx vitest run apps/dashboard/src/__tests__/sse.test.ts
npx vitest run --coverage | grep "sse.ts"
```

---

## Wave C: stream.ts — Detailed Steps

**File:** `apps/server/src/__tests__/stream-routes.test.ts` (new file)

### Step 1: Create test file with sseHub mock

```ts
vi.mock('../streams/sseHub.js', () => ({
  sseHub: {
    addClient: vi.fn(() => true),
    broadcast: vi.fn(),
  },
}));
```

### Step 2: Server setup (follow project pattern)

```ts
function createTempDbPath() { /* standard pattern */ }

let server: FastifyInstance;
let cleanupDir: string;

beforeAll(async () => {
  const tmp = createTempDbPath();
  cleanupDir = tmp.cleanupDir;
  server = await buildServer({ databasePath: tmp.dbPath });
});

afterAll(async () => {
  await server.close();
  rmSync(cleanupDir, { recursive: true, force: true });
});
```

### Step 3: Tests (3 tests)

1. Invalid UUID → 400
2. `addClient` returns false → 429
3. Valid UUID → `addClient` called with correct args (use timeout race)

### Step 4: Verify

```bash
npx vitest run apps/server/src/__tests__/stream-routes.test.ts
```

---

## Wave D: reports.ts — Detailed Steps

**File:** `apps/server/src/__tests__/reports-uuid.test.ts` (extend)

### Step 1: Add fs mock

```ts
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});
```

### Step 2: Add seed data helper

Insert a task + steps into the test DB for report generation tests.

### Step 3: Route 1 tests (2 tests)

1. File exists → 200 + JSON body
2. ENOENT → 404

### Step 4: Route 2 tests (2 tests)

1. Task not found → 404
2. Task exists → 200 + HTML + headers

### Step 5: Route 3 tests (4 tests)

1. Step index > 1000 → 400
2. Step not found → 404
3. Screenshot exists → 200 + PNG + Cache-Control
4. Screenshot ENOENT → 404

### Step 6: Verify

```bash
npx vitest run apps/server/src/__tests__/reports-uuid.test.ts
npx vitest run --coverage | grep "reports.ts"
```

---

## Wave E: server.ts — Detailed Steps

**File:** `apps/server/src/__tests__/server.test.ts` (extend)

### Step 1: Check if normalizeRouteLabel is exported

If exported, add direct unit tests. If not, test indirectly via `server.printRoutes()`.

### Step 2: normalizeRouteLabel tests (3 tests, if exported)

1. URL with UUID → replaced with `:id`
2. URL without UUID → unchanged
3. Multiple UUIDs → all replaced

### Step 3: API key auth hook tests (5 tests)

Each test creates a fresh `buildServer` with different config:

1. No apiKey → all requests pass
2. With apiKey, no header → 401
3. With apiKey, correct header → 200
4. `/health` skip path → 200 even with apiKey
5. `/api/stream` skip path → not 401

### Step 4: Config override test (1 test)

Minimal config → server starts successfully

### Step 5: Verify

```bash
npx vitest run apps/server/src/__tests__/server.test.ts
npx vitest run --coverage | grep "server.ts"
```

---

## Wave F: CreateTaskForm.tsx — Detailed Steps

**File:** `apps/dashboard/src/__tests__/CreateTaskForm.test.tsx` (extend)

### Step 1: Provider loading tests (2 tests)

1. Mock fetch returns providers → provider selector rendered
2. Mock fetch rejects → no crash, form still works

### Step 2: Submit error test (1 test)

Mock `createTask` rejection → error message displayed

### Step 3: Submitting state test (1 test)

Mock `createTask` as pending promise → button disabled

### Step 4: Provider selection test (1 test)

Select provider → verify providerId in submission data

### Step 5: Verify

```bash
npx vitest run apps/dashboard/src/__tests__/CreateTaskForm.test.tsx
npx vitest run --coverage | grep "CreateTaskForm"
```

---

## Final Verification (After All Waves)

```bash
# Run all tests
pnpm test

# Check coverage
npx vitest run --coverage

# Check ESLint
npx eslint --quiet

# Check build
pnpm build

# Update docs/loop-progress.md
git add -A && git commit -m "test: Wave 21 coverage optimization (86.99% → ~91%)"
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| SSE inject hangs | Use timeout race pattern (Wave C) |
| Radix Select can't be interacted in jsdom | Skip llmModel validation test, test via store mock |
| fs mock breaks other tests | Use `vi.mock` with `importOriginal` passthrough |
| Auth hook tests create many servers | Reuse server instances within describe blocks, cleanup in afterAll |
