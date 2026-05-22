import { describe, it, expect, afterEach } from 'vitest';
import {
  getModelContextWindow,
  getRawContextWindow,
  getModelConfig,
  setModelContextWindow,
  clearModelContextOverride,
  clearAllModelOverrides,
  listKnownModels,
} from '../../services/modelConfig.js';

// ==========================================================================
// Helpers
// ==========================================================================

/** Saved original env var value for cleanup. */
const savedEnvVar = process.env.MODEL_CONTEXT_WINDOW;

// ==========================================================================
// modelConfig
// ==========================================================================

describe('modelConfig', () => {
  afterEach(() => {
    // Restore original env var state
    if (savedEnvVar === undefined) {
      delete process.env.MODEL_CONTEXT_WINDOW;
    } else {
      process.env.MODEL_CONTEXT_WINDOW = savedEnvVar;
    }
    // Clear any runtime overrides between tests
    clearAllModelOverrides();
  });

  // ========================================================================
  // getModelContextWindow (5 tests)
  // ========================================================================
  describe('getModelContextWindow', () => {
    it('known model (gpt-4o) returns 128000 * 0.8 = 102400', () => {
      expect(getModelContextWindow('gpt-4o')).toBe(102_400);
    });

    it('known model (deepseek-chat) returns 32768 * 0.8 = 26214 (floored)', () => {
      expect(getModelContextWindow('deepseek-chat')).toBe(26_214);
    });

    it('unknown model returns default (128000 * 0.8)', () => {
      expect(getModelContextWindow('some-unknown-model')).toBe(102_400);
    });

    it("partial match: 'gpt-4o-2024-05-13' still matches gpt-4o prefix", () => {
      expect(getModelContextWindow('gpt-4o-2024-05-13')).toBe(102_400);
    });

    it('undefined model name returns default', () => {
      expect(getModelContextWindow()).toBe(102_400);
    });
  });

  // ========================================================================
  // getRawContextWindow (7 tests)
  // ========================================================================
  describe('getRawContextWindow', () => {
    it('returns raw 128000 for gpt-4o (no safety margin)', () => {
      expect(getRawContextWindow('gpt-4o')).toBe(128_000);
    });

    it('environment variable override works', () => {
      process.env.MODEL_CONTEXT_WINDOW = '64000';
      expect(getRawContextWindow('gpt-4o')).toBe(64_000);
    });

    it('negative env var is ignored, falls back to default', () => {
      process.env.MODEL_CONTEXT_WINDOW = '-1000';
      expect(getRawContextWindow('gpt-4o')).toBe(128_000);
    });

    it('non-numeric env var is ignored', () => {
      process.env.MODEL_CONTEXT_WINDOW = 'not-a-number';
      expect(getRawContextWindow('gpt-4o')).toBe(128_000);
    });

    it('zero env var is ignored (not positive)', () => {
      process.env.MODEL_CONTEXT_WINDOW = '0';
      expect(getRawContextWindow('gpt-4o')).toBe(128_000);
    });

    it('returns deepseek-chat raw value', () => {
      expect(getRawContextWindow('deepseek-chat')).toBe(32_768);
    });

    it('returns default 128000 for unknown model without env var', () => {
      delete process.env.MODEL_CONTEXT_WINDOW;
      expect(getRawContextWindow('totally-made-up-model')).toBe(128_000);
    });
  });

  // ========================================================================
  // getModelConfig (4 tests)
  // ========================================================================
  describe('getModelConfig', () => {
    it('returns full ModelContextWindow object', () => {
      const config = getModelConfig('gpt-4o');
      expect(config).toHaveProperty('modelName');
      expect(config).toHaveProperty('contextWindow');
      expect(config).toHaveProperty('maxOutputTokens');
    });

    it("default model name is 'gpt-4o'", () => {
      const config = getModelConfig();
      expect(config.modelName).toBe('gpt-4o');
    });

    it('maxOutputTokens is 16384', () => {
      const config = getModelConfig('deepseek-chat');
      expect(config.maxOutputTokens).toBe(16_384);
    });

    it('contextWindow matches getModelContextWindow', () => {
      const config = getModelConfig('gpt-4o');
      expect(config.contextWindow).toBe(getModelContextWindow('gpt-4o'));
    });
  });

  // ========================================================================
  // setModelContextWindow (3 tests)
  // ========================================================================
  describe('setModelContextWindow', () => {
    it('custom override stores without error', () => {
      expect(() => setModelContextWindow('custom-model', 64_000)).not.toThrow();
    });

    it('throws for 0', () => {
      expect(() => setModelContextWindow('test', 0)).toThrow('Must be positive');
    });

    it('throws for negative values', () => {
      expect(() => setModelContextWindow('test', -100)).toThrow('Must be positive');
    });
  });

  // ========================================================================
  // clearModelContextOverride / clearAllModelOverrides (4 tests)
  // ========================================================================
  describe('clearModelContextOverride / clearAllModelOverrides', () => {
    it('clear single override does not throw', () => {
      setModelContextWindow('model-a', 10_000);
      expect(() => clearModelContextOverride('model-a')).not.toThrow();
    });

    it('clear non-existent override does not throw', () => {
      expect(() => clearModelContextOverride('never-set')).not.toThrow();
    });

    it('clear all overrides does not throw', () => {
      setModelContextWindow('model-x', 10_000);
      setModelContextWindow('model-y', 20_000);
      expect(() => clearAllModelOverrides()).not.toThrow();
    });

    it('clear all on empty map does not throw', () => {
      expect(() => clearAllModelOverrides()).not.toThrow();
    });
  });

  // ========================================================================
  // listKnownModels (3 tests)
  // ========================================================================
  describe('listKnownModels', () => {
    it('returns array of [name, contextWindow] pairs', () => {
      const models = listKnownModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);

      for (const [name, ctx] of models) {
        expect(typeof name).toBe('string');
        expect(typeof ctx).toBe('number');
        expect(ctx).toBeGreaterThan(0);
      }
    });

    it('contains at least 10 known models', () => {
      const models = listKnownModels();
      expect(models.length).toBeGreaterThanOrEqual(10);
    });

    it('includes gpt-4o with correct context window', () => {
      const models = listKnownModels();
      const gpt4o = models.find(([name]) => name === 'gpt-4o');
      expect(gpt4o).toBeDefined();
      expect(gpt4o![1]).toBe(128_000);
    });
  });
});
