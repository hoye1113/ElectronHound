/**
 * Unified Multi-Provider LLM Interface
 *
 * Defines the common interface for all LLM providers.
 * Each provider (OpenAI, Anthropic, Google, Ollama) implements LLMProvider.
 */

import type { ZodSchema } from 'zod';

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  system?: string;
}

export interface GenerateObjectOptions extends GenerateOptions {
  schema: ZodSchema<unknown>;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;

  generateText(prompt: string, options?: GenerateOptions): Promise<string>;
  generateObject<T>(prompt: string, options?: GenerateObjectOptions): Promise<T>;
  streamText(prompt: string, options?: GenerateOptions): AsyncIterable<string>;
}

export type ProviderType = 'openai' | 'anthropic' | 'google' | 'ollama';

export interface ProviderConfig {
  provider: ProviderType;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}
