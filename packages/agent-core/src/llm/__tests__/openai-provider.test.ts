import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { createOpenAIProvider } from '../openai-provider.js';
import type { LLMProviderConfig } from '../../llm-types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const TEST_CONFIG: LLMProviderConfig = {
  id: 'test',
  name: 'Test Provider',
  type: 'openai-compatible',
  apiKey: 'sk-test-key',
  baseURL: 'https://api.test.com/v1',
  model: 'test-model',
};

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

// ── generateText ─────────────────────────────────────────────────────────────

describe('openai-provider generateText', () => {
  it('returns text content from response', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: 'Hello world' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    const result = await provider.generateText({ prompt: 'Hi' });
    expect(result.text).toBe('Hello world');
  });

  it('sends correct request to chat/completions endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    await provider.generateText({ prompt: 'Test' });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test.com/v1/chat/completions');
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-test-key');
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(opts.method).toBe('POST');

    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.model).toBe('test-model');
  });

  it('includes system prompt in messages when provided', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    await provider.generateText({ prompt: 'Hi', system: 'You are helpful' });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as Record<string, unknown>;
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: 'system', content: 'You are helpful' });
    expect(messages[1]).toEqual({ role: 'user', content: 'Hi' });
  });

  it('omits system message when not provided', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    await provider.generateText({ prompt: 'Hi' });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as Record<string, unknown>;
    const messages = body.messages as Array<{ role: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
  });

  it('defaults max_tokens to 1000 for generateText', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    await provider.generateText({ prompt: 'Hi' });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.max_tokens).toBe(1000);
  });

  it('uses custom maxTokens when provided', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    await provider.generateText({ prompt: 'Hi', maxTokens: 500 });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.max_tokens).toBe(500);
  });

  it('strips <think>...</think> reasoning tags from text output', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: '<think>Let me think...</think>The answer is 42' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    const result = await provider.generateText({ prompt: 'What is the answer?' });
    expect(result.text).toBe('The answer is 42');
  });

  it('strips ```json ... ``` markdown fences from text output', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: '```json\n{"key":"value"}\n```' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    const result = await provider.generateText({ prompt: 'Give me JSON' });
    expect(result.text).toBe('{"key":"value"}');
  });

  it('returns empty string when content is missing', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: {} }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    const result = await provider.generateText({ prompt: 'Hi' });
    expect(result.text).toBe('');
  });
});

// ── generateObject ───────────────────────────────────────────────────────────

describe('openai-provider generateObject', () => {
  it('sends request with response_format json_object', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: '{"name":"Alice"}' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    await provider.generateObject({ prompt: 'Give me a person', schema: { parse: (v: unknown) => v } });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('parses JSON and returns object', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: '{"name":"Alice","age":30}' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    const result = await provider.generateObject<{ name: string; age: number }>({
      prompt: 'person',
      schema: { parse: (v: unknown) => v as { name: string; age: number } },
    });
    expect(result.object).toEqual({ name: 'Alice', age: 30 });
  });

  it('validates with schema.parse()', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: '{"name":"Alice","age":30}' } }] }),
    );
    const schema = z.object({ name: z.string(), age: z.number() });
    const provider = createOpenAIProvider(TEST_CONFIG);
    const result = await provider.generateObject<{ name: string; age: number }>({
      prompt: 'person',
      schema,
    });
    expect(result.object).toEqual({ name: 'Alice', age: 30 });
  });

  it('throws on schema mismatch', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: '{"name":123}' } }] }),
    );
    const schema = z.object({ name: z.string() });
    const provider = createOpenAIProvider(TEST_CONFIG);
    await expect(
      provider.generateObject({ prompt: 'test', schema }),
    ).rejects.toThrow();
  });

  it('strips <think>...``` tags before JSON parsing', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: '<think>Analyzing...</think>{"key":"value"}' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    const result = await provider.generateObject({
      prompt: 'test',
      schema: { parse: (v: unknown) => v },
    });
    expect(result.object).toEqual({ key: 'value' });
  });

  it('strips ```json fences before JSON parsing', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: '```json\n{"key":"value"}\n```' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    const result = await provider.generateObject({
      prompt: 'test',
      schema: { parse: (v: unknown) => v },
    });
    expect(result.object).toEqual({ key: 'value' });
  });

  it('strips ``` fences without json tag before JSON parsing', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: '```\n{"key":"value"}\n```' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    const result = await provider.generateObject({
      prompt: 'test',
      schema: { parse: (v: unknown) => v },
    });
    expect(result.object).toEqual({ key: 'value' });
  });

  it('defaults max_tokens to 2000 for generateObject', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: '{}' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    await provider.generateObject({ prompt: 'test', schema: { parse: (v: unknown) => v } });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.max_tokens).toBe(2000);
  });

  it('uses custom maxTokens when provided', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: '{}' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    await provider.generateObject({ prompt: 'test', schema: { parse: (v: unknown) => v }, maxTokens: 3000 });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.max_tokens).toBe(3000);
  });

  it('includes system prompt in messages when provided', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: '{}' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    await provider.generateObject({ prompt: 'test', system: 'Be structured', schema: { parse: (v: unknown) => v } });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as Record<string, unknown>;
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({ role: 'system', content: 'Be structured' });
    expect(messages[1]).toEqual({ role: 'user', content: 'test' });
  });

  it('returns empty object when content is empty or missing', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: '' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    const result = await provider.generateObject({
      prompt: 'test',
      schema: { parse: (v: unknown) => v },
    });
    expect(result.object).toEqual({});
  });
});

// ── Error handling ───────────────────────────────────────────────────────────

describe('openai-provider error handling', () => {
  it('throws on non-OK response with status code', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ error: { message: 'Unauthorized' } }, 401),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    await expect(provider.generateText({ prompt: 'test' })).rejects.toThrow('LLM API error: 401');
  });

  it('includes error text body in thrown message', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Rate limit exceeded', { status: 429, statusText: 'Too Many Requests' }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    await expect(provider.generateText({ prompt: 'test' })).rejects.toThrow('429');
  });

  it('generateObject also throws on non-OK response', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ error: 'forbidden' }, 403),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    await expect(
      provider.generateObject({ prompt: 'test', schema: { parse: (v: unknown) => v } }),
    ).rejects.toThrow('LLM API error: 403');
  });

  it('throws on invalid JSON in response content', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: 'not json at all' } }] }),
    );
    const provider = createOpenAIProvider(TEST_CONFIG);
    await expect(
      provider.generateObject({ prompt: 'test', schema: { parse: (v: unknown) => v } }),
    ).rejects.toThrow();
  });
});

// ── baseURL normalization ────────────────────────────────────────────────────

describe('openai-provider baseURL normalization', () => {
  it('strips trailing slashes from baseURL', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockJsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    );
    const config: LLMProviderConfig = { ...TEST_CONFIG, baseURL: 'https://api.test.com/v1///' };
    const provider = createOpenAIProvider(config);
    await provider.generateText({ prompt: 'Hi' });

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe('https://api.test.com/v1/chat/completions');
  });
});
