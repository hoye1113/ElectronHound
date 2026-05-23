/**
 * Custom LLM Provider Types (replaces Vercel AI SDK)
 *
 * Defines the common interface for the native-fetch-based LLM provider.
 * All OpenAI-compatible APIs share the same chat/completions endpoint format.
 */

export interface GenerateObjectOptions<T = unknown> {
  /** Model identifier — ignored; the provider config's model is used instead */
  model?: unknown;
  /** Schema with a parse method for structured output validation */
  schema: { parse: (value: unknown) => T };
  /** User prompt */
  prompt: string;
  /** System prompt */
  system?: string;
}

export interface GenerateTextOptions {
  /** Model identifier — ignored; the provider config's model is used instead */
  model?: unknown;
  /** User prompt */
  prompt: string;
  /** System prompt */
  system?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
}

export interface LLMProvider {
  /** Generate structured object output from a prompt */
  generateObject<T>(opts: GenerateObjectOptions<T>): Promise<{ object: T }>;
  /** Generate plain text output from a prompt */
  generateText(opts: GenerateTextOptions): Promise<{ text: string }>;
}
