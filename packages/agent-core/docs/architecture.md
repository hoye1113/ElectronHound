# Architecture Overview

EATA (Electron App Testing Agent) is built as a modular, layered system for autonomous Electron application testing. This document describes the overall architecture, key design decisions, and module interactions.

## System Layer Diagram

```
┌──────────────────────────────────────────────────────┐
│                   User Interface                      │
│              (Dashboard + CLI)                        │
├──────────────────────────────────────────────────────┤
│                  Server Layer                         │
│           (Fastify HTTP + SQLite)                     │
├──────────────────────────────────────────────────────┤
│               Agent Core Layer                        │
│   LangGraph Test Graph  │  Compaction  │  Sub-agents │
├──────────────────────────────────────────────────────┤
│                Tool / Integration Layer               │
│   CDP Tools (12)  │  Tool Registry  │  File Tracker  │
├──────────────────────────────────────────────────────┤
│                  LLM Provider Layer                   │
│   OpenAI  │  Anthropic  │  Google  │  Ollama          │
├──────────────────────────────────────────────────────┤
│             Electron / Playwright CDP                 │
│      (Chrome DevTools Protocol via WebSocket)         │
└──────────────────────────────────────────────────────┘
```

## Agent Loop

The core agent loop uses LangGraph `StateGraph` to model the test execution as a state machine.

### State Definition

```typescript
// packages/agent-core/src/state.ts
export const TestState = Annotation.Root({
  goal: Annotation<string>({ reducer: (_l, r) => r, default: () => '' }),
  targetAppPath: Annotation<string>({ reducer: (_l, r) => r, default: () => '' }),
  llmModel: Annotation<string>({ reducer: (_l, r) => r, default: () => 'gpt-4o' }),
  maxSteps: Annotation<number>({ reducer: (_l, r) => r, default: () => 50 }),
  history: Annotation<StepRecord[]>({
    reducer: (left, right) => {
      const combined = [...left, ...right];
      return combined.length > 50 ? combined.slice(-50) : combined;
    },
    default: () => [],
  }),
  // ...observation, plan, exec, verdict, stepCount, stuckCounter, status
});
```

### Graph Structure

```
START → observe → [normal] → plan → execute → verify
                  ↑                                   ↓
                  └────── [retry] ←──────────────────┘
                                    ↓
                          [pass/fail] → report → END
                                    ↓
                          [escalate] → abort → END

observe → [stuck] → abort → END
```

### Routing Logic

**After observe:**
- `normal`: Continue to plan
- `stuck`: Max steps or stuck detected → abort

**After verify:**
- `retry`: Test not yet passing → loop back to observe
- `pass`: Test passed → report and end
- `fail`: Test failed definitively → report and end
- `escalate`: Too many stuck attempts → abort

## Key Design Principles

### 1. CDP-First Integration
EATA uses Chrome DevTools Protocol (CDP) directly instead of MCP. This provides:
- Lower latency for tool invocations
- Direct access to Electron main process
- No external server dependencies
- Native support for Playwright's CDP connection

### 2. OpenAI-Compatible Architecture
All LLM providers are treated as OpenAI-compatible via `baseURL` variation. The `LLMProviderConfig` interface standardizes:
```typescript
interface LLMProviderConfig {
  id: string;
  name: string;
  type: 'openai-compatible';
  apiKey: string;
  baseURL: string;
  model: string;
}
```

### 3. Context Compaction
Long conversations are compacted automatically:
- Token threshold detection (default: 80% of context window)
- Cut point rules respect tool call/result pairing
- Split turn handling for oversized turns
- Cumulative file tracking across compactions
- Branch context preservation for /tree navigation

### 4. Tool-First Design
All agent capabilities (browser interaction, Electron control, code execution) are exposed through the `Tool` interface. The `ToolRegistry` provides:
- Registration with duplicate detection
- Parameter validation via Zod schemas
- Synchronous and streaming invocation
- Pre-built CDP tool sets

## Module Dependencies

```
graph.ts          → state.ts, nodes/*
tools/cdp.ts      → tools/types.ts
tools/registry.ts → tools/types.ts, tools/cdp.ts
llm/index.ts      → llm/provider.ts, llm/openai.ts, llm/anthropic.ts, llm/google.ts, llm/ollama.ts
compaction/*      → tools/types.ts (ToolRegistry)
config-manager.ts → llm-types.ts
provider-factory.ts → llm-types.ts
```

## Data Flow

### Test Execution Flow
```
1. User provides goal + targetAppPath
2. LangGraph initializes TestState
3. observe node: CDP snapshot of current state
4. plan node: LLM generates action plan
5. execute node: Tool invocation (CDP commands)
6. verify node: LLM evaluates result
7. Route based on verdict → retry, pass, fail, or escalate
8. report/abort node: Final state → END
```

### Compaction Flow
```
1. Token count exceeds threshold
2. findCutPoint() locates valid split location
3. splitTurnAtMessage() handles oversized turns
4. generateSummary() creates structured Pi-format summary
5. FileTracker.merge() accumulates file operations
6. Summary injected as system message
7. Conversation continues with compacted context
```

## Package Structure

```
packages/
├── agent-core/         # This package
│   ├── src/
│   │   ├── graph.ts          # LangGraph test graph
│   │   ├── state.ts          # TestState annotation
│   │   ├── nodes/            # Graph nodes (observe, plan, execute, verify, abort, report)
│   │   ├── tools/            # Tool system (cdp.ts, registry.ts, types.ts)
│   │   ├── llm/              # LLM providers (openai, anthropic, google, ollama)
│   │   ├── compaction/       # Context compaction
│   │   ├── prompt/           # Prompt templates
│   │   ├── sub-agents/       # Sub-agent implementations
│   │   ├── report-graph/     # Report generation graph
│   │   ├── llm-types.ts      # Provider configuration types
│   │   ├── config-manager.ts # Provider persistence
│   │   └── provider-factory.ts
│   └── docs/                 # Documentation (this directory)
├── electron-helper/          # Electron process helpers
├── launcher/                 # Electron launch + CDP discovery
├── shared-types/             # Zod schemas + TypeScript types
└── electron-bridge-mcp/      # Legacy MCP bridge (deprecated)
```

## Configuration

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | LLM API key | — |
| `OPENAI_BASE_URL` | LLM base URL | `https://api.openai.com/v1` |
| `LLM_MODEL` | Model name | `gpt-4o` |
| `PROVIDER_ID` | Use specific provider by ID | — |

### Provider Configuration
Stored at `~/.eata/providers.json`:
```json
{
  "version": 1,
  "providers": [
    {
      "id": "openai-1",
      "name": "OpenAI",
      "type": "openai-compatible",
      "apiKey": "sk-...",
      "baseURL": "https://api.openai.com/v1",
      "model": "gpt-4o"
    }
  ],
  "activeId": "openai-1"
}
```

## Extension Points

1. **Custom Tools**: Implement the `Tool` interface and register with `ToolRegistry`
2. **Custom Providers**: Add to `llm/provider.ts` and register in `llm/index.ts` factory
3. **Custom Nodes**: Create LangGraph nodes that operate on `TestState`
4. **Custom Compaction**: Override `CompactionTriggerConfig` or `CutPointConfig`
