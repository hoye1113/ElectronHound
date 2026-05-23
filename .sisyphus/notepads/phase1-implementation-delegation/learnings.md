
## Unified Multi-Provider LLM API (Wave 3)

### Patterns
- All providers use native `fetch` instead of @ai-sdk packages (they're not installed; zero new deps needed)
- Each provider implements LLMProvider interface: generateText, generateObject, streamText
- Streaming: each provider uses their native SSE format (OpenAI SSE, Anthropic content_block_delta, Google alt=sse, Ollama NDJSON)
- generateObject uses provider-native JSON mode (response_format:json_object, format:'json') + Zod validation
- Factory function uses exhaustive switch with `never` assertion for type safety

### Conventions
- File structure: `src/llm/{provider}.ts` with `create{Provider}()` factory exported
- Test location: `src/llm/__tests__/provider.test.ts` (colocated but not inside provider files)
- Tests mock `globalThis.fetch` (not vi.mock for modules) for zero external dependencies
- Each provider exposes `readonly name` and `readonly model` matching interface contract

### Decisions
- Chose fetch-based implementation over @ai-sdk packages to eliminate external dependencies
- Each provider handles its own API format differences (body shape, headers, streaming protocol)
- generateObject uses JSON-prompt suffix for Anthropic (which has no native JSON mode header) as fallback
