# LLM Interface

EATA provides a unified multi-provider LLM interface. All providers (OpenAI, Anthropic, Google, Ollama) implement the same `LLMProvider` interface, enabling easy switching between models.

## LLMProvider Interface

```typescript
interface LLMProvider {
  readonly name: string;
  readonly model: string;

  generateText(prompt: string, options?: GenerateOptions): Promise<string>;
  generateObject<T>(prompt: string, options?: GenerateObjectOptions): Promise<T>;
  streamText(prompt: string, options?: GenerateOptions): AsyncIterable<string>;
}
```

### Methods

| Method | Description |
|--------|-------------|
| `generateText()` | Generate a text response from the LLM |
| `generateObject()` | Generate a structured object validated against a Zod schema |
| `streamText()` | Stream text responses chunk by chunk |

### GenerateOptions

```typescript
interface GenerateOptions {
  maxTokens?: number;     // Maximum tokens in response
  temperature?: number;   // Sampling temperature (0-2)
  topP?: number;          // Nucleus sampling parameter
  system?: string;        // System prompt
}
```

### GenerateObjectOptions

```typescript
interface GenerateObjectOptions extends GenerateOptions {
  schema: ZodSchema<any>; // Zod schema for structured output
}
```

## Provider Types

```typescript
type ProviderType = 'openai' | 'anthropic' | 'google' | 'ollama';

interface ProviderConfig {
  provider: ProviderType;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}
```

## Factory Function

### `createProvider(config)`

Create any provider from a unified config:

```typescript
import { createProvider } from '@eata/agent-core';

const provider = createProvider({
  provider: 'openai',
  model: 'gpt-4o',
  apiKey: 'sk-...',
  baseUrl: 'https://api.openai.com/v1'
});
```

## OpenAI Provider

Handles all OpenAI-compatible APIs (OpenAI, DeepSeek, Qwen, Groq).

```typescript
import { createOpenAI } from '@eata/agent-core';

const openai = createOpenAI({
  model: 'gpt-4o',
  apiKey: 'sk-...',
  baseUrl: 'https://api.openai.com/v1'
});

// Text generation
const text = await openai.generateText('Hello, world!');

// Structured output
import { z } from 'zod';
const obj = await openai.generateObject('What is 2+2?', {
  schema: z.object({ answer: z.number() })
});

// Streaming
for await (const chunk of openai.streamText('Tell me a story')) {
  process.stdout.write(chunk);
}
```

**Default baseUrl:** `https://api.openai.com/v1`

### Supported Models via OpenAI-Compatible APIs

| Provider | baseUrl | Models |
|----------|---------|--------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat`, `deepseek-coder` |
| Qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus`, `qwen-turbo` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-70b-versatile`, `mixtral-8x7b-32768` |

## Anthropic Provider

```typescript
import { createAnthropic } from '@eata/agent-core';

const anthropic = createAnthropic({
  model: 'claude-sonnet-4-20250514',
  apiKey: 'sk-ant-...'
});
```

## Google Provider

```typescript
import { createGoogle } from '@eata/agent-core';

const google = createGoogle({
  model: 'gemini-1.5-pro',
  apiKey: 'AIza...'
});
```

## Ollama Provider

For local LLM inference:

```typescript
import { createOllama } from '@eata/agent-core';

const ollama = createOllama({
  model: 'llama3:8b',
  baseUrl: 'http://localhost:11434/api'
});
```

## OpenAI-Compatible Configuration (EATA v0.3)

In EATA v0.3, all OpenAI-compatible providers use a simplified config:

```typescript
interface LLMProviderConfig {
  id: string;
  name: string;
  type: 'openai-compatible';
  apiKey: string;
  baseURL: string;
  model: string;
  enabled?: boolean;
}
```

This is the configuration format stored in `~/.eata/providers.json`.

## Streaming

All providers support streaming via `streamText()`:

```typescript
const provider = createProvider({
  provider: 'openai',
  model: 'gpt-4o',
  apiKey: 'sk-...'
});

for await (const chunk of provider.streamText('Generate a story about testing')) {
  process.stdout.write(chunk);
}
```

The implementation uses native `fetch` with `ReadableStream` for efficient streaming.

## Error Handling

Provider methods throw on API errors:

```typescript
try {
  const text = await provider.generateText('...');
} catch (err) {
  if (err.message.includes('401')) {
    console.error('Invalid API key');
  } else if (err.message.includes('429')) {
    console.error('Rate limited');
  }
}
```

## Provider Factory for CDP Tools

When used with the agent loop, providers are created via the config manager:

```typescript
import { getActiveProviderConfig, createProviderInstance } from '@eata/agent-core';

const config = await getActiveProviderConfig();
if (config) {
  const provider = createProviderInstance(config);
  // provider is ready to use
}
```

## Complete Example

```typescript
import { createProvider } from '@eata/agent-core';
import { z } from 'zod';

async function demoMultiProvider() {
  // 1. Create OpenAI provider
  const openai = createProvider({
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY
  });

  // 2. Generate text
  const greeting = await openai.generateText('Say hello in 5 words', {
    maxTokens: 50,
    temperature: 0.7
  });
  console.log('Greeting:', greeting);

  // 3. Generate structured output
  const result = await openai.generateObject(
    'Extract the name and age from: "John is 30 years old"',
    {
      schema: z.object({
        name: z.string(),
        age: z.number()
      })
    }
  );
  console.log('Structured:', result);

  // 4. Streaming
  console.log('Streaming:');
  for await (const chunk of openai.streamText('Count from 1 to 5')) {
    process.stdout.write(chunk);
  }
}
```
