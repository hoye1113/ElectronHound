# EATA — Electron App Testing Agent

EATA (Electron App Testing Agent) is an open-source, autonomous AI agent that tests Electron applications through natural language goals. Built with Playwright, custom LLM providers, and a self-built Agent Loop runtime, EATA observes, plans, executes, and verifies — producing detailed test reports with screenshots, accessibility analysis, and structured feedback.

## Quick Start

```bash
pnpm install
pnpm dev
```

- **Dashboard**: http://localhost:5173
- **Server API**: http://localhost:3000

## Multi-Provider LLM Configuration (v0.3)

EATA v0.3 supports multiple OpenAI-compatible LLM providers. Configure them via the Dashboard Settings page.

### Supported Providers

| Provider | Base URL | Example Models |
|----------|----------|----------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o`, `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 (Qwen) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-70b-versatile` |

### Adding a Provider

1. Open Dashboard Settings: http://localhost:5173/settings
2. Click **+ Add New Provider**
3. Choose a quick template (OpenAI / DeepSeek / Qwen / Groq) or fill in manually
4. Enter your API key
5. Click **Add Provider**
6. Optionally set as the default provider using ★ Set Default

### Task-Level Provider Selection

When creating a task, you can select a specific LLM provider. This allows:
- Running the same test against multiple models for A/B comparison
- Using specialized models for specific types of tasks
- Cost optimization by choosing cheaper models for simple tests

### API Usage

```bash
# List all providers
GET /api/providers

# Test provider connection
POST /api/providers/:id/test

# Set default provider
POST /api/providers/:id/activate
```

## Configuration

Provider configs are stored at `~/.eata/providers.json`.

Environment variables (for CLI / worker mode):

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | LLM API key (fallback) |
| `OPENAI_BASE_URL` | LLM base URL (fallback) |
| `LLM_MODEL` | Model name (default: `gpt-4o`) |
| `PROVIDER_ID` | Use a specific provider by ID |

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

## Development

```bash
# Run tests
pnpm test

# Run specific package tests
pnpm test -- --project "@eata/agent-core"

# Typecheck
pnpm run --filter "@eata/agent-core" typecheck
```

## License

MIT
