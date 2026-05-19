import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FlexibleSchema } from 'ai';

// Store original env values
const originalEnv = { ...process.env };

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => {
    const fn = vi.fn().mockReturnValue('mock-model');
    return fn;
  }),
}));

vi.mock('ai', () => ({
  generateObject: vi.fn().mockResolvedValue({ object: { reasoning: 'test' } }),
}));

describe('llm.ts', () => {
  beforeEach(() => {
    vi.resetModules();
    // Clear env vars that affect LLM
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.LLM_MODEL;
  });

  afterEach(() => {
    // Restore original env
    Object.keys(process.env).forEach((key) => {
      if (key.startsWith('OPENAI') || key === 'LLM_MODEL') {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
  });

  describe('createLLMProvider', () => {
    it('returns null when no API key is available', async () => {
      const { createLLMProvider } = await import('../llm.js');
      const result = createLLMProvider();
      expect(result).toBeNull();
    });

    it('returns null when config has no apiKey and no env var', async () => {
      const { createLLMProvider } = await import('../llm.js');
      const result = createLLMProvider({});
      expect(result).toBeNull();
    });

    it('reads API key from environment variable', async () => {
      process.env.OPENAI_API_KEY = 'env-key-123';
      const { createLLMProvider } = await import('../llm.js');
      const result = createLLMProvider();
      expect(result).not.toBeNull();
      expect(result!.model).toBe('gpt-4o'); // default model
    });

    it('uses config apiKey over environment variable', async () => {
      process.env.OPENAI_API_KEY = 'env-key';
      const { createLLMProvider } = await import('../llm.js');
      const result = createLLMProvider({ apiKey: 'config-key' });
      expect(result).not.toBeNull();
    });

    it('uses custom model from config', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const { createLLMProvider } = await import('../llm.js');
      const result = createLLMProvider({ model: 'gpt-4o-mini' });
      expect(result!.model).toBe('gpt-4o-mini');
    });

    it('uses LLM_MODEL env var as default', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.LLM_MODEL = 'claude-sonnet-4-20250514';
      const { createLLMProvider } = await import('../llm.js');
      const result = createLLMProvider();
      expect(result!.model).toBe('claude-sonnet-4-20250514');
    });

    it('uses custom baseURL from config', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const { createLLMProvider } = await import('../llm.js');
      const result = createLLMProvider({ baseURL: 'https://custom.api.com/v1' });
      expect(result).not.toBeNull();
    });

    it('uses OPENAI_BASE_URL env var', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OPENAI_BASE_URL = 'https://env-proxy.com/v1';
      const { createLLMProvider } = await import('../llm.js');
      const result = createLLMProvider();
      expect(result).not.toBeNull();
    });
  });

  describe('getGenerateObject', () => {
    it('returns null when no API key', async () => {
      const { getGenerateObject } = await import('../llm.js');
      const generateObject = getGenerateObject();

      expect(generateObject).toBeNull();
    });

    it('returns null when config has no apiKey', async () => {
      const { getGenerateObject } = await import('../llm.js');
      const generateObject = getGenerateObject({});

      expect(generateObject).toBeNull();
    });

    it('returns real generateObject when API key is configured', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const { getGenerateObject } = await import('../llm.js');
      const generateObject = getGenerateObject();

      const result = await generateObject!({
        model: {} as unknown,
        schema: {} as FlexibleSchema<unknown>,
        prompt: 'test prompt',
        system: 'test system',
      });

      // Should call the mocked ai generateObject
      const { generateObject: mockedAiGenerate } = await import('ai');
      expect(mockedAiGenerate).toHaveBeenCalled();
      expect(result).toEqual({ object: { reasoning: 'test' } });
    });

    it('passes schema, prompt, system to real generateObject', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const aiModule = await import('ai');
      const mockedAiGenerate = vi.mocked(aiModule.generateObject);
      mockedAiGenerate.mockClear();

      const { getGenerateObject } = await import('../llm.js');
      const generateObject = getGenerateObject();

      const testSchema = { name: 'TestSchema' } as FlexibleSchema<unknown>;
      await generateObject!({
        model: {} as unknown,
        schema: testSchema,
        prompt: 'hello',
        system: 'world',
      });

      expect(mockedAiGenerate).toHaveBeenCalled();
      const callArgs = mockedAiGenerate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.schema).toBe(testSchema);
      expect(callArgs.prompt).toBe('hello');
      expect(callArgs.system).toBe('world');
    });
  });
});
