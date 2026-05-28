import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LLMProvider } from '../types.js';
import type { LLMProviderConfig } from '../../llm-types.js';

// ── Mock createOpenAIProvider ─────────────────────────────────────────────────
// We mock the openai-provider module so all adapter functions receive a
// predictable LLMProvider without hitting real fetch.

const mockGenerateObject = vi.fn();
const mockGenerateText = vi.fn();

vi.mock('../openai-provider.js', () => ({
  createOpenAIProvider: vi.fn((config: LLMProviderConfig) => ({
    _config: config,
    generateObject: mockGenerateObject,
    generateText: mockGenerateText,
  })),
}));

// Import after vi.mock so the mock is in place.
import {
  createLLMProviderAdapter,
  createLLMProviderAdapterForProvider,
  createProviderInstance,
  testProviderConnection,
  getGenerateObjectForProvider,
} from '../adapter.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const sampleConfig: LLMProviderConfig = {
  id: 'test-provider',
  name: 'Test Provider',
  type: 'openai-compatible',
  apiKey: 'sk-test-key',
  baseURL: 'https://example.com/v1',
  model: 'test-model',
};

// ── Setup / Teardown ─────────────────────────────────────────────────────────

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  // Restore env to a clean baseline before each test.
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// ── createLLMProviderAdapter ─────────────────────────────────────────────────

describe('createLLMProviderAdapter', () => {
  it('returns null when OPENAI_API_KEY is not set', () => {
    delete process.env.OPENAI_API_KEY;
    const result = createLLMProviderAdapter();
    expect(result).toBeNull();
  });

  it('returns null when OPENAI_API_KEY is an empty string', () => {
    process.env.OPENAI_API_KEY = '';
    const result = createLLMProviderAdapter();
    expect(result).toBeNull();
  });

  it('creates provider using env vars with defaults', () => {
    process.env.OPENAI_API_KEY = 'sk-env-key';
    delete process.env.OPENAI_BASE_URL;
    delete process.env.LLM_MODEL;

    const provider = createLLMProviderAdapter();
    expect(provider).not.toBeNull();

    const config = (provider as unknown as { _config: LLMProviderConfig })._config;
    expect(config.apiKey).toBe('sk-env-key');
    expect(config.baseURL).toBe('https://api.openai.com/v1');
    expect(config.model).toBe('gpt-4o');
    expect(config.id).toBe('env-default');
    expect(config.name).toBe('Environment Default');
    expect(config.type).toBe('openai-compatible');
  });

  it('uses OPENAI_BASE_URL from env when set', () => {
    process.env.OPENAI_API_KEY = 'sk-key';
    process.env.OPENAI_BASE_URL = 'https://custom.api.com/v1';

    const provider = createLLMProviderAdapter();
    const config = (provider as unknown as { _config: LLMProviderConfig })._config;
    expect(config.baseURL).toBe('https://custom.api.com/v1');
  });

  it('uses LLM_MODEL from env when set', () => {
    process.env.OPENAI_API_KEY = 'sk-key';
    process.env.LLM_MODEL = 'gpt-4-turbo';

    const provider = createLLMProviderAdapter();
    const config = (provider as unknown as { _config: LLMProviderConfig })._config;
    expect(config.model).toBe('gpt-4-turbo');
  });

  it('config.model overrides LLM_MODEL env var', () => {
    process.env.OPENAI_API_KEY = 'sk-key';
    process.env.LLM_MODEL = 'gpt-4-turbo';

    const provider = createLLMProviderAdapter({ model: 'gpt-4o-mini' });
    const config = (provider as unknown as { _config: LLMProviderConfig })._config;
    expect(config.model).toBe('gpt-4o-mini');
  });

  it('config.model overrides default model when LLM_MODEL is not set', () => {
    process.env.OPENAI_API_KEY = 'sk-key';
    delete process.env.LLM_MODEL;

    const provider = createLLMProviderAdapter({ model: 'claude-3-opus' });
    const config = (provider as unknown as { _config: LLMProviderConfig })._config;
    expect(config.model).toBe('claude-3-opus');
  });

  it('returns null with empty config object when OPENAI_API_KEY is not set', () => {
    delete process.env.OPENAI_API_KEY;
    const result = createLLMProviderAdapter({ model: 'gpt-4o' });
    expect(result).toBeNull();
  });
});

// ── createLLMProviderAdapterForProvider ──────────────────────────────────────

describe('createLLMProviderAdapterForProvider', () => {
  it('always returns a provider from the given config', () => {
    const provider = createLLMProviderAdapterForProvider(sampleConfig);
    expect(provider).not.toBeNull();
    expect(provider).toBeDefined();
  });

  it('passes config through to createOpenAIProvider', () => {
    const provider = createLLMProviderAdapterForProvider(sampleConfig);
    const config = (provider as unknown as { _config: LLMProviderConfig })._config;
    expect(config).toEqual(sampleConfig);
  });

  it('does not depend on environment variables', () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.LLM_MODEL;

    const provider = createLLMProviderAdapterForProvider(sampleConfig);
    expect(provider).not.toBeNull();
    const config = (provider as unknown as { _config: LLMProviderConfig })._config;
    expect(config.apiKey).toBe('sk-test-key');
    expect(config.baseURL).toBe('https://example.com/v1');
    expect(config.model).toBe('test-model');
  });
});

// ── createProviderInstance (backward-compatible wrapper) ─────────────────────

describe('createProviderInstance', () => {
  it('returns a provider identical to createLLMProviderAdapterForProvider', () => {
    const providerA = createProviderInstance(sampleConfig);
    const providerB = createLLMProviderAdapterForProvider(sampleConfig);

    const configA = (providerA as unknown as { _config: LLMProviderConfig })._config;
    const configB = (providerB as unknown as { _config: LLMProviderConfig })._config;
    expect(configA).toEqual(configB);
  });

  it('returns a provider with generateObject and generateText methods', () => {
    const provider = createProviderInstance(sampleConfig);
    expect(typeof provider.generateObject).toBe('function');
    expect(typeof provider.generateText).toBe('function');
  });
});

// ── testProviderConnection ───────────────────────────────────────────────────

describe('testProviderConnection', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns success: true on successful connection', async () => {
    mockGenerateText.mockResolvedValueOnce({ text: 'OK' });

    // We need real fetch for testProviderConnection since it calls
    // createOpenAIProvider internally (which is mocked), and then calls
    // provider.generateText which is also mocked. The mock already handles this.
    const result = await testProviderConnection(sampleConfig);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Connection successful');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('calls generateText with the correct prompt', async () => {
    mockGenerateText.mockResolvedValueOnce({ text: 'OK' });

    await testProviderConnection(sampleConfig);

    expect(mockGenerateText).toHaveBeenCalledOnce();
    expect(mockGenerateText).toHaveBeenCalledWith({
      prompt: 'Say "OK" to confirm connection',
      maxTokens: 10,
    });
  });

  it('returns success: false with error message when generateText throws', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('Network timeout'));

    const result = await testProviderConnection(sampleConfig);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Network timeout');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('handles non-Error thrown values', async () => {
    mockGenerateText.mockRejectedValueOnce('string error');

    const result = await testProviderConnection(sampleConfig);

    expect(result.success).toBe(false);
    expect(result.message).toBe('string error');
  });

  it('returns latencyMs even on failure', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('fail'));

    const result = await testProviderConnection(sampleConfig);

    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.latencyMs).toBe('number');
  });
});

// ── getGenerateObjectForProvider ─────────────────────────────────────────────

describe('getGenerateObjectForProvider', () => {
  it('returns a function', () => {
    const fn = getGenerateObjectForProvider(sampleConfig);
    expect(typeof fn).toBe('function');
  });

  it('returned function delegates to provider.generateObject', async () => {
    const expectedObject = { name: 'Alice', age: 30 };
    mockGenerateObject.mockResolvedValueOnce({ object: expectedObject });

    const generateObject = getGenerateObjectForProvider(sampleConfig);
    const schema = { parse: vi.fn((v: unknown) => v) };

    const result = await generateObject({
      model: 'any-model',
      schema,
      prompt: 'Generate a person',
      system: 'You are a data generator',
    });

    expect(result.object).toEqual(expectedObject);
    expect(mockGenerateObject).toHaveBeenCalledOnce();
    expect(mockGenerateObject).toHaveBeenCalledWith({
      schema,
      prompt: 'Generate a person',
      system: 'You are a data generator',
    });
  });

  it('returned function ignores the model parameter', async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: { ok: true } });

    const generateObject = getGenerateObjectForProvider(sampleConfig);
    const schema = { parse: vi.fn((v: unknown) => v) };

    await generateObject({
      model: 'ignored-model',
      schema,
      prompt: 'test',
      system: 'test',
    });

    const callArgs = mockGenerateObject.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty('model');
  });

  it('returned function passes schema parse through', async () => {
    const parsed = { result: 'parsed' };
    const schema = { parse: vi.fn(() => parsed) };
    mockGenerateObject.mockResolvedValueOnce({ object: parsed });

    const generateObject = getGenerateObjectForProvider(sampleConfig);

    const result = await generateObject({
      model: 'x',
      schema,
      prompt: 'test',
      system: 'test',
    });

    expect(result.object).toBe(parsed);
  });

  it('propagates errors from provider.generateObject', async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error('API rate limit'));

    const generateObject = getGenerateObjectForProvider(sampleConfig);
    const schema = { parse: vi.fn((v: unknown) => v) };

    await expect(
      generateObject({
        model: 'x',
        schema,
        prompt: 'test',
        system: 'test',
      }),
    ).rejects.toThrow('API rate limit');
  });
});
