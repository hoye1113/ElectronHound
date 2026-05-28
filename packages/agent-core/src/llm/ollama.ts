import type { GenerateOptions, GenerateObjectOptions, LLMProvider } from './provider.js';

/**
 * Ollama provider (local models: llama2, mistral, codellama, etc.)
 *
 * Uses the Ollama local REST API at `/api/chat`.
 */
export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  readonly model: string;
  private readonly baseUrl: string;

  constructor(opts: { model: string; apiKey?: string; baseUrl?: string }) {
    this.model = opts.model;
    this.baseUrl = (opts.baseUrl ?? 'http://localhost:11434').replace(/\/+$/, '');
    // apiKey is ignored for Ollama (no auth by default)
  }

  async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
    const body = this.buildRequestBody(prompt, options);
    const res = await this.fetchChat(body);
    const data = (await res.json()) as { message: { content: string } };
    return data.message?.content ?? '';
  }

  async generateObject<T>(prompt: string, options?: GenerateObjectOptions): Promise<T> {
    const body = {
      ...this.buildRequestBody(prompt, options),
      format: 'json',
    };
    const res = await this.fetchChat(body);
    const data = (await res.json()) as { message: { content: string } };
    const raw = data.message?.content ?? '{}';
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
    const res = await this.fetchChat(body);
    if (!res.body) {
      throw new Error('Ollama: stream response has no body');
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
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as {
            message?: { content: string };
            done: boolean;
          };
          if (parsed.done) return;
          const content = parsed.message?.content;
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
      stream: false,
    };
    const opts: Record<string, unknown> = {};
    if (options?.maxTokens !== undefined) opts.num_predict = options.maxTokens;
    if (options?.temperature !== undefined) opts.temperature = options.temperature;
    if (options?.topP !== undefined) opts.top_p = options.topP;
    if (Object.keys(opts).length > 0) body.options = opts;
    return body;
  }

  private async fetchChat(body: Record<string, unknown>): Promise<Response> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama API error ${res.status}: ${text || res.statusText}`);
    }
    return res;
  }
}

export function createOllama(opts: { model: string; apiKey?: string; baseUrl?: string }): OllamaProvider {
  return new OllamaProvider(opts);
}
