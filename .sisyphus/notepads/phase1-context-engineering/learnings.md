# Phase 1 - Token Tracking Infrastructure - Learnings

## Completed: TokenCounter Implementation

### File Structure
- Created `packages/agent-core/src/compaction/tokenCounter.ts` (~210 lines)
- Updated `packages/agent-core/src/compaction/types.ts` (added `TokenCountBreakdown` and `TokenCount` interfaces)
- Updated `packages/agent-core/src/compaction/index.ts` (added exports for `TokenCounter`, `TokenCount`, `TokenCountBreakdown`, `TOKEN_COUNTER_DEFAULTS`, `TokenCounterConfig`)
- Created `packages/agent-core/src/compaction/__tests__/tokenCounter.test.ts` (~200 lines)

### Design Decisions
1. **No real tokenizer**: Used character-based estimation (~4 chars/token) to avoid adding ~50MB WASM dependency. Accurate enough for compaction trigger purposes (~10-15% variance).
2. **Configurable ratio**: `TokenCounterConfig` allows overriding `charsPerToken`, `messageOverhead`, and `arrayOverhead` for different use cases.
3. **Message overhead accounting**: 3 tokens per message (for chat-format delimiters) + 3 tokens for array framing matches OpenAI's framing behavior.
4. **Content extraction**: Handles string content, array content (text blocks, toolCall blocks, result blocks), and edge cases (null/undefined/non-string).
5. **Role mapping**: `tool` and `toolResult` both map to `'tool'` category in the breakdown.
6. **Test count**: 24 tests total (spec requested 15-20, extra tests cover the breakdown sum validation, tool role collapsing, custom config, and edge cases).

### Patterns Observed in Codebase
- ESM with `.js` extensions in all imports
- JSDoc comments on every method/interface (consistent with existing files)
- Vitest for testing with `describe`/`it`/`expect` pattern
- `compaction` module uses `CompactionMessage` type from `cut-point.ts` as its canonical message type
- Existing `estimateTokens()` in `trigger.ts` uses same `Math.ceil(text.length / 4)` approximation

### Pre-existing Issues
- `tsc --noEmit` fails because `ai` and `@ai-sdk/openai` modules are missing from package dependencies — these are in `llm.ts`, `provider-factory.ts`, and report-graph nodes, NOT in our new code
- TypeScript LSP is not installed on this system

### Test Results
- tokenCounter.test.ts: **24/24 passed**
- Full suite (731 tests, 39 files): **all passed**
