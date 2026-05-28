import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

// Mock @eata/agent-core to avoid file system side effects
const mockProviders = { version: 1, providers: [] as Record<string, unknown>[], activeId: '' };

vi.mock('@eata/agent-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@eata/agent-core')>();
  return {
    ...original,
    loadProvidersConfig: () => mockProviders,
    addProvider: (config: Record<string, unknown>) => {
      mockProviders.providers.push(config);
      return mockProviders;
    },
    updateProvider: (id: string, updates: Record<string, unknown>) => {
      const idx = mockProviders.providers.findIndex((p: Record<string, unknown>) => p.id === id);
      if (idx === -1) return null;
      mockProviders.providers[idx] = { ...mockProviders.providers[idx], ...updates };
      return mockProviders;
    },
    deleteProvider: (id: string) => {
      const before = mockProviders.providers.length;
      mockProviders.providers = mockProviders.providers.filter((p: Record<string, unknown>) => p.id !== id);
      return mockProviders.providers.length === before ? null : mockProviders;
    },
    setActiveProvider: (id: string) => {
      const exists = mockProviders.providers.some((p: Record<string, unknown>) => p.id === id);
      if (!exists) return null;
      mockProviders.activeId = id;
      return mockProviders;
    },
    createProviderInstance: () => ({
      generateObject: vi.fn().mockResolvedValue({ object: {} }),
      generateText: vi.fn().mockResolvedValue({ text: 'OK' }),
    }),
  };
});

import { buildServer } from '../server.js';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-providers-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

describe('Providers Routes', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    // Reset mock state
    mockProviders.providers = [];
    mockProviders.activeId = '';

    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
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

  it('GET /api/providers returns empty list', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/providers' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.providers).toEqual([]);
  });

  it('POST /api/providers creates new provider', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/providers',
      payload: {
        id: 'test-1',
        name: 'Test Provider',
        type: 'openai-compatible',
        apiKey: 'sk-test-key',
        baseURL: 'https://api.test.com/v1',
        model: 'gpt-4o',
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /api/providers rejects empty API key', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/providers',
      payload: {
        id: 'test-1',
        name: 'Test',
        type: 'openai-compatible',
        apiKey: '', // Empty!
        baseURL: 'https://api.test.com/v1',
        model: 'gpt-4o',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('PUT /api/providers/:id updates provider', async () => {
    // First create one via mock
    mockProviders.providers.push({
      id: 'test-1',
      name: 'Test Provider',
      type: 'openai-compatible',
      apiKey: 'sk-key',
      baseURL: 'https://api.test.com/v1',
      model: 'gpt-4o',
    });

    const res = await server.inject({
      method: 'PUT',
      url: '/api/providers/test-1',
      payload: { name: 'Updated Name' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('PUT /api/providers/:id returns 404 for non-existent', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/providers/nonexistent',
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/providers/:id deletes provider', async () => {
    // First create one via mock
    mockProviders.providers.push({
      id: 'test-1',
      name: 'Test Provider',
      type: 'openai-compatible',
      apiKey: 'sk-key',
      baseURL: 'https://api.test.com/v1',
      model: 'gpt-4o',
    });

    const res = await server.inject({
      method: 'DELETE',
      url: '/api/providers/test-1',
    });
    // Route returns the updated config object (200), not a no-content response
    expect(res.statusCode).toBe(200);
  });

  it('DELETE /api/providers/:id returns 404 for non-existent', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: '/api/providers/nonexistent',
    });
    expect(res.statusCode).toBe(404);
  });
});
