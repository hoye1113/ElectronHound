# T18: Wire runAuditChain into main test graph — Learnings

## Key Finding: Stale .js build artifacts in src/

The `packages/agent-core/src/` directory contained stale compiled `.js`, `.d.ts`, and `.map` files alongside the `.ts` source files. This caused vitest (with the `.js` extension alias) to pick up the outdated `.js` files instead of `.ts` sources.

**Symptom**: Test changes in `.ts` files had no effect. Test assertions about new fields/functions returned `undefined`.

**Root Cause**: The vitest `resolve.alias` strips `.js` extension (`find: /(.*)\.js$/`, `replacement: '$1'`). When `verify.js` existed alongside `verify.ts`, Vite resolved to the `.js` file first.

**Fix**: Delete all stale `.js`, `.d.ts`, and `.map` files from `src/` directory:
```
packages/agent-core/src/**/*.js
packages/agent-core/src/**/*.d.ts
packages/agent-core/src/**/*.js.map
packages/agent-core/src/**/*.d.ts.map
```

## Test Mocking Issue

Initial attempts to mock `../../sub-agents/index.js` via `vi.mock()` didn't actually intercept the import used by `verify.ts`. This was due to the stale `.js` artifact being loaded instead of the `.ts` source.

After removing stale files, the real audit chain (deterministic, no LLM calls) runs correctly without needing mocks.

**Decision**: Test the REAL audit chain integration rather than mocking — the sub-agents are deterministic (keyword heuristics) and fast. This provides more meaningful integration tests.
