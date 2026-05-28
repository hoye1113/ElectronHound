import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadProvidersConfig,
  saveProvidersConfig,
  addProvider,
  setActiveProvider,
  deleteProvider,
} from '../../packages/agent-core/src/config-manager.js';
import { createProviderInstance } from '../../packages/agent-core/src/llm/adapter.js';
import { runTest } from '../../packages/agent-core/src/runner.js';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { LLMProviderConfig } from '../../packages/agent-core/src/llm-types.js';
import { CONFIG_DIR, PROVIDERS_FILE } from '../../packages/agent-core/src/config-paths.js';

/**
 * Integration tests for multi-provider LLM configuration.
 *
 * The "Provider Configuration" tests exercise CRUD operations on the
 * providers.json config file. They back up and restore the original
 * file so they can run without side-effects.
 *
 * The "Provider Factory with Real API" and "runTest" tests make actual
 * LLM API calls and are skipped automatically when the required API
 * keys are absent from the environment.
 */

let savedConfig: string | null = null;
let cleanupDir: string;

beforeEach(() => {
  cleanupDir = mkdtempSync(join(tmpdir(), 'eata-integration-'));

  // Back up existing providers.json so tests can run in isolation
  if (existsSync(PROVIDERS_FILE)) {
    savedConfig = readFileSync(PROVIDERS_FILE, 'utf-8');
  } else {
    savedConfig = null;
  }
});

afterEach(() => {
  // Restore original providers.json
  if (savedConfig !== null) {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(PROVIDERS_FILE, savedConfig);
  } else if (existsSync(PROVIDERS_FILE)) {
    rmSync(PROVIDERS_FILE);
  }

  try {
    rmSync(cleanupDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('Integration: Provider Configuration', () => {
  it('full CRUD lifecycle for providers', () => {
    const provider: LLMProviderConfig = {
      id: 'integration-test-1',
      name: 'Integration Test Provider',
      type: 'openai-compatible',
      apiKey: 'sk-test-placeholder',
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

describe.skipIf(!process.env.OPENAI_API_KEY)('Integration: Provider Factory with Real API', () => {
  it('creates OpenAI provider instance and generates text', async () => {
    const apiKey = process.env.OPENAI_API_KEY!;
    const config: LLMProviderConfig = {
      id: 'openai-real',
      name: 'OpenAI',
      type: 'openai-compatible',
      apiKey,
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      enabled: true,
    };

    const provider = createProviderInstance(config);
    expect(provider).toBeDefined();

    const result = await provider.generateText({
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

    const provider = createProviderInstance(config);
    expect(provider).toBeDefined();

    const result = await provider.generateText({
      prompt: 'Say "hello" in one word.',
      maxTokens: 10,
    });

    expect(result.text).toBeDefined();
    expect(result.text.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!process.env.OPENAI_API_KEY)('Integration: runTest with Specific Provider', () => {
  it('runs a test task using a specific provider', async () => {
    const apiKey = process.env.OPENAI_API_KEY!;

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
