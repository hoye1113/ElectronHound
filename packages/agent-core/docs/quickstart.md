# Quick Start

Get started with EATA agent-core in minutes.

## Installation

EATA uses pnpm as the package manager. Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd eata
pnpm install
```

The `@eata/agent-core` package is located at `packages/agent-core/`.

## Development Server

Start the dashboard and API server:

```bash
pnpm dev
```

- **Dashboard**: http://localhost:5173
- **Server API**: http://localhost:3000

## Running Tests

```bash
# Run all tests
pnpm test

# Run agent-core tests
pnpm test -- --project "@eata/agent-core"

# Typecheck
pnpm run --filter "@eata/agent-core" typecheck
```

## Basic Usage

### 1. Configure an LLM Provider

EATA supports any OpenAI-compatible provider. Configure via environment variables:

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://api.openai.com/v1"
export LLM_MODEL="gpt-4o"
```

Or add a provider via the Dashboard Settings page: http://localhost:5173/settings

### 2. Create a Simple Test

```typescript
import { createTestGraph, runTest } from '@eata/agent-core';

// Create the test graph
const graph = createTestGraph();

// Run a test against an Electron app
const result = await runTest({
  goal: 'Click the login button and verify the welcome screen appears',
  targetAppPath: '/path/to/electron-app',
  llmModel: 'gpt-4o',
  maxSteps: 20,
});

console.log('Status:', result.status);
console.log('History:', result.history);
```

### 3. Using CDP Tools Directly

```typescript
import { CDPClient, createCDPTools, ToolRegistry } from '@eata/agent-core';

// Create CDP client
const client = new CDPClient();

// Connect to an Electron app
const session = await client.connect({
  port: 9222,
  targetType: 'electron'
});

// Create and use tools
const registry = ToolRegistry.withCDP(client);

// Take a snapshot
const snapshot = await registry.invoke('browser_snapshot', {
  format: 'aria'
});

// Click an element
await registry.invoke('browser_click', {
  selector: '[data-testid="submit-button"]'
});

// Clean up
await client.disconnect();
```

### 4. Multi-Provider Configuration

```typescript
import { addProvider, setActiveProvider } from '@eata/agent-core';

// Add a DeepSeek provider
await addProvider({
  id: 'deepseek-1',
  name: 'DeepSeek',
  type: 'openai-compatible',
  apiKey: 'sk-deepseek-...',
  baseURL: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat'
});

// Set as default
await setActiveProvider('deepseek-1');
```

## Supported Providers

| Provider | Base URL | Example Model |
|----------|----------|---------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-70b-versatile` |

## Project Structure

```
eata/
├── apps/
│   ├── dashboard/    React UI (Vite + Tailwind + Zustand)
│   └── server/       Fastify HTTP server + SQLite
├── packages/
│   ├── agent-core/   Agent loop runtime, LLM providers, test execution nodes
│   ├── electron-bridge-mcp/  MCP server for Playwright + Electron
│   ├── electron-helper/      Electron process helpers
│   ├── launcher/             Electron launch + CDP discovery
│   └── shared-types/         Zod schemas + TypeScript types
└── tests/            Integration and E2E tests
```

## Next Steps

- **[Architecture](architecture.md)** — Understand the agent loop and module design
- **[Tool Interface](tools.md)** — Learn how tools work and how to create custom ones
- **[Providers](providers.md)** — Configure multiple LLM providers
- **[Electron Integration](electron.md)** — Understand Electron CDP tools
- **[Compaction](compaction.md)** — Learn how context compaction works
