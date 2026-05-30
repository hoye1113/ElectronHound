/**
 * Vision Language Model (VLM) Provider Interface
 *
 * Extends the base LLM provider with multimodal capabilities
 * for analyzing screenshots and images.
 *
 * Used by the VLM fallback when AXTree is insufficient
 * (e.g., Canvas/WebGL apps with minimal accessibility nodes).
 */

import type { LLMProvider } from './types.js';

/**
 * Image content for multimodal prompts.
 */
export interface ImageContent {
  /** Base64-encoded image data */
  data: string;
  /** MIME type of the image (e.g., 'image/png', 'image/jpeg') */
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

/**
 * Options for vision-enhanced text generation.
 */
export interface VisionGenerateOptions {
  /** Text prompt to accompany the image */
  prompt: string;
  /** System prompt for the model */
  system?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Image(s) to analyze */
  images: ImageContent[];
}

/**
 * Interface for LLM providers that support vision/multimodal inputs.
 *
 * Extends the base LLMProvider to add image analysis capabilities.
 * Implementations should support sending images alongside text prompts.
 */
export interface VLMProvider extends LLMProvider {
  /**
   * Generate text with image analysis capabilities.
   *
   * @param options - Vision generation options including images and prompt
   * @returns Generated text response
   */
  generateWithVision(options: VisionGenerateOptions): Promise<{ text: string }>;
}

/**
 * Configuration for the MiniMax VLM provider.
 */
export interface MiniMaxVLMConfig {
  /** API key for MiniMax API */
  apiKey: string;
  /** Base URL for MiniMax API (default: https://api.minimaxi.com/v1) */
  baseUrl?: string;
  /** Model identifier (default: MiniMax-M2.7) */
  model?: string;
}

/**
 * Type guard to check if a provider supports vision capabilities.
 *
 * @param provider - The LLM provider to check
 * @returns True if the provider implements VLMProvider
 */
export function isVLMProvider(provider: LLMProvider): provider is VLMProvider {
  return 'generateWithVision' in provider && typeof (provider as VLMProvider).generateWithVision === 'function';
}
