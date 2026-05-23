import type { LLMProvider as LLMProviderImpl } from './llm/types.js';
import { createOpenAIProvider } from './llm/openai-provider.js';
import type { LLMProviderConfig } from './llm-types.js';
import { createProviderInstance } from './provider-factory.js';

export interface LLMConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export interface LLMProvider {
  provider: LLMProviderImpl;
  model: string;
}

export interface GenerateObjectOptions {
  model: unknown;
  schema: { parse: (value: unknown) => unknown };
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

  const provider = createOpenAIProvider({
    id: 'env',
    name: 'Environment Provider',
    type: 'openai-compatible',
    apiKey,
    baseURL: baseURL ?? 'https://api.openai.com/v1',
    model,
  });
  return { provider, model };
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
  const llmProvider = createLLMProvider(config);

  if (!llmProvider) {
    // No LLM configured — nodes will use their own deterministic fallbacks
    return null;
  }

  // Real generateObject bound to the configured provider
  return async (opts: GenerateObjectOptions): Promise<{ object: unknown }> => {
    const { schema, prompt, system } = opts;
    return llmProvider.provider.generateObject({ schema, prompt, system });
  };
}

/**
 * 为指定供应商获取 generateObject 函数
 * 用于 Dashboard 中选择供应商后创建测试任务
 */
export function getGenerateObjectForProvider(config: LLMProviderConfig) {
  const provider = createProviderInstance(config);

  return async (opts: GenerateObjectOptions): Promise<{ object: unknown }> => {
    const { schema, prompt, system } = opts;
    return provider.generateObject({ schema, prompt, system });
  };
}
