import type { LLMProvider, GenerateObjectOptions, GenerateTextOptions } from './types.js';
import type { LLMProviderConfig } from '../llm-types.js';

/**
 * Create an OpenAI-compatible LLM provider using native fetch.
 *
 * Supports any OpenAI-compatible API (OpenAI, DeepSeek, Qwen, Groq, etc.)
 * by configuring the appropriate `baseURL` and `apiKey`.
 *
 * Uses the chat/completions endpoint with `response_format: { type: 'json_object' }`
 * for structured output generation.
 */
export function createOpenAIProvider(config: LLMProviderConfig): LLMProvider {
  const baseURL = config.baseURL.replace(/\/+$/, '');

  return {
    async generateObject<T>(opts: GenerateObjectOptions<T>): Promise<{ object: T }> {
      const messages: Array<{ role: string; content: string }> = [];
      if (opts.system) {
        messages.push({ role: 'system', content: opts.system });
      }
      messages.push({ role: 'user', content: opts.prompt });

      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          response_format: { type: 'json_object' },
          max_tokens: opts.maxTokens ?? 2000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
          `LLM API error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
        );
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string; reasoning_content?: string } }>;
      };
      const raw = data.choices?.[0]?.message?.content ?? '{}';
      // Strip <think>...</think> reasoning tags (used by DeepSeek, MiniMax, etc.)
      let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      // Strip ```json ... ``` markdown code fences
      const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        cleaned = fenceMatch[1].trim();
      }
      const parsed = JSON.parse(cleaned || '{}') as T;

      // Validate with Zod schema if provided
      if (opts.schema && typeof (opts.schema as Record<string, unknown>).parse === 'function') {
        return { object: (opts.schema as { parse: (v: unknown) => T }).parse(parsed) as T };
      }
      return { object: parsed };
    },

    async generateText(opts: GenerateTextOptions): Promise<{ text: string }> {
      const messages: Array<{ role: string; content: string }> = [];
      if (opts.system) {
        messages.push({ role: 'system', content: opts.system });
      }
      messages.push({ role: 'user', content: opts.prompt });

      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          max_tokens: opts.maxTokens ?? 1000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
          `LLM API error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
        );
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string; reasoning_content?: string } }>;
      };
      const raw = data.choices?.[0]?.message?.content ?? '';
      // Strip <think>...</think> reasoning tags (used by DeepSeek, MiniMax, etc.)
      let text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      // Strip ```json ... ``` markdown code fences
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        text = fenceMatch[1].trim();
      }
      return { text };
    },
  };
}
