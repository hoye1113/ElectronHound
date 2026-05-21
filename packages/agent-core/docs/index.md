# EATA Agent Core — Documentation Index

Welcome to the EATA (Electron App Testing Agent) core documentation. This index provides quick navigation to all documentation topics.

## Overview

EATA is an autonomous AI agent for testing Electron applications. Built on LangGraph, Playwright CDP, and the Vercel AI SDK, it observes, plans, executes, and verifies test actions through natural language goals.

## Quick Start

- **[Quick Start Guide](quickstart.md)** — Get up and running in minutes
- **[Architecture Overview](architecture.md)** — Understand the system design

## Core Modules

- **[Agent Loop](architecture.md#agent-loop)** — LangGraph-based test graph
- **[Tool Interface](tools.md)** — Tool system and registry
- **[LLM Interface](llm.md)** — Multi-provider LLM abstraction
- **[Providers](providers.md)** — OpenAI-compatible provider configuration
- **[Session Management](sessions.md)** — Session persistence and lifecycle

## Compaction System

The compaction system manages long conversations by summarizing context. Based on the Pi compaction architecture.

- **[Compaction Overview](compaction.md)** — Full compaction strategy
- **[Cut Point Rules](cut-point.md)** — Where to cut conversations for compaction
- **[Split Turn Detection](split-turn.md)** — Handle oversized turns
- **[Summary Generation](summary-generation.md)** — Structured summary format
- **[Branch Summarization](branch-summarization.md)** — /tree navigation context
- **[File Tracking](file-tracking.md)** — Cumulative file operation tracking

## Integration

- **[Electron Integration](electron.md)** — Electron CDP tools and bridge
- **[Playwright CDP Integration](playwright.md)** — Browser automation via CDP
- **[API Reference](api.md)** — Complete public API documentation

## Document Map

| Document | Description | Focus |
|----------|-------------|-------|
| [Compaction](compaction.md) | Complete compaction strategy | Token management |
| [Sessions](sessions.md) | Session management & persistence | State lifecycle |
| [Tools](tools.md) | Tool interface & 12 CDP tools | Tool system |
| [Providers](providers.md) | Multi-provider LLM configuration | LLM config |
| [Electron](electron.md) | Electron CDP integration | App control |
| [Playwright](playwright.md) | Playwright CDP integration | Browser automation |
| [Architecture](architecture.md) | Overall system architecture | System design |
| [Quick Start](quickstart.md) | Getting started guide | Onboarding |
| [API Reference](api.md) | Public API reference | Reference |
| [LLM Interface](llm.md) | LLM provider interface | Provider abstraction |
| [Branch Summarization](branch-summarization.md) | Branch context preservation | /tree navigation |
| [File Tracking](file-tracking.md) | Cumulative file operations | File context |
| [Cut Point](cut-point.md) | Conversation cut rules | Compaction |
| [Split Turn](split-turn.md) | Split turn detection | Compaction |
| [Summary Generation](summary-generation.md) | Structured summary generation | Compaction |
| [Index](index.md) | This document | Navigation |

## Key Concepts

### Agent Loop
The agent loop follows an **observe → plan → execute → verify** cycle using LangGraph state graphs. The graph supports conditional routing for retry, escalation, and abort scenarios.

### CDP Architecture
EATA uses Chrome DevTools Protocol (CDP) instead of MCP for direct browser/Electron integration. 12 CDP tools cover:
- **Browser tools (7)**: snapshot, click, type, navigate, press_key, hover, drag
- **Electron tools (5)**: launch, close, execute_main, trigger_ipc, mock_dialog

### Compaction
When conversations exceed the context window, the compaction system:
1. Checks token thresholds via `CompactionTrigger`
2. Finds valid cut points respecting tool call/result pairs
3. Detects split turns (oversized single turns)
4. Generates structured summaries with file tracking
5. Supports branch context preservation for /tree navigation

### Multi-Provider LLM
All OpenAI-compatible providers (OpenAI, DeepSeek, Qwen, Groq) share the same interface. Configuration is persisted to `~/.eata/providers.json`.

## Reading Order

For new users, we recommend this reading order:

1. **[Quick Start](quickstart.md)** — Get a working test running
2. **[Architecture](architecture.md)** — Understand the big picture
3. **[Tools](tools.md)** — Learn about the 12 CDP tools
4. **[Providers](providers.md)** — Configure your LLM
5. **[Compaction](compaction.md)** — Understand long-session handling

For contributors:

1. **[Architecture](architecture.md)** — System design overview
2. **[API Reference](api.md)** — Complete public API
3. **Source**: `src/graph.ts`, `src/tools/cdp.ts`, `src/compaction/`

## FAQ

### How does EATA differ from running Playwright tests directly?
EATA uses an AI agent to understand the app's behavior and adapt test strategies. Playwright tests are static scripts; EATA tests are goal-oriented and self-correcting.

### Can I use any OpenAI-compatible provider?
Yes. Any provider with a `/chat/completions` endpoint that supports `stream: true` and `response_format: json_object` works. Configure via `baseURL`.

### What happens when a session exceeds the context window?
The compaction system automatically summarizes older messages, preserving only recent context. File operations are tracked cumulatively across compaction cycles.

### How do I add a custom tool?
Implement the `Tool` interface (name, description, schema, invoke) and register it with the `ToolRegistry`. See [tools.md](tools.md) for a full example.

### Is Electron required?
No. EATA can test any browser-accessible application via CDP. Electron-specific tools (`cdp_launch`, `cdp_execute_main`, etc.) are optional.

## Troubleshooting

### Tool invocation fails
- Check that the CDP client is connected: `client.isConnected()`
- Verify the selector matches an element in the current page
- Increase the `timeout` parameter for slow-loading elements

### Compaction produces poor summaries
- Review the `keepRecentTokens` setting (default: 20000)
- Ensure messages have accurate `tokenCount` fields
- Check that tool call/result pairs are not being split

### LLM provider errors
- Verify the API key and base URL are correct
- Check rate limits with the provider's documentation
- Ensure the model name matches the provider's supported models

## Conventions

- All tools implement the `Tool` interface with `name`, `description`, `schema`, and `invoke()`
- Tool results follow the `ToolResult` interface: `{ success, data?, error?, metadata? }`
- CDP tools extend `CDPTool` which holds a `CDPContext` reference
- Summaries use the Pi format: Goal, Progress, Key Decisions, Next Steps, Critical Context, File Tracking
