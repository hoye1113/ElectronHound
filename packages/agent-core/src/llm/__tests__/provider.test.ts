import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { createProvider, createOpenAI, createAnthropic, createGoogle, createOllama } from '../index.js';
import type { ProviderConfig, LLMProvider } from '../provider.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockStreamResponse(chunks: unknown[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        const line = typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
        controller.enqueue(encoder.encode(line + '\n'));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

async function collectStream(iter: AsyncIterable<string>): Promise<string> {
  let result = '';
  for await (const chunk of iter) {
    result += chunk;
  }
  return result;
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

let fetchSpy: ReturnType<typeof vi.fn>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchSpy = vi.fn();
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── Factory function ─────────────────────────────────────────────────────────

describe('createProvider', () => {
  it('creates an OpenAI provider', () => {
    const p = createProvider({ provider: 'openai', model: 'gpt-4' });
    expect(p.name).toBe('openai');
    expect(p.model).toBe('gpt-4');
  });

  it('creates an Anthropic provider', () => {
    const p = createProvider({ provider: 'anthropic', model: 'claude-3-sonnet-20240229' });
    expect(p.name).toBe('anthropic');
    expect(p.model).toBe('claude-3-sonnet-20240229');
  });

  it('creates a Google provider', () => {
    const p = createProvider({ provider: 'google', model: 'gemini-pro' });
    expect(p.name).toBe('google');
    expect(p.model).toBe('gemini-pro');
  });

  it('creates an Ollama provider', () => {
    const p = createProvider({ provider: 'ollama', model: 'llama2' });
    expect(p.name).toBe('ollama');
    expect(p.model).toBe('llama2');
  });

  it('throws for unsupported provider type', () => {
    const config = { provider: 'unsupported' as unknown as ProviderConfig['provider'], model: 'x' };
    expect(() => createProvider(config)).toThrow('Unsupported provider: unsupported');
  });
});

// ── Interface conformance ────────────────────────────────────────────────────

describe('LLMProvider interface conformance', () => {
  const providers: Array<[string, LLMProvider]> = [
    ['OpenAI', createOpenAI({ model: 'gpt-4' })],
    ['Anthropic', createAnthropic({ model: 'claude-3' })],
    ['Google', createGoogle({ model: 'gemini-pro' })],
    ['Ollama', createOllama({ model: 'llama2' })],
  ];

  it.each(providers)('%s implements all required methods', (_label, provider) => {
    expect(typeof provider.generateText).toBe('function');
    expect(typeof provider.generateObject).toBe('function');
    expect(typeof provider.streamText).toBe('function');
    expect(typeof provider.name).toBe('string');
    expect(typeof provider.model).toBe('string');
  });
});

// ── OpenAI ───────────────────────────────────────────────────────────────────

describe('OpenAIProvider', () => {
  it('generateText returns content from response', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: 'Hello from OpenAI' } }] })
    );
    const p = createOpenAI({ model: 'gpt-4', apiKey: 'sk-test' });
    const result = await p.generateText('Hi');
    expect(result).toBe('Hello from OpenAI');
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-test');
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.model).toBe('gpt-4');
  });

  it('generateObject parses JSON and validates with schema', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: '{"name":"Alice","age":30}' } }] })
    );
    const schema = z.object({ name: z.string(), age: z.number() });
    const p = createOpenAI({ model: 'gpt-4', apiKey: 'sk-test' });
    const result = await p.generateObject<{ name: string; age: number }>('Give me a person', { schema });
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('generateObject throws on schema mismatch', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: '{"name":123}' } }] })
    );
    const schema = z.object({ name: z.string() });
    const p = createOpenAI({ model: 'gpt-4' });
    await expect(p.generateObject('test', { schema })).rejects.toThrow();
  });

  it('streamText yields SSE chunks', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      'data: [DONE]',
    ];
    fetchSpy.mockResolvedValueOnce(mockStreamResponse(chunks));
    const p = createOpenAI({ model: 'gpt-4', apiKey: 'sk-test' });
    const result = await collectStream(p.streamText('Hi'));
    expect(result).toBe('Hello world');
  });

  it('throws on API error', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ error: 'invalid key' }, 401)
    );
    const p = createOpenAI({ model: 'gpt-4', apiKey: 'bad-key' });
    await expect(p.generateText('test')).rejects.toThrow('OpenAI API error 401');
  });

  it('passes system, maxTokens, temperature, topP', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: 'ok' } }] })
    );
    const p = createOpenAI({ model: 'gpt-4' });
    await p.generateText('Hi', { system: 'You are helpful', maxTokens: 100, temperature: 0.7, topP: 0.9 });
    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    expect(body.max_tokens).toBe(100);
    expect(body.temperature).toBe(0.7);
    expect(body.top_p).toBe(0.9);
    const messages = body.messages as Array<{ role: string }>;
    expect(messages[0].role).toBe('system');
  });
});

// ── Anthropic ────────────────────────────────────────────────────────────────

describe('AnthropicProvider', () => {
  it('generateText returns text blocks from response', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ content: [{ type: 'text', text: 'Hi from Claude' }] })
    );
    const p = createAnthropic({ model: 'claude-3', apiKey: 'sk-ant-test' });
    const result = await p.generateText('Hi');
    expect(result).toBe('Hi from Claude');
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((opts.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-test');
    expect((opts.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01');
  });

  it('generateObject parses JSON and validates', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ content: [{ type: 'text', text: '{"name":"Bob","age":25}' }] })
    );
    const schema = z.object({ name: z.string(), age: z.number() });
    const p = createAnthropic({ model: 'claude-3', apiKey: 'sk-ant' });
    const result = await p.generateObject<{ name: string; age: number }>('person', { schema });
    expect(result).toEqual({ name: 'Bob', age: 25 });
  });

  it('streamText yields content_block_delta chunks', async () => {
    const chunks = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude"}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" says hi"}}',
    ];
    fetchSpy.mockResolvedValueOnce(mockStreamResponse(chunks));
    const p = createAnthropic({ model: 'claude-3', apiKey: 'sk-ant' });
    const result = await collectStream(p.streamText('Hi'));
    expect(result).toBe('Claude says hi');
  });

  it('throws on API error', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ error: { message: 'rate limited' } }, 429));
    const p = createAnthropic({ model: 'claude-3' });
    await expect(p.generateText('test')).rejects.toThrow('Anthropic API error 429');
  });
});

// ── Google ───────────────────────────────────────────────────────────────────

describe('GoogleProvider', () => {
  it('generateText returns text from candidates', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ candidates: [{ content: { parts: [{ text: 'Hello from Gemini' }] } }] })
    );
    const p = createGoogle({ model: 'gemini-pro', apiKey: 'ai-test-key' });
    const result = await p.generateText('Hi');
    expect(result).toBe('Hello from Gemini');
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain('models/gemini-pro:generateContent');
    expect(url).toContain('key=ai-test-key');
  });

  it('generateObject parses JSON and validates', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ candidates: [{ content: { parts: [{ text: '{"name":"Eve","age":28}' }] } }] })
    );
    const schema = z.object({ name: z.string(), age: z.number() });
    const p = createGoogle({ model: 'gemini-pro', apiKey: 'ai-key' });
    const result = await p.generateObject<{ name: string; age: number }>('person', { schema });
    expect(result).toEqual({ name: 'Eve', age: 28 });
  });

  it('streamText yields SSE chunks', async () => {
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Gemini "}]}}]}',
      'data: {"candidates":[{"content":{"parts":[{"text":"responds"}]}}]}',
    ];
    fetchSpy.mockResolvedValueOnce(mockStreamResponse(chunks));
    const p = createGoogle({ model: 'gemini-pro', apiKey: 'ai-key' });
    const result = await collectStream(p.streamText('Hi'));
    expect(result).toBe('Gemini responds');
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain('streamGenerateContent');
    expect(url).toContain('alt=sse');
  });

  it('throws on API error', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ error: { message: 'forbidden' } }, 403));
    const p = createGoogle({ model: 'gemini-pro', apiKey: 'bad-key' });
    await expect(p.generateText('test')).rejects.toThrow('Google API error 403');
  });
});

// ── Ollama ───────────────────────────────────────────────────────────────────

describe('OllamaProvider', () => {
  it('generateText returns message content', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ message: { content: 'Hello from Ollama' }, done: true })
    );
    const p = createOllama({ model: 'llama2' });
    const result = await p.generateText('Hi');
    expect(result).toBe('Hello from Ollama');
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:11434/api/chat');
  });

  it('generateObject uses format:json', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ message: { content: '{"name":"Dan","age":35}' }, done: true })
    );
    const schema = z.object({ name: z.string(), age: z.number() });
    const p = createOllama({ model: 'llama2' });
    const result = await p.generateObject<{ name: string; age: number }>('person', { schema });
    expect(result).toEqual({ name: 'Dan', age: 35 });
    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    expect(body.format).toBe('json');
  });

  it('streamText yields NDJSON lines', async () => {
    const chunks = [
      JSON.stringify({ message: { content: 'Stream ' }, done: false }),
      JSON.stringify({ message: { content: 'works' }, done: false }),
      JSON.stringify({ message: { content: '' }, done: true }),
    ];
    fetchSpy.mockResolvedValueOnce(mockStreamResponse(chunks));
    const p = createOllama({ model: 'llama2' });
    const result = await collectStream(p.streamText('Hi'));
    expect(result).toBe('Stream works');
  });

  it('uses custom baseUrl', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ message: { content: 'ok' }, done: true })
    );
    const p = createOllama({ model: 'llama2', baseUrl: 'http://custom:1234' });
    await p.generateText('Hi');
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe('http://custom:1234/api/chat');
  });

  it('passes num_predict, temperature, top_p in options', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ message: { content: 'ok' }, done: true })
    );
    const p = createOllama({ model: 'llama2' });
    await p.generateText('Hi', { system: 'Be concise', maxTokens: 50, temperature: 0.5, topP: 0.8 });
    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    const opts = body.options as Record<string, unknown>;
    expect(opts.num_predict).toBe(50);
    expect(opts.temperature).toBe(0.5);
    expect(opts.top_p).toBe(0.8);
    const messages = body.messages as Array<{ role: string }>;
    expect(messages[0].role).toBe('system');
  });

  it('throws on API error', async () => {
    fetchSpy.mockResolvedValueOnce(mockJsonResponse({ error: 'model not found' }, 404));
    const p = createOllama({ model: 'nonexistent' });
    await expect(p.generateText('test')).rejects.toThrow('Ollama API error 404');
  });
});
