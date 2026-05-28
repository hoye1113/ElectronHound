/**
 * LLMProvider Adapter
 *
 * Creates LLMProvider instances using the new native-fetch-based provider.
 * Both factory methods return providers that implement the full LLMProvider
 * interface (generateObject + generateText) without duplication.
 *
 * Usage:
 *   const adapter = createLLMProviderAdapter({ model: 'gpt-4o' });
 *   const { object } = await adapter.generateObject({ schema, prompt, system });
 *   const { text } = await adapter.generateText({ prompt, system });
 */

import type { LLMProvider } from './types.js';
import { createOpenAIProvider } from './openai-provider.js';
import type { LLMProviderConfig } from '../llm-types.js';

/**
 * Create an LLMProvider from an env-based or default provider configuration.
 * Returns null when no API key is available.
 *
 * Reads from environment variables:
 *   - OPENAI_API_KEY (required)
 *   - OPENAI_BASE_URL (optional, defaults to https://api.openai.com/v1)
 *   - LLM_MODEL (optional, defaults to gpt-4o)
 */
export function createLLMProviderAdapter(config?: { model?: string }): LLMProvider | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseURL = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const model = config?.model ?? process.env.LLM_MODEL ?? 'gpt-4o';

  return createOpenAIProvider({
    id: 'env-default',
    name: 'Environment Default',
    type: 'openai-compatible',
    apiKey,
    baseURL,
    model,
  });
}

/**
 * Create an LLMProvider from a specific provider config (e.g., from Dashboard settings).
 *
 * Unlike createLLMProviderAdapter which reads env vars, this uses the explicit
 * provider configuration including apiKey, baseURL, and model.
 */
export function createLLMProviderAdapterForProvider(config: LLMProviderConfig): LLMProvider {
  return createOpenAIProvider(config);
}

/**
 * Create an LLMProvider instance from a provider config.
 *
 * This is a backward-compatible wrapper used by the server and other consumers
 * that previously used the Vercel AI SDK-based createProviderInstance.
 */
export function createProviderInstance(config: LLMProviderConfig): LLMProvider {
  return createOpenAIProvider(config);
}

/**
 * Test a provider connection by sending a simple request.
 *
 * Replaces the old testProviderConnection that used Vercel AI SDK's generateText.
 */
export async function testProviderConnection(config: LLMProviderConfig): Promise<{ success: boolean; message: string; latencyMs: number }> {
  const t0 = Date.now();
  try {
    const provider = createOpenAIProvider(config);
    await provider.generateText({ prompt: 'Say "OK" to confirm connection', maxTokens: 10 });
    return { success: true, message: 'Connection successful', latencyMs: Date.now() - t0 };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t0 };
  }
}

/**
 * Get a generateObject function compatible with the old interface.
 *
 * This bridges the old generateObject({ model, schema, prompt, system }) pattern
 * used by plan.ts and verify.ts nodes to the new LLMProvider.generateObject() method.
 */
export function getGenerateObjectForProvider(config: LLMProviderConfig) {
  const provider = createOpenAIProvider(config);

  return async (opts: { model: unknown; schema: { parse: (value: unknown) => unknown }; prompt: string; system: string }): Promise<{ object: unknown }> => {
    return provider.generateObject({
      schema: opts.schema,
      prompt: opts.prompt,
      system: opts.system,
    });
  };
}
