import type { FlexibleSchema } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject as aiGenerateObject } from 'ai';

export interface LLMConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export interface LLMProvider {
  openai: ReturnType<typeof createOpenAI>;
  model: string;
}

export interface GenerateObjectOptions {
  model: unknown;
  schema: FlexibleSchema<unknown>;
  prompt: string;
  system: string;
}

/**
 * Create an OpenAI LLM provider from config or environment variables.
 * Returns null if no API key is available.
 *
 * Env vars: OPENAI_API_KEY, OPENAI_BASE_URL, LLM_MODEL (default: gpt-4o)
 */
export function createLLMProvider(config?: LLMConfig): LLMProvider | null {
  const apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY;
  const baseURL = config?.baseURL ?? process.env.OPENAI_BASE_URL;
  const model = config?.model ?? process.env.LLM_MODEL ?? 'gpt-4o';

  if (!apiKey) return null;

  const openai = createOpenAI({ apiKey, baseURL: baseURL || undefined });
  return { openai, model };
}

/**
 * Return a generateObject function bound to the configured LLM provider.
 *
 * When no API key is available, returns null so nodes can use their own
 * deterministic fallbacks (e.g. plan.ts returns browser_snapshot).
 *
 * The returned function signature matches what plan.ts / verify.ts expect:
 *   generateObject({ model, schema, prompt, system }) => Promise<{ object }>
 *
 * Note: the `model` param passed by nodes is a dummy placeholder and is ignored.
 */
export function getGenerateObject(config?: LLMConfig) {
  const provider = createLLMProvider(config);

  if (!provider) {
    // No LLM configured — nodes will use their own deterministic fallbacks
    return null;
  }

  // Real generateObject bound to the configured provider
  return async (opts: GenerateObjectOptions): Promise<{ object: unknown }> => {
    const { schema, prompt, system } = opts;
    return aiGenerateObject({
      model: provider.openai(provider.model),
      schema,
      prompt,
      system,
    });
  };
}
