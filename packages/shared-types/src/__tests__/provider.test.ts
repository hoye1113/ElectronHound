import { describe, it, expect } from 'vitest';
import {
  LLMProviderTypeSchema,
  LLMProviderConfigSchema,
  CreateProviderSchema,
  UpdateProviderSchema,
} from '../provider.js';

describe('LLMProviderTypeSchema', () => {
  it('accepts "openai-compatible"', () => {
    expect(LLMProviderTypeSchema.parse('openai-compatible')).toBe('openai-compatible');
  });

  it('rejects other strings', () => {
    expect(() => LLMProviderTypeSchema.parse('azure')).toThrow();
    expect(() => LLMProviderTypeSchema.parse('anthropic')).toThrow();
    expect(() => LLMProviderTypeSchema.parse('')).toThrow();
  });
});

describe('LLMProviderConfigSchema', () => {
  const validConfig = {
    id: 'openai-1',
    name: 'OpenAI GPT-4o',
    type: 'openai-compatible' as const,
    apiKey: 'sk-test-key-123',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  };

  it('parses valid input', () => {
    const result = LLMProviderConfigSchema.parse(validConfig);
    expect(result.id).toBe('openai-1');
    expect(result.name).toBe('OpenAI GPT-4o');
    expect(result.type).toBe('openai-compatible');
    expect(result.apiKey).toBe('sk-test-key-123');
    expect(result.baseURL).toBe('https://api.openai.com/v1');
    expect(result.model).toBe('gpt-4o');
  });

  it('defaults enabled to true when omitted', () => {
    const result = LLMProviderConfigSchema.parse(validConfig);
    expect(result.enabled).toBe(true);
  });

  it('accepts enabled: false', () => {
    const result = LLMProviderConfigSchema.parse({ ...validConfig, enabled: false });
    expect(result.enabled).toBe(false);
  });

  it('rejects empty id', () => {
    expect(() =>
      LLMProviderConfigSchema.parse({ ...validConfig, id: '' })
    ).toThrow();
  });

  it('rejects empty name', () => {
    expect(() =>
      LLMProviderConfigSchema.parse({ ...validConfig, name: '' })
    ).toThrow();
  });

  it('rejects empty apiKey', () => {
    expect(() =>
      LLMProviderConfigSchema.parse({ ...validConfig, apiKey: '' })
    ).toThrow();
  });

  it('rejects invalid baseURL', () => {
    expect(() =>
      LLMProviderConfigSchema.parse({ ...validConfig, baseURL: 'not-a-url' })
    ).toThrow();
  });

  it('rejects empty model', () => {
    expect(() =>
      LLMProviderConfigSchema.parse({ ...validConfig, model: '' })
    ).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => LLMProviderConfigSchema.parse({})).toThrow();
    expect(() => LLMProviderConfigSchema.parse({ id: 'test' })).toThrow();
  });
});

describe('CreateProviderSchema', () => {
  const validCreate = {
    name: 'New Provider',
    type: 'openai-compatible' as const,
    apiKey: 'sk-new-key',
    baseURL: 'https://api.new.com/v1',
    model: 'gpt-4o',
  };

  it('parses valid input without id', () => {
    const result = CreateProviderSchema.parse(validCreate);
    expect(result.name).toBe('New Provider');
    expect(result.id).toBeUndefined();
  });

  it('parses valid input with optional id', () => {
    const result = CreateProviderSchema.parse({ ...validCreate, id: 'custom-id' });
    expect(result.id).toBe('custom-id');
  });

  it('rejects empty name', () => {
    expect(() =>
      CreateProviderSchema.parse({ ...validCreate, name: '' })
    ).toThrow();
  });

  it('rejects empty apiKey', () => {
    expect(() =>
      CreateProviderSchema.parse({ ...validCreate, apiKey: '' })
    ).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => CreateProviderSchema.parse({})).toThrow();
  });
});

describe('UpdateProviderSchema', () => {
  it('accepts partial updates', () => {
    const result = UpdateProviderSchema.parse({ name: 'Updated Name' });
    expect(result.name).toBe('Updated Name');
    expect(result.apiKey).toBeUndefined();
  });

  it('accepts empty object (no updates)', () => {
    const result = UpdateProviderSchema.parse({});
    // 'enabled' has a default of true in the base schema, so it appears even when not provided
    expect(result.enabled).toBe(true);
    expect(result.name).toBeUndefined();
    expect(result.apiKey).toBeUndefined();
  });

  it('accepts apiKey update', () => {
    const result = UpdateProviderSchema.parse({ apiKey: 'sk-new-key' });
    expect(result.apiKey).toBe('sk-new-key');
  });

  it('rejects empty apiKey in update', () => {
    expect(() =>
      UpdateProviderSchema.parse({ apiKey: '' })
    ).toThrow();
  });

  it('accepts model update', () => {
    const result = UpdateProviderSchema.parse({ model: 'gpt-4o-mini' });
    expect(result.model).toBe('gpt-4o-mini');
  });
});
