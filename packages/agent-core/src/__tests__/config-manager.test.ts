import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { LLMProviderConfig } from '../llm-types.js';

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
  addProvider,
  updateProvider,
  deleteProvider,
  setActiveProvider,
  getActiveProviderConfig,
} from '../config-manager.js';

const TEST_PROVIDER: LLMProviderConfig = {
  id: 'test-1',
  name: 'Test Provider',
  type: 'openai-compatible',
  apiKey: 'sk-test-key',
  baseURL: 'https://api.test.com/v1',
  model: 'test-model',
  enabled: true,
};

describe('ConfigManager', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'eata-config-test-'));
    mockConfigDir = tempDir;
    mockProvidersFile = join(tempDir, 'providers.json');
  });

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('loadProvidersConfig', () => {
    it('returns default providers when file does not exist', () => {
      const config = loadProvidersConfig();
      expect(config.version).toBe(1);
      expect(config.providers.length).toBe(3);
      expect(config.activeId).toBe('openai-default');
    });

    it('returns saved config when file exists', () => {
      const custom = {
        version: 1,
        providers: [TEST_PROVIDER],
        activeId: 'test-1',
      };
      saveProvidersConfig(custom);

      const loaded = loadProvidersConfig();
      expect(loaded.providers).toHaveLength(1);
      expect(loaded.providers[0].id).toBe('test-1');
      expect(loaded.activeId).toBe('test-1');
    });

    it('returns defaults on corrupted file', () => {
      // Write invalid JSON
      saveProvidersConfig({ version: 1, providers: [], activeId: '' });
      // Manually corrupt it
      const { writeFileSync } = require('node:fs');
      writeFileSync(mockProvidersFile, 'not json');

      const config = loadProvidersConfig();
      expect(config.version).toBe(1);
      expect(config.providers.length).toBe(3); // defaults
    });
  });

  describe('addProvider', () => {
    it('adds a new provider', () => {
      const config = addProvider(TEST_PROVIDER);
      expect(config.providers).toHaveLength(4); // 3 defaults + 1 new
      expect(config.providers[3].id).toBe('test-1');
      expect(config.providers[3].name).toBe('Test Provider');
    });

    it('persists the new provider', () => {
      addProvider(TEST_PROVIDER);

      const loaded = loadProvidersConfig();
      expect(loaded.providers).toHaveLength(4);
      expect(loaded.providers.find(p => p.id === 'test-1')).toBeDefined();
    });
  });

  describe('updateProvider', () => {
    it('updates an existing provider', () => {
      addProvider(TEST_PROVIDER);

      const result = updateProvider('test-1', { name: 'Updated Name', model: 'new-model' });
      expect(result).not.toBeNull();

      const loaded = loadProvidersConfig();
      const updated = loaded.providers.find(p => p.id === 'test-1');
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.model).toBe('new-model');
      // Other fields preserved
      expect(updated?.apiKey).toBe('sk-test-key');
    });

    it('returns null for unknown provider ID', () => {
      const result = updateProvider('nonexistent', { name: 'Whatever' });
      expect(result).toBeNull();
    });
  });

  describe('deleteProvider', () => {
    it('deletes a provider', () => {
      addProvider(TEST_PROVIDER);
      const result = deleteProvider('test-1');
      expect(result).not.toBeNull();

      const loaded = loadProvidersConfig();
      expect(loaded.providers.find(p => p.id === 'test-1')).toBeUndefined();
    });

    it('returns null for nonexistent provider', () => {
      const result = deleteProvider('nonexistent');
      expect(result).toBeNull();
    });

    it('updates activeId when deleting active provider', () => {
      addProvider(TEST_PROVIDER);
      // Set test-1 as active
      const beforeDelete = loadProvidersConfig();
      expect(beforeDelete.activeId).toBe('openai-default'); // default active

      // Make test-1 active
      setActiveProvider('test-1');
      // Delete it
      const result = deleteProvider('test-1');
      expect(result).not.toBeNull();
      expect(result!.activeId).not.toBe('test-1');
    });
  });

  describe('setActiveProvider', () => {
    it('sets the active provider', () => {
      addProvider(TEST_PROVIDER);
      const config = setActiveProvider('test-1');
      expect(config).not.toBeNull();
      expect(config!.activeId).toBe('test-1');
    });

    it('returns null for unknown provider ID', () => {
      const result = setActiveProvider('nonexistent');
      expect(result).toBeNull();
    });

    it('persists the active provider change', () => {
      addProvider(TEST_PROVIDER);
      setActiveProvider('test-1');

      const loaded = loadProvidersConfig();
      expect(loaded.activeId).toBe('test-1');
    });
  });

  describe('getActiveProviderConfig', () => {
    it('returns the active provider', () => {
      const active = getActiveProviderConfig();
      // Default active is 'openai-default'
      expect(active).not.toBeNull();
      expect(active?.id).toBe('openai-default');
    });

    it('returns null when active provider does not exist', () => {
      // Manually create a config with invalid activeId
      saveProvidersConfig({
        version: 1,
        providers: [],
        activeId: 'nonexistent',
      });

      const active = getActiveProviderConfig();
      expect(active).toBeNull();
    });
  });
});
