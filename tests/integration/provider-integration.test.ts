import { describe, it, expect, skip, beforeEach, afterEach } from 'vitest';
import {
  loadProvidersConfig,
  saveProvidersConfig,
  addProvider,
  setActiveProvider,
  deleteProvider,
} from '../../packages/agent-core/src/config-manager.js';
import { createProviderInstance } from '../../packages/agent-core/src/provider-factory.js';
import { runTest } from '../../packages/agent-core/src/runner.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { LLMProviderConfig } from '../../packages/agent-core/src/llm-types.js';

/**
 * Integration tests for multi-provider LLM configuration.
 *
 * These tests require real API keys and make actual API calls.
 * They are marked as `skip` by default and should be run manually
 * when the corresponding API keys are available in the environment.
 *
 * To run:
 *   1. Set the required API key environment variables
 *   2. Remove the `skip` or run with --reporter=verbose
 */

let cleanupDir: string;

// Helper to set up temp config directory
// Note: config-manager uses ~/.eata/providers.json (hardcoded via config-paths.ts),
// so these tests work with the actual config file. For isolated testing,
// we rely on the config-manager.test.ts unit tests with mocked paths.

beforeEach(() => {
  cleanupDir = mkdtempSync(join(tmpdir(), 'eata-integration-'));
});

afterEach(() => {
  try {
    rmSync(cleanupDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe.skip('Integration: Provider Configuration', () => {
  it('full CRUD lifecycle for providers', () => {
    const provider: LLMProviderConfig = {
      id: 'integration-test-1',
      name: 'Integration Test Provider',
      type: 'openai-compatible',
      apiKey: process.env.OPENAI_API_KEY || 'sk-test',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      enabled: true,
    };

    // Add provider
    const config = addProvider(provider);
    expect(config.providers.find(p => p.id === 'integration-test-1')).toBeDefined();

    // Set as active
    const activated = setActiveProvider('integration-test-1');
    expect(activated?.activeId).toBe('integration-test-1');

    // Delete provider
    const deleted = deleteProvider('integration-test-1');
    expect(deleted).not.toBeNull();
    expect(deleted?.providers.find(p => p.id === 'integration-test-1')).toBeUndefined();
  });
});

describe.skip('Integration: Provider Factory with Real API', () => {
  it('creates OpenAI provider instance and generates text', async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    const config: LLMProviderConfig = {
      id: 'openai-real',
      name: 'OpenAI',
      type: 'openai-compatible',
      apiKey,
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      enabled: true,
    };

    const model = createProviderInstance(config);
    expect(model).toBeDefined();

    const { generateText } = await import('ai');
    const result = await generateText({
      model,
      prompt: 'Say "hello" in one word.',
      maxTokens: 10,
    });

    expect(result.text).toBeDefined();
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('creates DeepSeek provider instance with correct baseURL', async () => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY environment variable is required');
    }

    const config: LLMProviderConfig = {
      id: 'deepseek-real',
      name: 'DeepSeek',
      type: 'openai-compatible',
      apiKey,
      baseURL: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      enabled: true,
    };

    const model = createProviderInstance(config);
    expect(model).toBeDefined();

    const { generateText } = await import('ai');
    const result = await generateText({
      model,
      prompt: 'Say "hello" in one word.',
      maxTokens: 10,
    });

    expect(result.text).toBeDefined();
    expect(result.text.length).toBeGreaterThan(0);
  });
});

describe.skip('Integration: runTest with Specific Provider', () => {
  it('runs a test task using a specific provider', async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    // Set up provider config
    const provider: LLMProviderConfig = {
      id: 'integration-openai',
      name: 'OpenAI GPT-4o-mini',
      type: 'openai-compatible',
      apiKey,
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      enabled: true,
    };

    saveProvidersConfig({
      version: 1,
      providers: [provider],
      activeId: 'integration-openai',
    });

    const result = await runTest({
      goal: 'Verify the application loads correctly',
      targetAppPath: './fixtures/test-electron-app',
      providerId: 'integration-openai',
      taskId: 'integration-test-provider',
      checkpointPath: join(cleanupDir, 'checkpoints.sqlite3'),
      maxSteps: 5,
    });

    expect(result).toBeDefined();
    expect(['completed', 'failed', 'aborted']).toContain(result.status);
  });

  it('rejects invalid providerId during runTest', async () => {
    saveProvidersConfig({
      version: 1,
      providers: [],
      activeId: '',
    });

    await expect(
      runTest({
        goal: 'Test',
        targetAppPath: '/test/app',
        providerId: 'nonexistent',
        taskId: 'integration-test-invalid',
        checkpointPath: ':memory:',
      }),
    ).rejects.toThrow("Provider 'nonexistent' not found");
  });
});
