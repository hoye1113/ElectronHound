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
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
          `LLM API error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
        );
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      const raw = data.choices?.[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw) as T;

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
        choices: Array<{ message: { content: string } }>;
      };
      return { text: data.choices?.[0]?.message?.content ?? '' };
    },
  };
}
