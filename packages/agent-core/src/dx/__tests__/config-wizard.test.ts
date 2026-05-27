import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ConfigWizard,
  runConfigWizard,
  getProviderTemplates,
} from '../config-wizard.js';

describe('Config Wizard', () => {
  describe('ConfigWizard', () => {
    it('should create wizard with default options', () => {
      const wizard = new ConfigWizard();
      expect(wizard).toBeDefined();
    });

    it('should create wizard with custom options', () => {
      const wizard = new ConfigWizard({
        interactive: false,
        skipConfirmation: true,
      });
      expect(wizard).toBeDefined();
    });

    it('should validate valid config', () => {
      const wizard = new ConfigWizard();
      const config = {
        version: 1,
        providers: [
          {
            id: 'test-1',
            name: 'Test Provider',
            type: 'openai-compatible' as const,
            apiKey: 'sk-test',
            baseURL: 'https://api.test.com/v1',
            model: 'gpt-4o',
            enabled: true,
          },
        ],
        activeId: 'test-1',
      };

      const result = wizard.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate config with missing version', () => {
      const wizard = new ConfigWizard();
      const config = {
        version: 0,
        providers: [],
        activeId: '',
      };

      const result = wizard.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid configuration version');
    });

    it('should validate config with no providers', () => {
      const wizard = new ConfigWizard();
      const config = {
        version: 1,
        providers: [],
        activeId: '',
      };

      const result = wizard.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No providers configured');
    });

    it('should validate config with missing provider fields', () => {
      const wizard = new ConfigWizard();
      const config = {
        version: 1,
        providers: [
          {
            id: '',
            name: '',
            type: 'openai-compatible' as const,
            apiKey: '',
            baseURL: '',
            model: '',
          },
        ],
        activeId: '',
      };

      const result = wizard.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate config with invalid activeId', () => {
      const wizard = new ConfigWizard();
      const config = {
        version: 1,
        providers: [
          {
            id: 'test-1',
            name: 'Test',
            type: 'openai-compatible' as const,
            apiKey: 'sk-test',
            baseURL: 'https://api.test.com/v1',
            model: 'gpt-4o',
          },
        ],
        activeId: 'nonexistent',
      };

      const result = wizard.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Active provider not found: nonexistent');
    });

    it('should quick setup provider', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'eata-test-'));
      try {
        const wizard = new ConfigWizard({ interactive: false, outputDir: tmpDir });
        const result = await wizard.quickSetup(
          'openai',
          'sk-test-key',
          'https://api.openai.com/v1',
          'gpt-4o',
        );

        expect(result.success).toBe(true);
        expect(result.config).toBeDefined();
        expect(result.config?.providers[0].name).toBe('OpenAI');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should fail quick setup with unknown provider', async () => {
      const wizard = new ConfigWizard({ interactive: false });
      const result = await wizard.quickSetup(
        'unknown-provider',
        'sk-test-key',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown provider');
    });
  });

  describe('getProviderTemplates', () => {
    it('should return all provider templates', () => {
      const templates = getProviderTemplates();
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should include OpenAI template', () => {
      const templates = getProviderTemplates();
      const openai = templates.find((t) => t.id === 'openai');
      expect(openai).toBeDefined();
      expect(openai?.name).toBe('OpenAI');
      expect(openai?.baseURL).toContain('openai.com');
    });

    it('should include DeepSeek template', () => {
      const templates = getProviderTemplates();
      const deepseek = templates.find((t) => t.id === 'deepseek');
      expect(deepseek).toBeDefined();
      expect(deepseek?.name).toBe('DeepSeek');
    });

    it('should include Qwen template', () => {
      const templates = getProviderTemplates();
      const qwen = templates.find((t) => t.id === 'qwen');
      expect(qwen).toBeDefined();
      expect(qwen?.name).toContain('Qwen');
    });

    it('should include Groq template', () => {
      const templates = getProviderTemplates();
      const groq = templates.find((t) => t.id === 'groq');
      expect(groq).toBeDefined();
      expect(groq?.name).toBe('Groq');
    });

    it('should include custom template', () => {
      const templates = getProviderTemplates();
      const custom = templates.find((t) => t.id === 'custom');
      expect(custom).toBeDefined();
      expect(custom?.name).toBe('Custom Provider');
    });

    it('should have valid template structure', () => {
      const templates = getProviderTemplates();
      for (const template of templates) {
        expect(template.id).toBeDefined();
        expect(template.name).toBeDefined();
        expect(template.baseURL).toBeDefined();
        expect(template.model).toBeDefined();
        expect(template.description).toBeDefined();
      }
    });
  });

  describe('runConfigWizard', () => {
    it('should be a function', () => {
      expect(typeof runConfigWizard).toBe('function');
    });

    it('should accept options', () => {
      // Just verify it doesn't throw when called with options
      expect(() => runConfigWizard({ interactive: false })).not.toThrow();
    });
  });
});
