import { createOpenAIProvider } from './llm/openai-provider.js';
import type { LLMProvider } from './llm/types.js';
import type { LLMProviderConfig } from './llm-types.js';

/**
 * 创建 LLM Provider 实例
 * 所有供应商统一使用 createOpenAIProvider()，仅通过 baseURL 区分
 *
 * @param config - 供应商配置
 * @returns LLMProvider 实例
 */
export function createProviderInstance(config: LLMProviderConfig): LLMProvider {
  return createOpenAIProvider(config);
}

/**
 * 为指定供应商获取 generateObject 函数
 * 用于 Dashboard 中选择供应商后创建测试任务
 */
export function getGenerateObjectForProvider(config: LLMProviderConfig) {
  const provider = createProviderInstance(config);

  return async (opts: { model: unknown; schema: { parse: (value: unknown) => unknown }; prompt: string; system: string }) => {
    const { schema, prompt, system } = opts;
    return provider.generateObject({ schema, prompt, system });
  };
}

/**
 * 测试供应商连接
 */
export async function testProviderConnection(config: LLMProviderConfig): Promise<{ success: boolean; message: string; latencyMs: number }> {
  const t0 = Date.now();
  const provider = createProviderInstance(config);
  try {
    await provider.generateText({ prompt: 'OK', maxTokens: 5 });
    return { success: true, message: 'Connection successful', latencyMs: Date.now() - t0 };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t0 };
  }
}
