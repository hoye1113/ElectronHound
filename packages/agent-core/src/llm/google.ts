import type { GenerateOptions, GenerateObjectOptions, LLMProvider } from './provider.js';

/**
 * Google AI provider (Gemini Pro, Gemini Ultra, Gemini 1.5, etc.)
 *
 * Uses the Google Generative Language API.
 */
export class GoogleProvider implements LLMProvider {
  readonly name = 'google';
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: { model: string; apiKey?: string; baseUrl?: string }) {
    this.model = opts.model;
    this.apiKey = opts.apiKey ?? '';
    this.baseUrl = (
      opts.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta'
    ).replace(/\/+$/, '');
  }

  async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
    const body = this.buildRequestBody(prompt, options);
    const res = await this.fetchGenerate('generateContent', body, options?.system);
    const data = (await res.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  async generateObject<T>(prompt: string, options?: GenerateObjectOptions): Promise<T> {
    const jsonPrompt = `${prompt}\n\nRespond ONLY with a valid JSON object. No markdown, no code fences, no explanation.`;
    const body = this.buildRequestBody(jsonPrompt, options);
    body.generationConfig = {
      ...(body.generationConfig ?? {}),
      responseMimeType: 'application/json',
    } as Record<string, unknown>;
    if (options?.schema) {
      (body.generationConfig as Record<string, unknown>).responseSchema = this.zodToGeminiSchema(
        options.schema
      );
    }
    const res = await this.fetchGenerate('generateContent', body, options?.system);
    const data = (await res.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const parsed = JSON.parse(raw) as T;
    if (options?.schema) {
      return options.schema.parse(parsed) as T;
    }
    return parsed;
  }

  async *streamText(prompt: string, options?: GenerateOptions): AsyncIterable<string> {
    const body = this.buildRequestBody(prompt, options);
    const res = await this.fetchGenerate('streamGenerateContent', body, options?.system, true);
    if (!res.body) {
      throw new Error('Google: stream response has no body');
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
        if (!payload) continue;
        try {
          const parsed = JSON.parse(payload) as {
            candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
          };
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) yield text;
        } catch {
          // Non-JSON lines (empty, [DONE], comments) are normal in SSE streams
        }
      }
    }
  }

  private buildRequestBody(prompt: string, options?: GenerateOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    };
    const generationConfig: Record<string, unknown> = {};
    if (options?.maxTokens !== undefined) generationConfig.maxOutputTokens = options.maxTokens;
    if (options?.temperature !== undefined) generationConfig.temperature = options.temperature;
    if (options?.topP !== undefined) generationConfig.topP = options.topP;
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }
    return body;
  }

  private async fetchGenerate(
    method: string,
    body: Record<string, unknown>,
    system?: string,
    sse = false
  ): Promise<Response> {
    if (system) {
      body.systemInstruction = { parts: [{ text: system }] };
    }
    const keyParam = this.apiKey ? `key=${encodeURIComponent(this.apiKey)}&` : '';
    const altParam = sse ? 'alt=sse&' : '';
    const url = `${this.baseUrl}/models/${this.model}:${method}?${altParam}${keyParam}`.replace(/[?&]$/, '');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google API error ${res.status}: ${text || res.statusText}`);
    }
    return res;
  }

  private zodToGeminiSchema(schema: unknown): Record<string, unknown> {
    // Minimal conversion - extract JSON Schema from Zod schema
    // Works for common cases; complex schemas use raw description
    try {
      const description = (schema as { description?: string }).description;
      if (description) return { type: 'object', description };
      return { type: 'object' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[llm/google] zodToGeminiSchema fallback: ${msg}\n`);
      return { type: 'object' };
    }
  }
}

export function createGoogle(opts: { model: string; apiKey?: string; baseUrl?: string }): GoogleProvider {
  return new GoogleProvider(opts);
}
