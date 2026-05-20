import { createOpenAI } from '@ai-sdk/openai';
import { generateObject as aiGenerateObject } from 'ai';
import type { FlexibleSchema } from 'ai';
import type { LLMProviderConfig } from './llm-types.js';

/**
 * 创建 LLM Provider 实例
 * 所有供应商统一使用 createOpenAI()，仅通过 baseURL 区分
 *
 * @param config - 供应商配置
 * @returns AI SDK 模型实例
 */
export function createProviderInstance(config: LLMProviderConfig): ReturnType<ReturnType<typeof createOpenAI>> {
  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  
  // 返回模型实例（供 aiGenerateObject 使用）
  return openai(config.model);
}

/**
 * 为指定供应商获取 generateObject 函数
 * 用于 Dashboard 中选择供应商后创建测试任务
 */
export function getGenerateObjectForProvider(config: LLMProviderConfig) {
  const model = createProviderInstance(config);

  return async (opts: { model: unknown; schema: FlexibleSchema<unknown>; prompt: string; system: string }) => {
    const { schema, prompt, system } = opts;
    return aiGenerateObject({
      model,
      schema,
      prompt,
      system,
    });
  };
}

/**
 * 测试供应商连接
 */
export async function testProviderConnection(config: LLMProviderConfig): Promise<{ success: boolean; message: string; latencyMs: number }> {
  const t0 = Date.now();
  const model = createProviderInstance(config);
  try {
    const { generateText } = await import('ai');
    await generateText({ model, prompt: 'OK', maxOutputTokens: 5 });
    return { success: true, message: 'Connection successful', latencyMs: Date.now() - t0 };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - t0 };
  }
}