import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ConfigWizard,
  runConfigWizard,
  quickSetupProvider,
  getProviderTemplates,
} from '../config-wizard.js';

// ─── Module Mocks ──────────────────────────────────────────────────────

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    writeFileSync: vi.fn(actual.writeFileSync),
    mkdirSync: vi.fn(actual.mkdirSync),
  };
});

vi.mock('node:readline', () => {
  return {
    createInterface: vi.fn(),
  };
});

vi.mock('../progress.js', () => {
  return {
    Spinner: vi.fn().mockImplementation(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      update: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
    })),
  };
});

vi.mock('../logger.js', () => {
  return {
    getLogger: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

// ─── Helpers ───────────────────────────────────────────────────────────

function createMockReadline(answers: string[]) {
  let callIndex = 0;
  return {
    question: vi.fn((_prompt: string, callback: (answer: string) => void) => {
      const answer = answers[callIndex] ?? '';
      callIndex++;
      // Resolve synchronously for testing
      callback(answer);
    }),
    close: vi.fn(),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('Config Wizard', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'eata-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── Constructor ─────────────────────────────────────────────────────

  describe('ConfigWizard constructor', () => {
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

    it('should create wizard with outputDir option', () => {
      const wizard = new ConfigWizard({ outputDir: tmpDir });
      expect(wizard).toBeDefined();
    });
  });

  // ─── validateConfig ──────────────────────────────────────────────────

  describe('validateConfig', () => {
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

    it('should validate config with missing provider id', () => {
      const wizard = new ConfigWizard();
      const config = {
        version: 1,
        providers: [
          {
            id: '',
            name: 'Test',
            type: 'openai-compatible' as const,
            apiKey: 'sk-test',
            baseURL: 'https://api.test.com/v1',
            model: 'gpt-4o',
          },
        ],
        activeId: '',
      };

      const result = wizard.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Provider missing ID: Test');
    });

    it('should validate config with missing provider name', () => {
      const wizard = new ConfigWizard();
      const config = {
        version: 1,
        providers: [
          {
            id: 'test-1',
            name: '',
            type: 'openai-compatible' as const,
            apiKey: 'sk-test',
            baseURL: 'https://api.test.com/v1',
            model: 'gpt-4o',
          },
        ],
        activeId: '',
      };

      const result = wizard.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Provider missing name: test-1');
    });

    it('should validate config with missing base URL', () => {
      const wizard = new ConfigWizard();
      const config = {
        version: 1,
        providers: [
          {
            id: 'test-1',
            name: 'Test',
            type: 'openai-compatible' as const,
            apiKey: 'sk-test',
            baseURL: '',
            model: 'gpt-4o',
          },
        ],
        activeId: '',
      };

      const result = wizard.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Provider missing base URL: Test');
    });

    it('should validate config with missing model', () => {
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
            model: '',
          },
        ],
        activeId: '',
      };

      const result = wizard.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Provider missing model: Test');
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

    it('should validate config with no activeId', () => {
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
        activeId: '',
      };

      const result = wizard.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate config with multiple providers', () => {
      const wizard = new ConfigWizard();
      const config = {
        version: 1,
        providers: [
          {
            id: 'test-1',
            name: 'Test 1',
            type: 'openai-compatible' as const,
            apiKey: 'sk-1',
            baseURL: 'https://api1.test.com/v1',
            model: 'gpt-4o',
          },
          {
            id: 'test-2',
            name: 'Test 2',
            type: 'openai-compatible' as const,
            apiKey: 'sk-2',
            baseURL: 'https://api2.test.com/v1',
            model: 'gpt-4o',
          },
        ],
        activeId: 'test-2',
      };

      const result = wizard.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ─── quickSetup ──────────────────────────────────────────────────────

  describe('quickSetup', () => {
    it('should quick setup provider successfully', async () => {
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
      expect(result.config?.providers[0].apiKey).toBe('sk-test-key');
      expect(result.configPath).toBeDefined();
    });

    it('should quick setup with default template values when baseURL/model omitted', async () => {
      const wizard = new ConfigWizard({ interactive: false, outputDir: tmpDir });
      const result = await wizard.quickSetup('openai', 'sk-test-key');

      expect(result.success).toBe(true);
      expect(result.config?.providers[0].baseURL).toBe('https://api.openai.com/v1');
      expect(result.config?.providers[0].model).toBe('gpt-4o');
    });

    it('should quick setup deepseek provider', async () => {
      const wizard = new ConfigWizard({ interactive: false, outputDir: tmpDir });
      const result = await wizard.quickSetup('deepseek', 'sk-deepseek-key');

      expect(result.success).toBe(true);
      expect(result.config?.providers[0].name).toBe('DeepSeek');
      expect(result.config?.providers[0].baseURL).toBe('https://api.deepseek.com/v1');
      expect(result.config?.providers[0].model).toBe('deepseek-chat');
    });

    it('should quick setup qwen provider', async () => {
      const wizard = new ConfigWizard({ interactive: false, outputDir: tmpDir });
      const result = await wizard.quickSetup('qwen', 'sk-qwen-key');

      expect(result.success).toBe(true);
      expect(result.config?.providers[0].name).toBe('Qwen (通义千问)');
      expect(result.config?.providers[0].baseURL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
    });

    it('should quick setup groq provider', async () => {
      const wizard = new ConfigWizard({ interactive: false, outputDir: tmpDir });
      const result = await wizard.quickSetup('groq', 'sk-groq-key');

      expect(result.success).toBe(true);
      expect(result.config?.providers[0].name).toBe('Groq');
      expect(result.config?.providers[0].model).toBe('llama-3.1-70b-versatile');
    });

    it('should quick setup custom provider with provided values', async () => {
      const wizard = new ConfigWizard({ interactive: false, outputDir: tmpDir });
      const result = await wizard.quickSetup(
        'custom',
        'sk-custom-key',
        'https://custom.api.com/v1',
        'custom-model',
      );

      expect(result.success).toBe(true);
      expect(result.config?.providers[0].name).toBe('Custom Provider');
      expect(result.config?.providers[0].baseURL).toBe('https://custom.api.com/v1');
      expect(result.config?.providers[0].model).toBe('custom-model');
    });

    it('should fail quick setup with unknown provider', async () => {
      const wizard = new ConfigWizard({ interactive: false });
      const result = await wizard.quickSetup('unknown-provider', 'sk-test-key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown provider');
      expect(result.error).toContain('unknown-provider');
      expect(result.error).toContain('Available:');
    });

    it('should set config activeId to the created provider', async () => {
      const wizard = new ConfigWizard({ interactive: false, outputDir: tmpDir });
      const result = await wizard.quickSetup('openai', 'sk-test-key');

      expect(result.success).toBe(true);
      expect(result.config?.activeId).toBe(result.config?.providers[0].id);
    });

    it('should set provider type to openai-compatible', async () => {
      const wizard = new ConfigWizard({ interactive: false, outputDir: tmpDir });
      const result = await wizard.quickSetup('openai', 'sk-test-key');

      expect(result.success).toBe(true);
      expect(result.config?.providers[0].type).toBe('openai-compatible');
    });

    it('should set provider enabled to true', async () => {
      const wizard = new ConfigWizard({ interactive: false, outputDir: tmpDir });
      const result = await wizard.quickSetup('openai', 'sk-test-key');

      expect(result.success).toBe(true);
      expect(result.config?.providers[0].enabled).toBe(true);
    });

    it('should set config version to 1', async () => {
      const wizard = new ConfigWizard({ interactive: false, outputDir: tmpDir });
      const result = await wizard.quickSetup('openai', 'sk-test-key');

      expect(result.success).toBe(true);
      expect(result.config?.version).toBe(1);
    });

    it('should fail when saveConfig throws an error', async () => {
      const { writeFileSync } = await import('node:fs');
      const mockWrite = vi.mocked(writeFileSync);
      mockWrite.mockImplementationOnce(() => {
        throw new Error('Disk full');
      });

      const wizard = new ConfigWizard({ interactive: false, outputDir: tmpDir });
      const result = await wizard.quickSetup('openai', 'sk-test-key');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Disk full');

      mockWrite.mockRestore();
    });
  });

  // ─── quickSetupProvider (convenience function) ───────────────────────

  describe('quickSetupProvider', () => {
    beforeEach(async () => {
      // quickSetupProvider uses real CONFIG_DIR; stub writeFileSync to avoid side-effects
      const { writeFileSync } = await import('node:fs');
      vi.mocked(writeFileSync).mockImplementation(() => {});
    });

    afterEach(async () => {
      // Restore the default mock implementation for other describe blocks
      const { writeFileSync } = await import('node:fs');
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
      vi.mocked(writeFileSync).mockImplementation(actual.writeFileSync);
    });

    it('should return a WizardResult with config on success', async () => {
      const result = await quickSetupProvider('openai', 'sk-test-key');

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('config');
      expect(result).toHaveProperty('configPath');
      expect(result.config?.providers).toHaveLength(1);
    });

    it('should quick setup a known provider successfully', async () => {
      const result = await quickSetupProvider('openai', 'sk-test-key');

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config?.providers[0].name).toBe('OpenAI');
      expect(result.config?.providers[0].type).toBe('openai-compatible');
      expect(result.config?.providers[0].enabled).toBe(true);
      expect(result.config?.version).toBe(1);
    });

    it('should fail for unknown provider', async () => {
      const result = await quickSetupProvider('nonexistent', 'sk-test-key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown provider');
      expect(result.error).toContain('nonexistent');
    });

    it('should use custom baseURL when provided', async () => {
      const result = await quickSetupProvider(
        'openai',
        'sk-test-key',
        'https://custom.openai.com/v1',
      );

      expect(result.success).toBe(true);
      expect(result.config?.providers[0].baseURL).toBe('https://custom.openai.com/v1');
    });

    it('should use custom model when provided', async () => {
      const result = await quickSetupProvider(
        'openai',
        'sk-test-key',
        undefined,
        'gpt-4-turbo',
      );

      expect(result.success).toBe(true);
      expect(result.config?.providers[0].model).toBe('gpt-4-turbo');
    });

    it('should use custom baseURL and model together', async () => {
      const result = await quickSetupProvider(
        'deepseek',
        'sk-key',
        'https://custom.deepseek.com/v1',
        'deepseek-coder',
      );

      expect(result.success).toBe(true);
      expect(result.config?.providers[0].baseURL).toBe('https://custom.deepseek.com/v1');
      expect(result.config?.providers[0].model).toBe('deepseek-coder');
    });

    it('should use template defaults when baseURL and model omitted', async () => {
      const result = await quickSetupProvider('groq', 'sk-groq-key');

      expect(result.success).toBe(true);
      expect(result.config?.providers[0].baseURL).toBe('https://api.groq.com/openai/v1');
      expect(result.config?.providers[0].model).toBe('llama-3.1-70b-versatile');
    });

    it('should list available providers in error message', async () => {
      const result = await quickSetupProvider('bad', 'sk-key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('openai');
      expect(result.error).toContain('deepseek');
      expect(result.error).toContain('qwen');
      expect(result.error).toContain('groq');
      expect(result.error).toContain('custom');
    });
  });

  // ─── run() - Non-interactive mode ────────────────────────────────────

  describe('run - non-interactive mode', () => {
    it('should succeed with OPENAI_API_KEY env var', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-env-key';

      try {
        const wizard = new ConfigWizard({
          interactive: false,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(true);
        expect(result.config).toBeDefined();
        expect(result.config?.providers[0].name).toBe('OpenAI');
        expect(result.config?.providers[0].apiKey).toBe('sk-env-key');
        expect(result.configPath).toBeDefined();
      } finally {
        if (originalEnv === undefined) {
          delete process.env.OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should fail when no API key available in non-interactive mode', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const wizard = new ConfigWizard({
          interactive: false,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(false);
        expect(result.error).toBe('API key is required');
      } finally {
        if (originalEnv !== undefined) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should default to OpenAI provider in non-interactive mode', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-env-key';

      try {
        const wizard = new ConfigWizard({
          interactive: false,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(true);
        expect(result.config?.providers[0].baseURL).toBe('https://api.openai.com/v1');
        expect(result.config?.providers[0].model).toBe('gpt-4o');
        expect(result.config?.providers[0].type).toBe('openai-compatible');
        expect(result.config?.providers[0].enabled).toBe(true);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });
  });

  // ─── run() - Interactive mode with mocked readline ───────────────────

  describe('run - interactive mode', () => {
    let mockReadline: ReturnType<typeof createMockReadline>;

    beforeEach(async () => {
      const { createInterface } = await import('node:readline');
      mockReadline = createMockReadline([]);
      vi.mocked(createInterface).mockReturnValue(mockReadline as unknown as ReturnType<typeof createInterface>);
    });

    it('should handle full interactive flow selecting provider 1', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      mockReadline.question
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('1'))  // select provider
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('sk-interactive-key')); // API key

      try {
        const wizard = new ConfigWizard({
          interactive: true,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(true);
        expect(result.config?.providers[0].name).toBe('OpenAI');
        expect(result.config?.providers[0].apiKey).toBe('sk-interactive-key');

        // Verify close() was called (readline interface closed)
        expect(mockReadline.close).toHaveBeenCalled();
      } finally {
        if (originalEnv !== undefined) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should handle interactive flow with DeepSeek provider selection', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      mockReadline.question
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('2'))  // DeepSeek
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('sk-deepseek-key'));

      try {
        const wizard = new ConfigWizard({
          interactive: true,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(true);
        expect(result.config?.providers[0].name).toBe('DeepSeek');
        expect(mockReadline.close).toHaveBeenCalled();
      } finally {
        if (originalEnv !== undefined) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should handle interactive flow with Qwen provider selection', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      mockReadline.question
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('3'))  // Qwen
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('sk-qwen-key'));

      try {
        const wizard = new ConfigWizard({
          interactive: true,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(true);
        expect(result.config?.providers[0].name).toBe('Qwen (通义千问)');
        expect(mockReadline.close).toHaveBeenCalled();
      } finally {
        if (originalEnv !== undefined) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should handle interactive flow with Groq provider selection', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      mockReadline.question
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('4'))  // Groq
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('sk-groq-key'));

      try {
        const wizard = new ConfigWizard({
          interactive: true,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(true);
        expect(result.config?.providers[0].name).toBe('Groq');
        expect(mockReadline.close).toHaveBeenCalled();
      } finally {
        if (originalEnv !== undefined) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should handle custom provider with interactive URL and model input', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      mockReadline.question
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('5'))  // Custom
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('sk-custom-key'))  // API key
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('https://custom.api.com/v1'))  // baseURL
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('my-custom-model'));  // model

      try {
        const wizard = new ConfigWizard({
          interactive: true,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(true);
        expect(result.config?.providers[0].name).toBe('Custom Provider');
        expect(result.config?.providers[0].baseURL).toBe('https://custom.api.com/v1');
        expect(result.config?.providers[0].model).toBe('my-custom-model');
        expect(mockReadline.close).toHaveBeenCalled();
      } finally {
        if (originalEnv !== undefined) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should default to OpenAI for invalid provider selection', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      mockReadline.question
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('99'))  // invalid
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('sk-key'));

      try {
        const wizard = new ConfigWizard({
          interactive: true,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(true);
        expect(result.config?.providers[0].name).toBe('OpenAI');
        expect(mockReadline.close).toHaveBeenCalled();
      } finally {
        if (originalEnv !== undefined) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should default to OpenAI for zero provider selection', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      mockReadline.question
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('0'))  // zero = invalid
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('sk-key'));

      try {
        const wizard = new ConfigWizard({
          interactive: true,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(true);
        expect(result.config?.providers[0].name).toBe('OpenAI');
      } finally {
        if (originalEnv !== undefined) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should fail when user provides empty API key', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      mockReadline.question
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('1'))  // provider
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb(''));  // empty API key

      try {
        const wizard = new ConfigWizard({
          interactive: true,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(false);
        expect(result.error).toBe('API key is required');
        expect(mockReadline.close).toHaveBeenCalled();
      } finally {
        if (originalEnv !== undefined) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should offer to use OPENAI_API_KEY from environment', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-env-key';

      mockReadline.question
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('1'))  // provider
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('y')); // use env key

      try {
        const wizard = new ConfigWizard({
          interactive: true,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(true);
        expect(result.config?.providers[0].apiKey).toBe('sk-env-key');
        expect(mockReadline.close).toHaveBeenCalled();
      } finally {
        if (originalEnv === undefined) {
          delete process.env.OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should allow user to decline env key and enter custom key', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-env-key';

      mockReadline.question
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('1'))    // provider
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('n'))    // decline env key
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('sk-custom-key')); // custom key

      try {
        const wizard = new ConfigWizard({
          interactive: true,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(true);
        expect(result.config?.providers[0].apiKey).toBe('sk-custom-key');
        expect(mockReadline.close).toHaveBeenCalled();
      } finally {
        if (originalEnv === undefined) {
          delete process.env.OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should confirm overwrite when config already exists', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-env-key';

      // Pre-create a providers.json to trigger the overwrite prompt
      const { writeFileSync: realWrite, existsSync: realExists } = await vi.importActual<typeof import('node:fs')>('node:fs');
      const configPath = join(tmpDir, 'providers.json');
      realWrite(configPath, '{"version":1,"providers":[],"activeId":""}');

      const { existsSync } = await import('node:fs');
      vi.mocked(existsSync).mockImplementation((p: import('node:fs').PathLike) => {
        if (p === configPath) return true;
        return realExists(p);
      });

      mockReadline.question
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('y'))  // confirm overwrite
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('1'))  // provider
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('y')); // use env key

      try {
        const wizard = new ConfigWizard({
          interactive: true,
          skipConfirmation: false,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(true);
        expect(mockReadline.close).toHaveBeenCalled();
      } finally {
        if (originalEnv === undefined) {
          delete process.env.OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = originalEnv;
        }
        vi.mocked(existsSync).mockRestore();
      }
    });

    it('should cancel when user declines to overwrite existing config', async () => {
      const { writeFileSync: realWrite, existsSync: realExists } = await vi.importActual<typeof import('node:fs')>('node:fs');
      const configPath = join(tmpDir, 'providers.json');
      realWrite(configPath, '{"version":1,"providers":[],"activeId":""}');

      const { existsSync } = await import('node:fs');
      vi.mocked(existsSync).mockImplementation((p: import('node:fs').PathLike) => {
        if (p === configPath) return true;
        return realExists(p);
      });

      mockReadline.question
        .mockImplementationOnce((_p: string, cb: (a: string) => void) => cb('n'));  // decline overwrite

      try {
        const wizard = new ConfigWizard({
          interactive: true,
          skipConfirmation: false,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Configuration cancelled by user');
        expect(mockReadline.close).toHaveBeenCalled();
      } finally {
        vi.mocked(existsSync).mockRestore();
      }
    });
  });

  // ─── run() - Error handling ──────────────────────────────────────────

  describe('run - error handling', () => {
    it('should handle save error during run', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-env-key';

      const { writeFileSync } = await import('node:fs');
      const mockWrite = vi.mocked(writeFileSync);
      mockWrite.mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      try {
        const wizard = new ConfigWizard({
          interactive: false,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Permission denied');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = originalEnv;
        }
        mockWrite.mockRestore();
      }
    });

    it('should handle non-Error thrown during run', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-env-key';

      const { writeFileSync } = await import('node:fs');
      const mockWrite = vi.mocked(writeFileSync);
      mockWrite.mockImplementationOnce(() => {
        throw 'string error';  
      });

      try {
        const wizard = new ConfigWizard({
          interactive: false,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(false);
        expect(result.error).toBe('string error');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = originalEnv;
        }
        mockWrite.mockRestore();
      }
    });
  });

  // ─── close() method (L355-359) ───────────────────────────────────────

  describe('close method', () => {
    it('should close readline interface when run completes (interactive mode)', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const { createInterface } = await import('node:readline');
      const mockRl = createMockReadline(['1', 'sk-key']);
      vi.mocked(createInterface).mockReturnValue(mockRl as unknown as ReturnType<typeof createInterface>);

      try {
        const wizard = new ConfigWizard({
          interactive: true,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        await wizard.run();

        // L355-359: close() should have been called, which calls rl.close() and sets rl = null
        expect(mockRl.close).toHaveBeenCalledTimes(1);
      } finally {
        if (originalEnv !== undefined) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should close readline interface even when run fails (interactive mode)', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const { createInterface } = await import('node:readline');
      const mockRl = createMockReadline(['1', '']);  // empty key = failure
      vi.mocked(createInterface).mockReturnValue(mockRl as unknown as ReturnType<typeof createInterface>);

      try {
        const wizard = new ConfigWizard({
          interactive: true,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        const result = await wizard.run();

        expect(result.success).toBe(false);
        // close() is in finally block, so it should still be called
        expect(mockRl.close).toHaveBeenCalledTimes(1);
      } finally {
        if (originalEnv !== undefined) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should not attempt to close when no readline was created (non-interactive)', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-env-key';

      const { createInterface } = await import('node:readline');

      try {
        const wizard = new ConfigWizard({
          interactive: false,
          skipConfirmation: true,
          outputDir: tmpDir,
        });
        await wizard.run();

        // In non-interactive mode, getInput is never called, so createInterface is not called
        expect(createInterface).not.toHaveBeenCalled();
      } finally {
        if (originalEnv === undefined) {
          delete process.env.OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });
  });

  // ─── runConfigWizard (convenience function) ──────────────────────────

  describe('runConfigWizard', () => {
    it('should return a WizardResult with success: false when no API key is available', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const result = await runConfigWizard({ interactive: false, skipConfirmation: true });

        expect(result).toHaveProperty('success', false);
        expect(result).toHaveProperty('error');
        expect(result.error).toBe('API key is required');
      } finally {
        if (originalEnv !== undefined) {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });

    it('should return a WizardResult with success: true when API key is available', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-env-key';

      try {
        const result = await runConfigWizard({
          interactive: false,
          skipConfirmation: true,
          outputDir: tmpDir,
        });

        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('config');
        expect(result).toHaveProperty('configPath');
        expect(result.config?.providers).toHaveLength(1);
        expect(result.config?.providers[0].apiKey).toBe('sk-env-key');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.OPENAI_API_KEY;
        } else {
          process.env.OPENAI_API_KEY = originalEnv;
        }
      }
    });
  });

  // ─── getProviderTemplates ────────────────────────────────────────────

  describe('getProviderTemplates', () => {
    it('should return all provider templates', () => {
      const templates = getProviderTemplates();
      expect(templates.length).toBe(5);
    });

    it('should include OpenAI template', () => {
      const templates = getProviderTemplates();
      const openai = templates.find((t) => t.id === 'openai');
      expect(openai).toBeDefined();
      expect(openai?.name).toBe('OpenAI');
      expect(openai?.baseURL).toContain('openai.com');
      expect(openai?.model).toBe('gpt-4o');
    });

    it('should include DeepSeek template', () => {
      const templates = getProviderTemplates();
      const deepseek = templates.find((t) => t.id === 'deepseek');
      expect(deepseek).toBeDefined();
      expect(deepseek?.name).toBe('DeepSeek');
      expect(deepseek?.baseURL).toBe('https://api.deepseek.com/v1');
      expect(deepseek?.model).toBe('deepseek-chat');
    });

    it('should include Qwen template', () => {
      const templates = getProviderTemplates();
      const qwen = templates.find((t) => t.id === 'qwen');
      expect(qwen).toBeDefined();
      expect(qwen?.name).toContain('Qwen');
      expect(qwen?.baseURL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
      expect(qwen?.model).toBe('qwen-plus');
    });

    it('should include Groq template', () => {
      const templates = getProviderTemplates();
      const groq = templates.find((t) => t.id === 'groq');
      expect(groq).toBeDefined();
      expect(groq?.name).toBe('Groq');
      expect(groq?.baseURL).toBe('https://api.groq.com/openai/v1');
      expect(groq?.model).toBe('llama-3.1-70b-versatile');
    });

    it('should include custom template', () => {
      const templates = getProviderTemplates();
      const custom = templates.find((t) => t.id === 'custom');
      expect(custom).toBeDefined();
      expect(custom?.name).toBe('Custom Provider');
      expect(custom?.baseURL).toBe('');
      expect(custom?.model).toBe('');
    });

    it('should have valid template structure', () => {
      const templates = getProviderTemplates();
      for (const template of templates) {
        expect(template.id).toBeDefined();
        expect(template.name).toBeDefined();
        expect(typeof template.baseURL).toBe('string');
        expect(typeof template.model).toBe('string');
        expect(template.description).toBeDefined();
      }
    });

    it('should return a copy (not the original array)', () => {
      const templates1 = getProviderTemplates();
      const templates2 = getProviderTemplates();
      expect(templates1).not.toBe(templates2);
      expect(templates1).toEqual(templates2);
    });
  });
});
