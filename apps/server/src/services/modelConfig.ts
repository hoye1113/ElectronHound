/**
 * Model Context Window Configuration Service
 *
 * Provides LLM model context window sizes with optional environment variable
 * override. Applies a 20% safety margin (OpenClaw practice) to reserve space
 * for output tokens.
 *
 * Supported models and their context windows:
 * - gpt-4o, gpt-4o-mini: 128K tokens
 * - deepseek-chat: 32K tokens
 * - qwen-plus: 32K tokens
 * - groq, llama-3.1-70b-versatile: 131K tokens
 *
 * Override via `MODEL_CONTEXT_WINDOW` environment variable (integer token count).
 */

import type { ModelContextWindow } from '../context/types.js';

/**
 * Safety margin multiplier applied to contextWindow to reserve output tokens.
 * Follows the OpenClaw practice of reserving 20% of the context window.
 */
const SAFETY_MARGIN = 0.8;

/**
 * Default context window size used when no model-specific value is found.
 * Set to GPT-4o's 128K tokens.
 */
const DEFAULT_CONTEXT_WINDOW = 128_000;

/**
 * Default max output tokens reserved for LLM response.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;

/**
 * Known model context windows in tokens.
 * Keys are model identifiers used by Vercel AI SDK providers.
 */
const MODEL_CONTEXT_WINDOWS: ReadonlyMap<string, number> = new Map([
  // OpenAI
  ['gpt-4o', 128_000],
  ['gpt-4o-mini', 128_000],
  ['gpt-4-turbo', 128_000],
  ['gpt-4', 8_192],
  ['gpt-3.5-turbo', 16_385],
  // DeepSeek
  ['deepseek-chat', 32_768],
  ['deepseek-coder', 32_768],
  // Qwen (通义千问)
  ['qwen-plus', 32_768],
  ['qwen-max', 32_768],
  ['qwen-turbo', 32_768],
  // Groq
  ['groq', 131_072],
  ['llama-3.1-70b-versatile', 131_072],
  ['llama-3.1-8b-instant', 131_072],
  ['llama-3-70b', 131_072],
  ['llama-3-8b', 131_072],
  // Ollama (local models — user should set MODEL_CONTEXT_WINDOW)
  ['ollama', 32_768],
]);

/**
 * Returns the effective context window for the given model, with a 20% safety margin applied.
 *
 * Resolution order:
 * 1. Environment variable `MODEL_CONTEXT_WINDOW` (integer)
 * 2. Known model defaults (MODEL_CONTEXT_WINDOWS map)
 * 3. Fallback to DEFAULT_CONTEXT_WINDOW (128K)
 *
 * The returned value is `rawContextWindow * SAFETY_MARGIN` (80% of raw).
 *
 * @param modelName - Optional model identifier (e.g., 'gpt-4o', 'deepseek-chat')
 * @returns Effective context window in tokens (with 20% safety margin applied)
 */
export function getModelContextWindow(modelName?: string): number {
  const raw = getRawContextWindow(modelName);
  return Math.floor(raw * SAFETY_MARGIN);
}

/**
 * Returns the raw (unscaled) context window for the given model.
 * No safety margin is applied — use `getModelContextWindow()` for
 * the context window suitable for compaction threshold checking.
 *
 * @param modelName - Optional model identifier
 * @returns Raw context window in tokens
 */
export function getRawContextWindow(modelName?: string): number {
  // 1. Environment variable override
  const envValue = process.env.MODEL_CONTEXT_WINDOW;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  // 2. Known model defaults
  if (modelName) {
    const known = MODEL_CONTEXT_WINDOWS.get(modelName);
    if (known !== undefined) {
      return known;
    }
    // Partial match: check if modelName starts with a known prefix
    const lower = modelName.toLowerCase();
    for (const [prefix, value] of MODEL_CONTEXT_WINDOWS) {
      if (lower.startsWith(prefix)) {
        return value;
      }
    }
  }

  // 3. Fallback to default
  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * Returns a complete ModelContextWindow configuration for the given model.
 *
 * @param modelName - Optional model identifier
 * @returns ModelContextWindow with contextWindow (safety-margin applied) and maxOutputTokens
 */
export function getModelConfig(modelName?: string): ModelContextWindow {
  return {
    modelName: modelName ?? 'gpt-4o',
    contextWindow: getModelContextWindow(modelName),
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
  };
}

/**
 * Runtime configuration store for custom model context windows.
 * Allows overriding defaults at runtime without environment variables.
 */
const runtimeOverrides = new Map<string, number>();

/**
 * Set a custom context window for a model at runtime.
 * Overrides both environment variable and known defaults.
 *
 * @param modelName - Model identifier
 * @param contextWindow - Context window in tokens (raw, before safety margin)
 */
export function setModelContextWindow(modelName: string, contextWindow: number): void {
  if (contextWindow <= 0) {
    throw new Error(`Invalid context window: ${contextWindow}. Must be positive.`);
  }
  runtimeOverrides.set(modelName, contextWindow);
}

/**
 * Clear a runtime override for a model.
 *
 * @param modelName - Model identifier to clear
 */
export function clearModelContextOverride(modelName: string): void {
  runtimeOverrides.delete(modelName);
}

/**
 * Clear all runtime overrides.
 */
export function clearAllModelOverrides(): void {
  runtimeOverrides.clear();
}

/**
 * List all known model context windows.
 *
 * @returns Array of [modelName, contextWindow] pairs (raw values, no safety margin)
 */
export function listKnownModels(): ReadonlyArray<readonly [string, number]> {
  return Array.from(MODEL_CONTEXT_WINDOWS.entries());
}
