import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mock before vi.mock hoists the factory
const { mockCreateOpenAI } = vi.hoisted(() => ({
  mockCreateOpenAI: vi.fn().mockImplementation(() => {
    return vi.fn().mockReturnValue({ provider: 'mock-openai-model' });
  }),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}));

import { createProviderInstance } from '../provider-factory.js';
import type { LLMProviderConfig } from '../llm-types.js';

describe('ProviderFactory', () => {
  beforeEach(() => {
    mockCreateOpenAI.mockClear();
  });

  const baseConfig: LLMProviderConfig = {
    id: 'test-provider',
    name: 'Test Provider',
    type: 'openai-compatible',
    apiKey: 'sk-test-key-123',
    baseURL: 'https://api.test.com/v1',
    model: 'test-model',
    enabled: true,
  };

  it('creates provider with correct apiKey and baseURL', () => {
    createProviderInstance(baseConfig);

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-test-key-123',
      baseURL: 'https://api.test.com/v1',
    });
  });

  it('returns a model instance for the given model name', () => {
    const result = createProviderInstance(baseConfig);
    expect(result).toBeDefined();
  });

  it('creates OpenAI provider correctly', () => {
    const config: LLMProviderConfig = {
      id: 'openai',
      name: 'OpenAI',
      type: 'openai-compatible',
      apiKey: 'sk-openai-key',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    };

    createProviderInstance(config);

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-openai-key',
      baseURL: 'https://api.openai.com/v1',
    });
  });

  it('creates DeepSeek provider with correct baseURL', () => {
    const config: LLMProviderConfig = {
      id: 'deepseek',
      name: 'DeepSeek',
      type: 'openai-compatible',
      apiKey: 'sk-deepseek-key',
      baseURL: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    };

    createProviderInstance(config);

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-deepseek-key',
      baseURL: 'https://api.deepseek.com/v1',
    });
  });

  it('creates Qwen provider with correct baseURL', () => {
    const config: LLMProviderConfig = {
      id: 'qwen',
      name: 'Qwen',
      type: 'openai-compatible',
      apiKey: 'sk-qwen-key',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
    };

    createProviderInstance(config);

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-qwen-key',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
  });

  it('creates Groq provider with correct baseURL', () => {
    const config: LLMProviderConfig = {
      id: 'groq',
      name: 'Groq',
      type: 'openai-compatible',
      apiKey: 'gsk_groq-key',
      baseURL: 'https://api.groq.com/openai/v1',
      model: 'llama-3.1-70b-versatile',
    };

    createProviderInstance(config);

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      apiKey: 'gsk_groq-key',
      baseURL: 'https://api.groq.com/openai/v1',
    });
  });

  it('passes model name to the factory function', () => {
    const config: LLMProviderConfig = {
      ...baseConfig,
      model: 'gpt-4o-mini',
    };

    createProviderInstance(config);

    // The inner mock function should be called with the model name
    const factoryFn = mockCreateOpenAI.mock.results[0].value;
    expect(factoryFn).toHaveBeenCalledWith('gpt-4o-mini');
  });
});
