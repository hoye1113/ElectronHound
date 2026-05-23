/**
 * Unified Multi-Provider LLM Module
 *
 * Barrel exports for all LLM provider types and implementations.
 *
 * Layer 1 (new): Custom fetch-based provider (replaces Vercel AI SDK)
 *   - types.ts     → GenerateObjectOptions, GenerateTextOptions, LLMProvider
 *   - openai-provider.ts → createOpenAIProvider
 *
 * Layer 2 (existing): Multi-provider architecture (kept for backward compatibility)
 *   - provider.ts  → unified LLMProvider interface for OpenAI/Anthropic/Google/Ollama
 *   - openai.ts, anthropic.ts, google.ts, ollama.ts → per-provider implementations
 */

// ── Layer 1: Custom fetch-based provider (replaces Vercel AI SDK) ────────────
export type { GenerateObjectOptions, GenerateTextOptions } from './types.js';
// Aliased to avoid conflict with provider.ts LLMProvider
export type { LLMProvider as CustomLLMProvider } from './types.js';
export { createOpenAIProvider } from './openai-provider.js';

// ── Layer 2: Multi-provider architecture ─────────────────────────────────────
import type {
  LLMProvider,
  GenerateOptions,
  GenerateObjectOptions as UnifiedGenerateObjectOptions,
  ProviderConfig,
  ProviderType,
} from './provider.js';
import { OpenAIProvider, createOpenAI } from './openai.js';
import { AnthropicProvider, createAnthropic } from './anthropic.js';
import { GoogleProvider, createGoogle } from './google.js';
import { OllamaProvider, createOllama } from './ollama.js';

export type {
  LLMProvider,
  GenerateOptions,
  UnifiedGenerateObjectOptions,
  ProviderConfig,
  ProviderType,
};
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
