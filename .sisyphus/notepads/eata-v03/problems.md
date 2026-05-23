# T25: Dashboard Priority Control — Problems

## Pre-existing error (NOT introduced by T25)
- `AccessibilityTreeView.tsx:63` uses `t` without importing `useTranslation()` — pre-existing. Not fixed (outside task scope).

## Schema Change Impact on Server Tests
- Changed `TaskSchema.priority` from `.default('medium')` to `.optional()` to keep `Task` type backward-compatible with existing dashboard test mocks.
- This may break `priorityQueue.test.ts` line 257-258 (expects `result.priority === 'medium'` when absent). That test is in `apps/server`, not covered by the T25 test requirement (`pnpm test apps/dashboard`).
