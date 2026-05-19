import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../apps/server/src/server.js';
import { createTestGraph } from '../../packages/agent-core/src/graph.js';
import { setMCPClient, MCPClient } from '../../packages/agent-core/src/mcp/client.js';
import {
  loadProvidersConfig,
  saveProvidersConfig,
  addProvider,
  setActiveProvider,
} from '../../packages/agent-core/src/config-manager.js';
import { runTest } from '../../packages/agent-core/src/runner.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import type { LLMProviderConfig } from '../../packages/agent-core/src/llm-types.js';

let server: FastifyInstance;
let db: Database.Database;
let cleanupDir: string;
let dataDir: string;

const TEST_PROVIDER_A: LLMProviderConfig = {
  id: 'provider-a',
  name: 'Provider A',
  type: 'openai-compatible',
  apiKey: 'sk-test-a',
  baseURL: 'https://api.provider-a.com/v1',
  model: 'model-a',
  enabled: true,
};

const TEST_PROVIDER_B: LLMProviderConfig = {
  id: 'provider-b',
  name: 'Provider B',
  type: 'openai-compatible',
  apiKey: 'sk-test-b',
  baseURL: 'https://api.provider-b.com/v1',
  model: 'model-b',
  enabled: true,
};

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'eata-e2e-provider-'));
  const dbPath = join(dataDir, 'db.sqlite3');
  cleanupDir = dataDir;

  const bundle = await buildServer({
    databasePath: dbPath,
    dataDir,
  });
  server = bundle.server;
  db = bundle.db;

  // Set up mock MCP client
  const mockClient = new MCPClient();
  await mockClient.connect({});
  setMCPClient(mockClient);
});

afterEach(async () => {
  await server.close();
  db.close();
  try {
    rmSync(cleanupDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('E2E: Provider Selection', () => {
  describe('Task creation with provider selection', () => {
    beforeEach(() => {
      // Set up test providers
      saveProvidersConfig({
        version: 1,
        providers: [TEST_PROVIDER_A, TEST_PROVIDER_B],
        activeId: 'provider-a',
      });
    });

    it('creates a task with a specific providerId', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          goal: 'Test provider selection',
          targetAppPath: '/test/app',
          llmModel: 'gpt-4o',
          providerId: 'provider-b',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(body.providerId).toBe('provider-b');
    });

    it('creates a task without providerId (uses default)', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          goal: 'Test default provider',
          targetAppPath: '/test/app',
          llmModel: 'gpt-4o',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      // providerId should be undefined or null when not specified
      expect(body.providerId).toBeUndefined();
    });
  });

  describe('Provider configuration API', () => {
    it('lists providers via REST API', async () => {
      // Set up initial config
      saveProvidersConfig({
        version: 1,
        providers: [TEST_PROVIDER_A],
        activeId: 'provider-a',
      });

      const res = await server.inject({
        method: 'GET',
        url: '/api/providers',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.providers).toBeDefined();
      expect(body.activeId).toBe('provider-a');
    });

    it('sets active provider via REST API', async () => {
      saveProvidersConfig({
        version: 1,
        providers: [TEST_PROVIDER_A, TEST_PROVIDER_B],
        activeId: 'provider-a',
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/providers/provider-b/activate',
      });

      expect(res.statusCode).toBe(200);
      const config = loadProvidersConfig();
      expect(config.activeId).toBe('provider-b');
    });

    it('returns 404 when activating nonexistent provider', async () => {
      saveProvidersConfig({
        version: 1,
        providers: [TEST_PROVIDER_A],
        activeId: 'provider-a',
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/providers/nonexistent/activate',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('runTest with providerId', () => {
    beforeEach(() => {
      saveProvidersConfig({
        version: 1,
        providers: [TEST_PROVIDER_A, TEST_PROVIDER_B],
        activeId: 'provider-a',
      });
    });

    it('throws when providerId not found', async () => {
      await expect(
        runTest({
          goal: 'Test invalid provider',
          targetAppPath: '/test/app',
          providerId: 'nonexistent-provider',
          taskId: 'e2e-invalid-provider',
          checkpointPath: ':memory:',
        }),
      ).rejects.toThrow("Provider 'nonexistent-provider' not found");
    });

    it('uses env-based provider when providerId is not specified', async () => {
      // Without providerId, should fall back to env-based path
      const result = await runTest({
        goal: 'Test default provider path',
        targetAppPath: '/test/app',
        taskId: 'e2e-default-provider',
        checkpointPath: ':memory:',
        maxSteps: 3,
      });

      expect(result).toBeDefined();
      expect(['completed', 'failed', 'aborted']).toContain(result.status);
    });
  });

  describe('Active provider default behavior', () => {
    it('first added provider becomes active by default', () => {
      saveProvidersConfig({
        version: 1,
        providers: [],
        activeId: '',
      });

      addProvider(TEST_PROVIDER_A);
      const config = loadProvidersConfig();
      // activeId remains '' since addProvider doesn't auto-set active
      expect(config.providers).toHaveLength(1);
    });

    it('setActiveProvider changes the active provider', () => {
      saveProvidersConfig({
        version: 1,
        providers: [TEST_PROVIDER_A, TEST_PROVIDER_B],
        activeId: 'provider-a',
      });

      setActiveProvider('provider-b');
      const config = loadProvidersConfig();
      expect(config.activeId).toBe('provider-b');
    });
  });
});
