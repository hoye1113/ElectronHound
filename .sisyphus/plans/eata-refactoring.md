# EATA Architecture Refactoring Plan

## Background
After completing v0.1 (20 tasks) and v0.3 (31 tasks), we need to fix structural issues found during architecture review.

## Scope
- **IN**: Type system cleanup, dead code removal, error handling, logging
- **OUT**: New features, test coverage expansion, performance optimization

## Priority Classification
- **P0**: Critical - must fix immediately
- **P1**: Important - should fix soon
- **P2**: Nice to have - fix when time permits

## Issues Found

### P0: Critical Issues (3) ✅ COMPLETED 2026-05-20
1. **C1**: `PlanNodeOptions.model` type mismatch - uses `ReturnType<typeof openai>` instead of `unknown` ✅
2. **C2**: `runner.ts:38` uses `as never` to bypass type checking ✅
3. **C3**: `testProviderConnection()` always returns `true` (placeholder implementation) ✅

### P1: Important Issues (2) ✅ COMPLETED 2026-05-20
1. **M1**: `graph.ts` lacks logging for conditional edges ✅
2. **M2**: `config-manager.ts:46` silently swallows parse errors ✅

### P2: Low Priority Issues (1) ✅ COMPLETED 2026-05-20
1. **L1**: Both old and new APIs exported from `index.ts` — legacy `planNode`/`verifyNode` removed ✅

## Detailed Fix Plan

### Phase 1: Type Unification (P0) ✅ COMPLETED 2026-05-20
1. ✅ Updated `PlanNodeOptions.model` type from `ReturnType<typeof openai>` to `unknown`
2. ✅ Updated `VerifyNodeOptions.model` type from `ReturnType<typeof openai>` to `unknown`
3. ✅ Removed `as never` cast in `runner.ts:38`
4. ✅ Widened `generateObject` return types to `{ object: unknown }` for full type unification
5. ✅ Implemented real `testProviderConnection` with `maxOutputTokens` (AI SDK v5)
6. ✅ All 195 agent-core tests pass; all 571 total tests pass; typecheck clean

### Phase 2: Dead Code Cleanup (P1) ✅ COMPLETED 2026-05-20
1. ✅ `testProviderConnection` with real API call (done in Phase 1)
2. ✅ Added logging to `graph.ts` for `routeAfterVerify` and `routeAfterObserve`
3. ✅ Added try/catch blocks with proper logging

### Phase 3: Error Handling (P1→done) ✅ COMPLETED 2026-05-20
1. ✅ Added `console.warn` at `config-manager.ts:46` for parse errors
2. Remaining: error logging throughout `config-manager.ts` (P2)
3. Remaining: review all catch blocks (P2)

## Impact Assessment
| Fix | Impact | Tests | Time |
|-----|--------|-------|------|
| Type unification | `plan.ts`, `verify.ts`, `runner.ts` | Update type tests | 30 min |
| Dead code cleanup | `provider-factory.ts`, `graph.ts` | Add logging tests | 1 hour |
| Error handling | `config-manager.ts` | Update tests | 30 min |

Total: 2 hours

## Next Steps
1. Confirm fix scope with user
2. Generate detailed TODO list for each fix
3. Execute by priority (P0→P1→P2)

## Files to Modify
### P0: Critical
- `packages/agent-core/src/nodes/plan.ts:14` — Change `ReturnType<typeof import('@ai-sdk/openai').openai>` to `unknown`
- `packages/agent-core/src/nodes/verify.ts:14` — Same fix
- `packages/agent-core/src/nodes/plan.ts:55` — Remove `as ReturnType<typeof import('@ai-sdk/openai').openai>` cast
- `packages/agent-core/src/nodes/verify.ts:38` — Same cast removal
- `packages/agent-core/src/runner.ts:38` — Remove `as never` cast
- `packages/agent-core/src/provider-factory.ts:44-51` — Implement real connection test

### P1: Important
- `packages/agent-core/src/graph.ts:15-36` — Add logging to `routeAfterVerify` and `routeAfterObserve`
- `packages/agent-core/src/config-manager.ts:46` — Add `console.warn` for parse errors

### P2: Low
- `packages/agent-core/src/index.ts` — Consider removing legacy exports (future release)

## Detailed Fix Plan

### Fix 1: plan.ts - PlanNodeOptions.model type
**Line 12-18**: Change interface
```typescript
// Before:
model: ReturnType<typeof import('@ai-sdk/openai').openai>;

// After:
model: unknown;
```

### Fix 2: plan.ts - Remove cast at line 55
```typescript
// Before:
model: {} as ReturnType<typeof import('@ai-sdk/openai').openai>,

// After:
model: {},
```

### Fix 3: verify.ts - Apply same fixes as plan.ts
- Line 12-18: Change `model` type to `unknown`
- Line 38: Remove cast

### Fix 4: runner.ts - Remove `as never` at line 38
```typescript
// Before:
const graphOptions = generateObject ? { plan: { generateObject: generateObject as never }, verify: { generateObject: generateObject as never } } : undefined;

// After:
const graphOptions = generateObject ? { plan: { generateObject }, verify: { generateObject } } : undefined;
```

### Fix 5: provider-factory.ts - Implement real connection test
```typescript
// Before:
export async function testProviderConnection(): Promise<boolean> {
  try { return true; } catch { return false; }
}

// After:
export async function testProviderConnection(config: LLMProviderConfig): Promise<{ success: boolean; message: string; latencyMs: number }> {
  const t0 = Date.now();
  const model = createProviderInstance(config);
  try {
    const { generateText } = await import('ai');
    await generateText({ model, prompt: 'OK', maxTokens: 5 });
    return { success: true, message: 'Connection successful', latencyMs: Date.now() - t0 };
  } catch (err) {
    return { success: false, message: String(err), latencyMs: Date.now() - t0 };
  }
}
```

### Fix 6: graph.ts - Add logging to conditional edges
```typescript
// Add at top:
import { log } from '../logger.js'; // or use console.log for simplicity

// In routeAfterVerify (line 15-29):
const routeAfterVerify = (state: typeof TestState.State): string => {
  if (state.stepCount >= state.maxSteps) {
    log('routeAfterVerify: maxSteps reached → fail');
    return 'fail';
  }
  if (state.stuckCounter >= 3) {
    log('routeAfterVerify: stuck detected → escalate');
    return 'escalate';
  }
  const verdict = state.currentVerdict?.verdict;
  log(`routeAfterVerify: verdict=${verdict} → ${verdict === 'pass' ? 'pass' : 'retry'}`);
  if (verdict === 'pass') return 'pass';
  if (verdict === 'fail') return 'fail';
  if (verdict === 'escalate') return 'escalate';
  return 'retry';
};

// In routeAfterObserve (line 31-36):
const routeAfterObserve = (state: typeof TestState.State): string => {
  if (state.stuckCounter >= 3) {
    log('routeAfterObserve: stuck detected → stuck');
    return 'stuck';
  }
  if (state.stepCount >= state.maxSteps) {
    log('routeAfterObserve: maxSteps reached → stuck');
    return 'stuck';
  }
  log('routeAfterObserve: normal flow → normal');
  return 'normal';
};
```

### Fix 7: config-manager.ts - Add console.warn at line 46
```typescript
// Before:
} catch {
  return DEFAULT_PROVIDERS;
}

// After:
} catch (err) {
  console.warn(`Failed to parse providers.json: ${String(err)}. Using defaults.`);
  return DEFAULT_PROVIDERS;
}
```

## Verification Commands
```bash
# Typecheck
pnpm run --filter "@eata/agent-core" typecheck

# Run tests
pnpm test -- --project "@eata/agent-core"

# Run all tests
pnpm test
```
