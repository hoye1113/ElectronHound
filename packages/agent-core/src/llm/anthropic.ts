import type { GenerateOptions, GenerateObjectOptions, LLMProvider } from './provider.js';

/**
 * Anthropic provider (Claude-3 Opus, Claude-3 Sonnet, Claude-3.5 Sonnet, etc.)
 *
 * Uses the Anthropic Messages API (`/v1/messages`).
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: { model: string; apiKey?: string; baseUrl?: string }) {
    this.model = opts.model;
    this.apiKey = opts.apiKey ?? '';
    this.baseUrl = (opts.baseUrl ?? 'https://api.anthropic.com').replace(/\/+$/, '');
  }

  async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
    const body = this.buildRequestBody(prompt, options);
    const res = await this.fetchMessages(body);
    const data = (await res.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const textBlocks = data.content?.filter((block) => block.type === 'text') ?? [];
    return textBlocks.map((b) => b.text).join('');
  }

  async generateObject<T>(prompt: string, options?: GenerateObjectOptions): Promise<T> {
    const jsonPrompt = `${prompt}\n\nRespond ONLY with a valid JSON object. No markdown, no code fences, no explanation.`;
    const body = this.buildRequestBody(jsonPrompt, options);
    const res = await this.fetchMessages(body);
    const data = (await res.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const raw = data.content
      ?.filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('') ?? '{}';
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
    const res = await this.fetchMessages(body);
    if (!res.body) {
      throw new Error('Anthropic: stream response has no body');
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
        if (payload === '') continue;
        try {
          const parsed = JSON.parse(payload) as {
            type: string;
            delta?: { type: string; text?: string };
          };
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            const content = parsed.delta.text;
            if (content) yield content;
          }
        } catch {
          // Non-JSON lines (empty, [DONE], comments) are normal in SSE streams
        }
      }
    }
  }

  private buildRequestBody(prompt: string, options?: GenerateOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options?.maxTokens ?? 4096,
    };
    if (options?.system) {
      body.system = options.system;
    }
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.topP !== undefined) body.top_p = options.topP;
    return body;
  }

  private async fetchMessages(body: Record<string, unknown>): Promise<Response> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${text || res.statusText}`);
    }
    return res;
  }
}

export function createAnthropic(opts: { model: string; apiKey?: string; baseUrl?: string }): AnthropicProvider {
  return new AnthropicProvider(opts);
}
