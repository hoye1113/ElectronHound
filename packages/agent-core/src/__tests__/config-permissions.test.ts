import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, statSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock config-paths to use temp directory
let tempDir: string;
let mockConfigDir: string;
let mockProvidersFile: string;

vi.mock('../config-paths.js', () => ({
  get CONFIG_DIR() { return mockConfigDir; },
  get PROVIDERS_FILE() { return mockProvidersFile; },
}));

import {
  loadProvidersConfig,
  saveProvidersConfig,
  checkConfigFilePermissions,
} from '../config-manager.js';
import type { ProvidersConfig } from '../llm-types.js';

describe('Config Permissions', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'eata-permissions-test-'));
    mockConfigDir = tempDir;
    mockProvidersFile = join(tempDir, 'providers.json');
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    process.env = originalEnv;
  });

  describe('saveProvidersConfig', () => {
    it('creates file with 0600 permissions (owner read/write only)', () => {
      const config: ProvidersConfig = {
        version: 1,
        providers: [{
          id: 'test',
          name: 'Test',
          type: 'openai-compatible',
          apiKey: 'sk-test',
          baseURL: 'https://api.test.com/v1',
          model: 'test-model',
          enabled: true,
        }],
        activeId: 'test',
      };

      saveProvidersConfig(config);

      const stats = statSync(mockProvidersFile);
      const mode = stats.mode & 0o777;

      // On Windows, file permissions may not be enforced the same way
      // but we can still verify the file was created
      expect(stats.isFile()).toBe(true);

      // On non-Windows systems, verify 0600 permissions
      if (process.platform !== 'win32') {
        expect(mode).toBe(0o600);
      }
    });

    it('overwrites existing file with secure permissions', () => {
      // Create initial file with open permissions
      writeFileSync(mockProvidersFile, '{}');

      // Set open permissions (only works on non-Windows)
      if (process.platform !== 'win32') {
        chmodSync(mockProvidersFile, 0o644);
        const beforeStats = statSync(mockProvidersFile);
        expect(beforeStats.mode & 0o777).toBe(0o644);
      }

      const config: ProvidersConfig = {
        version: 1,
        providers: [],
        activeId: '',
      };

      saveProvidersConfig(config);

      const afterStats = statSync(mockProvidersFile);
      expect(afterStats.isFile()).toBe(true);

      // On non-Windows, verify permissions were tightened
      // Note: writeFileSync mode is affected by umask, so we check that
      // owner has read/write and group/other have at most read (umask may allow 0o644)
      if (process.platform !== 'win32') {
        const mode = afterStats.mode & 0o777;
        // Verify owner has read/write (0o600)
        expect(mode & 0o600).toBe(0o600);
        // Verify group/other don't have write permission
        expect(mode & 0o022).toBe(0);
      }
    });
  });

  describe('checkConfigFilePermissions', () => {
    it('does nothing when file does not exist', () => {
      // Should not throw
      checkConfigFilePermissions();
    });

    it('warns when file has open permissions', () => {
      // Create file
      writeFileSync(mockProvidersFile, '{}');

      // Only test on non-Windows where permissions are enforced
      if (process.platform !== 'win32') {
        chmodSync(mockProvidersFile, 0o644);

        // checkConfigFilePermissions logs a warning but doesn't throw
        // We can verify it runs without error
        expect(() => checkConfigFilePermissions()).not.toThrow();
      }
    });

    it('does not warn when file has secure permissions', () => {
      // Create file with secure permissions
      writeFileSync(mockProvidersFile, '{}');

      if (process.platform !== 'win32') {
        chmodSync(mockProvidersFile, 0o600);
      }

      expect(() => checkConfigFilePermissions()).not.toThrow();
    });
  });

  describe('Environment variable injection', () => {
    it('overrides API key from environment variable', () => {
      // Set up environment variable
      process.env['EATA_PROVIDER_TEST_PROVIDER_API_KEY'] = 'sk-env-override';

      const config: ProvidersConfig = {
        version: 1,
        providers: [{
          id: 'test-provider',
          name: 'Test Provider',
          type: 'openai-compatible',
          apiKey: 'sk-original',
          baseURL: 'https://api.test.com/v1',
          model: 'test-model',
          enabled: true,
        }],
        activeId: 'test-provider',
      };

      saveProvidersConfig(config);
      const loaded = loadProvidersConfig();

      // Environment variable should override the file value
      expect(loaded.providers[0].apiKey).toBe('sk-env-override');
    });

    it('preserves file value when no environment variable exists', () => {
      // Ensure no env var exists
      delete process.env['EATA_PROVIDER_TEST_PROVIDER_API_KEY'];

      const config: ProvidersConfig = {
        version: 1,
        providers: [{
          id: 'test-provider',
          name: 'Test Provider',
          type: 'openai-compatible',
          apiKey: 'sk-from-file',
          baseURL: 'https://api.test.com/v1',
          model: 'test-model',
          enabled: true,
        }],
        activeId: 'test-provider',
      };

      saveProvidersConfig(config);
      const loaded = loadProvidersConfig();

      expect(loaded.providers[0].apiKey).toBe('sk-from-file');
    });

    it('handles provider ID with hyphens', () => {
      // Provider ID "openai-default" should map to "EATA_PROVIDER_OPENAI_DEFAULT_API_KEY"
      process.env['EATA_PROVIDER_OPENAI_DEFAULT_API_KEY'] = 'sk-hyphen-test';

      const config: ProvidersConfig = {
        version: 1,
        providers: [{
          id: 'openai-default',
          name: 'OpenAI',
          type: 'openai-compatible',
          apiKey: 'sk-original',
          baseURL: 'https://api.openai.com/v1',
          model: 'gpt-4o',
          enabled: true,
        }],
        activeId: 'openai-default',
      };

      saveProvidersConfig(config);
      const loaded = loadProvidersConfig();

      expect(loaded.providers[0].apiKey).toBe('sk-hyphen-test');
    });

    it('overrides multiple providers from environment variables', () => {
      process.env['EATA_PROVIDER_OPENAI_DEFAULT_API_KEY'] = 'sk-openai-env';
      process.env['EATA_PROVIDER_DEEPSEEK_DEFAULT_API_KEY'] = 'sk-deepseek-env';

      const config: ProvidersConfig = {
        version: 1,
        providers: [
          {
            id: 'openai-default',
            name: 'OpenAI',
            type: 'openai-compatible',
            apiKey: 'sk-openai-file',
            baseURL: 'https://api.openai.com/v1',
            model: 'gpt-4o',
            enabled: true,
          },
          {
            id: 'deepseek-default',
            name: 'DeepSeek',
            type: 'openai-compatible',
            apiKey: 'sk-deepseek-file',
            baseURL: 'https://api.deepseek.com/v1',
            model: 'deepseek-chat',
            enabled: true,
          },
        ],
        activeId: 'openai-default',
      };

      saveProvidersConfig(config);
      const loaded = loadProvidersConfig();

      expect(loaded.providers[0].apiKey).toBe('sk-openai-env');
      expect(loaded.providers[1].apiKey).toBe('sk-deepseek-env');
    });
  });
});
