# Multi-Provider LLM Configuration

EATA v0.3 supports multiple OpenAI-compatible LLM providers. All providers share a unified interface through `baseURL` variation — the same `createOpenAI()` function works with OpenAI, DeepSeek, Qwen, Groq, and any other OpenAI-compatible API.

## Supported Providers

| Provider | Type | Base URL | Example Model |
|----------|------|----------|---------------|
| OpenAI | `openai-compatible` | `https://api.openai.com/v1` | `gpt-4o` |
| DeepSeek | `openai-compatible` | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Qwen (通义千问) | `openai-compatible` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Groq | `openai-compatible` | `https://api.groq.com/openai/v1` | `llama-3.1-70b-versatile` |

## Provider Configuration Type

All providers use the `LLMProviderConfig` interface:

```typescript
interface LLMProviderConfig {
  id: string;              // Unique provider identifier
  name: string;            // Display name
  type: 'openai-compatible';
  apiKey: string;          // API key
  baseURL: string;         // API base URL
  model: string;           // Model name
  enabled?: boolean;       // Whether this provider is active
}
```

## Configuration Persistence

Provider configs are stored at `~/.eata/providers.json`:

```json
{
  "version": 1,
  "providers": [
    {
      "id": "openai-prod",
      "name": "OpenAI Production",
      "type": "openai-compatible",
      "apiKey": "sk-...",
      "baseURL": "https://api.openai.com/v1",
      "model": "gpt-4o"
    },
    {
      "id": "deepseek-test",
      "name": "DeepSeek Test",
      "type": "openai-compatible",
      "apiKey": "sk-deepseek-...",
      "baseURL": "https://api.deepseek.com/v1",
      "model": "deepseek-chat"
    }
  ],
  "activeId": "openai-prod",
  "taskLevel": {
    "task-001": "deepseek-test"
  }
}
```

## Configuration API

### Load Providers

```typescript
import { loadProvidersConfig } from '@eata/agent-core';

const config = await loadProvidersConfig();
// config.providers: LLMProviderConfig[]
// config.activeId: string
```

### Add Provider

```typescript
import { addProvider } from '@eata/agent-core';

await addProvider({
  id: 'qwen-1',
  name: '通义千问 (Qwen)',
  type: 'openai-compatible',
  apiKey: 'sk-...',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen-plus'
});
```

### Update Provider

```typescript
import { updateProvider } from '@eata/agent-core';

await updateProvider('qwen-1', {
  model: 'qwen-turbo',
  name: '通义千问 Turbo'
});
```

### Delete Provider

```typescript
import { deleteProvider } from '@eata/agent-core';

await deleteProvider('qwen-1');
```

### Set Active Provider

```typescript
import { setActiveProvider } from '@eata/agent-core';

await setActiveProvider('openai-prod');
```

### Get Active Provider

```typescript
import { getActiveProviderConfig } from '@eata/agent-core';

const active = await getActiveProviderConfig();
// active: LLMProviderConfig | null
```

## Built-in Templates

EATA ships with 4 built-in provider templates:

```typescript
import { BUILTIN_TEMPLATES } from '@eata/agent-core';

// Templates have placeholder API keys (e.g., 'sk-', 'gsk_')
BUILTIN_TEMPLATES.forEach((t) => console.log(t.name, t.baseURL));
// OpenAI        https://api.openai.com/v1
// DeepSeek      https://api.deepseek.com/v1
// 通义千问 (Qwen) https://dashscope.aliyuncs.com/compatible-mode/v1
// Groq          https://api.groq.com/openai/v1
```

## Task-Level Provider Selection

EATA supports selecting different providers per task. This enables:
- A/B testing the same task against multiple models
- Using specialized models for specific test types
- Cost optimization by routing simple tests to cheaper models

```typescript
// In providers.json:
{
  "taskLevel": {
    "task-e2e-001": "openai-prod",
    "task-smoke-test": "deepseek-test"
  }
}
```

## Provider Factory

The `createProviderInstance()` function creates a provider from configuration:

```typescript
import { createProviderInstance } from '@eata/agent-core';

const config = await getActiveProviderConfig();
const client = createProviderInstance(config);
// client is an LLM client instance with the configured model and baseURL
```

## Environment Variables

For CLI/worker mode, providers can be configured via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | API key (fallback) | — |
| `OPENAI_BASE_URL` | Base URL (fallback) | `https://api.openai.com/v1` |
| `LLM_MODEL` | Model name | `gpt-4o` |
| `PROVIDER_ID` | Use a specific provider by ID | — |

## LLM Provider Interface

All providers implement the `LLMProvider` interface:

```typescript
interface LLMProvider {
  readonly name: string;
  readonly model: string;

  generateText(prompt: string, options?: GenerateOptions): Promise<string>;
  generateObject<T>(prompt: string, options?: GenerateObjectOptions): Promise<T>;
  streamText(prompt: string, options?: GenerateOptions): AsyncIterable<string>;
}

interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  system?: string;
}

interface GenerateObjectOptions extends GenerateOptions {
  schema: ZodSchema<any>;
}
```

### Usage

```typescript
import { createProvider } from '@eata/agent-core';

const provider = createProvider({
  provider: 'openai',
  model: 'gpt-4o',
  apiKey: 'sk-...'
});

// Generate text
const text = await provider.generateText('What is 2+2?');

// Generate structured output
import { z } from 'zod';
const result = await provider.generateObject('What is the capital of France?', {
  schema: z.object({ capital: z.string() })
});

// Stream text
for await (const chunk of provider.streamText('Tell me a story')) {
  process.stdout.write(chunk);
}
```
