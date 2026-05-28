import type { GenerateOptions, GenerateObjectOptions, LLMProvider } from './provider.js';

/**
 * OpenAI-compatible provider (GPT-4, GPT-3.5-turbo, DeepSeek, Qwen, Groq, etc.)
 *
 * All OpenAI-compatible APIs share the same chat/completions endpoint format.
 * Differentiation is via `baseUrl`.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: { model: string; apiKey?: string; baseUrl?: string }) {
    this.model = opts.model;
    this.apiKey = opts.apiKey ?? '';
    this.baseUrl = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  }

  async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
    const body = this.buildRequestBody(prompt, options);
    const res = await this.fetchChatCompletions(body);
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content ?? '';
  }

  async generateObject<T>(prompt: string, options?: GenerateObjectOptions): Promise<T> {
    const body = {
      ...this.buildRequestBody(prompt, options),
      response_format: { type: 'json_object' as const },
    };
    const res = await this.fetchChatCompletions(body);
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as T;
    if (options?.schema) {
      return options.schema.parse(parsed) as T;
    }
    return parsed;
  }

  async *streamText(prompt: string, options?: GenerateOptions): AsyncIterable<string> {
    const body = {
      ...this.buildRequestBody(prompt, options),
      stream: true,
    };
    const res = await this.fetchChatCompletions(body);
    if (!res.body) {
      throw new Error('OpenAI: stream response has no body');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const parsed = JSON.parse(payload) as {
            choices: Array<{ delta: { content?: string } }>;
          };
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Skip non-JSON lines
        }
      }
    }
  }

  private buildRequestBody(prompt: string, options?: GenerateOptions): Record<string, unknown> {
    const messages: Array<{ role: string; content: string }> = [];
    if (options?.system) {
      messages.push({ role: 'system', content: options.system });
    }
    messages.push({ role: 'user', content: prompt });
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
    };
    if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.topP !== undefined) body.top_p = options.topP;
    return body;
  }

  private async fetchChatCompletions(body: Record<string, unknown>): Promise<Response> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI API error ${res.status}: ${text || res.statusText}`);
    }
    return res;
  }
}

export function createOpenAI(opts: { model: string; apiKey?: string; baseUrl?: string }): OpenAIProvider {
  return new OpenAIProvider(opts);
}
