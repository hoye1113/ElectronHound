/**
 * Unified Multi-Provider LLM Module
 *
 * Factory function to create any supported LLM provider from a config,
 * plus re-exports of all types and provider implementations.
 */

import type { LLMProvider, GenerateOptions, GenerateObjectOptions, ProviderConfig, ProviderType } from './provider.js';
import { OpenAIProvider, createOpenAI } from './openai.js';
import { AnthropicProvider, createAnthropic } from './anthropic.js';
import { GoogleProvider, createGoogle } from './google.js';
import { OllamaProvider, createOllama } from './ollama.js';

export type { LLMProvider, GenerateOptions, GenerateObjectOptions, ProviderConfig, ProviderType };
export {
  OpenAIProvider,
  createOpenAI,
  AnthropicProvider,
  createAnthropic,
  GoogleProvider,
  createGoogle,
  OllamaProvider,
  createOllama,
};

/**
 * Create an LLM provider from a unified config.
 *
 * @example
 * const provider = createProvider({ provider: 'openai', model: 'gpt-4', apiKey: 'sk-...' });
 * const text = await provider.generateText('Hello');
 */
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.provider) {
    case 'openai':
      return createOpenAI({
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
    case 'anthropic':
      return createAnthropic({
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
    case 'google':
      return createGoogle({
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
    case 'ollama':
      return createOllama({
        model: config.model,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
    default: {
      const _exhaustive: never = config.provider;
      throw new Error(`Unsupported provider: ${String(_exhaustive)}`);
    }
  }
}
