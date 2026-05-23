/**
 * LLMProvider Adapter
 *
 * Creates LLMProvider instances from the underlying provider infrastructure.
 * Both factory methods return providers that implement the full LLMProvider
 * interface (generateObject + generateText) without duplication.
 *
 * Usage:
 *   const adapter = createLLMProviderAdapter({ model: 'gpt-4o' });
 *   const { object } = await adapter.generateObject({ schema, prompt, system });
 *   const { text } = await adapter.generateText({ prompt, system });
 */

import type { LLMProvider, GenerateObjectOptions, GenerateTextOptions } from './types.js';
import { createLLMProvider } from '../llm.js';
import { createProviderInstance } from '../provider-factory.js';
import type { LLMProviderConfig } from '../llm-types.js';

/**
 * Create an LLMProvider from an env-based or default provider configuration.
 * Returns null when no API key is available.
 *
 * The returned provider uses both generateObject (with JSON response_format)
 * and generateText (without JSON mode) from the underlying OpenAI-compatible API.
 */
export function createLLMProviderAdapter(config?: { model?: string }): LLMProvider | null {
  const providerWithModel = createLLMProvider(config);
  if (!providerWithModel) return null;
  return providerWithModel.provider;
}

/**
 * Create an LLMProvider from a specific provider config (e.g., from Dashboard settings).
 *
 * Unlike createLLMProviderAdapter which reads env vars, this uses the explicit
 * provider configuration including apiKey, baseURL, and model.
 */
export function createLLMProviderAdapterForProvider(config: LLMProviderConfig): LLMProvider {
  return createProviderInstance(config);
}
