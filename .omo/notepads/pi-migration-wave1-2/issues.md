# Pi Migration Wave 1-2 Issues

## Known Blockers

1. **Phantom Dependencies**: `agent-core` uses Vercel AI SDK but doesn't declare it — will break when dependencies are removed from `server`
   - Mitigation: Task 1 handles dependency cleanup first

2. **Report-graph nodes use type-only imports of `@ai-sdk/openai`**: Will need type replacement
   - Mitigation: Replace `ReturnType<typeof import('@ai-sdk/openai').openai>` with custom type

## Potential Problems

1. **Migration Order**: Must complete Task 2 (LLM interface) before Task 3 (migrate providers.ts)
2. **Session Persistence**: Adding SQLite to `agent-core` may require database initialization
3. **Test Compatibility**: Existing tests mock Vercel AI SDK — will need test rewrites

## Edge Cases

1. **Provider connection failures**: Custom LLM interface must handle errors gracefully
2. **Empty session state**: SessionManager must handle sessions with no entries
3. **Loop termination**: AgentLoop must have clear termination conditions