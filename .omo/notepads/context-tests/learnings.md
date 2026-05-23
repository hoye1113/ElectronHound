# Context Module Test Learnings

## Patterns
- Server tests use `vitest` with `.js` import suffix (vitest alias rewrites to `.ts`)
- Import style: `import { describe, it, expect, beforeEach, afterEach } from 'vitest'`
- Nested `describe()` blocks grouped by method name
- `beforeEach`/`afterEach` for setup/cleanup (env vars, runtime overrides)
- Package `@eata/server`, test runner `vitest run` via `pnpm --filter "@eata/server" test`

## Conventions
- ESM project: never use `require()` - use top-level `import` instead
- Helper functions: `repeatChar(char, length)`, `makeLogLines(count)` for test data
- No `any` type (only one `as` cast needed for typed imports)

## Key Test Details
- TokenTracker.countTokens is async (returns Promise) - must use `await`
- TokenTracker thresholds: contextWindow * 0.8 = effectiveWindow; ratios against DEFAULT_THRESHOLDS
- modelConfig: runtimeOverrides Map is set/clear API but NOT consulted by getRawContextWindow
- ToolResultManager: head+tail strategy; marker template: `\n\n... [truncated ~N chars] ...\n\n`
- ToolResultManager: very small maxChars triggers scaled head (80% of maxChars)

## Gotchas
- `require()` fails in ESM context - always use top-level `import`
- `o200k_base` tiktoken encoding loads dynamically and takes ~500ms first time
