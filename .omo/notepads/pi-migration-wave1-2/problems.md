# Pi Migration Wave 1-2 Problems (Unresolved)

## Open Questions

1. **How to handle non-OpenAI providers**: The custom LLM interface assumes OpenAI-compatible API format
   - Status: Design needs to support generic OpenAI-compatible endpoints

2. **Error recovery strategy**: If LLM call fails mid-loop, what's the recovery approach?
   - Status: Needs design decision before Task 5 (Agent Loop)

3. **Context window management**: When session accumulates, how to handle context overflow?
   - Status: Handled by Wave 3 (Compaction) — not in Wave 1-2 scope