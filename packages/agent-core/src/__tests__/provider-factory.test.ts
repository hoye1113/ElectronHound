import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch used by all LLM providers
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { createProvider } from '../llm/index.js';
import type { ProviderConfig } from '../llm/provider.js';

describe('createProvider (unified factory)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('creates OpenAI provider', () => {
    const provider = createProvider({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
    });
    expect(provider).toBeDefined();
    expect(provider.name).toBe('openai');
    expect(provider.model).toBe('gpt-4o');
  });

  it('creates Anthropic provider', () => {
    const provider = createProvider({
      provider: 'anthropic',
      model: 'claude-3-opus',
      apiKey: 'sk-ant-test',
    });
    expect(provider.name).toBe('anthropic');
    expect(provider.model).toBe('claude-3-opus');
  });

  it('creates Google provider', () => {
    const provider = createProvider({
      provider: 'google',
      model: 'gemini-pro',
      apiKey: 'google-key',
    });
    expect(provider.name).toBe('google');
    expect(provider.model).toBe('gemini-pro');
  });

  it('creates Ollama provider', () => {
    const provider = createProvider({
      provider: 'ollama',
      model: 'llama2',
    });
    expect(provider.name).toBe('ollama');
    expect(provider.model).toBe('llama2');
  });

  it('throws for unsupported provider type', () => {
    expect(() =>
      createProvider({ provider: 'unknown' as any, model: 'x' }),
    ).toThrow('Unsupported provider');
  });

  it('passes baseUrl to OpenAI provider', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'hello' } }] }),
    });

    const provider = createProvider({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test',
      baseUrl: 'https://custom.api.com/v1',
    });

    await provider.generateText('test');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://custom.api.com/v1/chat/completions',
      expect.anything(),
    );
  });

  it('passes baseUrl to Anthropic provider', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: 'text', text: 'hi' }] }),
    });

    const provider = createProvider({
      provider: 'anthropic',
      model: 'claude-3',
      apiKey: 'sk-ant',
      baseUrl: 'https://proxy.anthropic.com',
    });

    await provider.generateText('test');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://proxy.anthropic.com/v1/messages',
      expect.anything(),
    );
  });
});
