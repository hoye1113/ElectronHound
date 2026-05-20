import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../apps/server/src/server.js';
import { createTestGraph } from '../../packages/agent-core/src/graph.js';
import { setMCPClient, MCPClient } from '../../packages/agent-core/src/mcp/client.js';
import { PatternStore } from '../../packages/agent-core/src/report-graph/pattern-store.js';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

let server: FastifyInstance;
let db: Database.Database;
let cleanupDir: string;
let dataDir: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'eata-e2e-cycle-'));
  const dbPath = join(dataDir, 'db.sqlite3');
  cleanupDir = dataDir;
  const bundle = await buildServer({
    databasePath: dbPath,
    dataDir,
  });
  server = bundle.server;
  db = bundle.db;

  // Set up mock MCP client for graph execution (no real LLM needed)
  const mockClient = new MCPClient();
  await mockClient.connect({});
  setMCPClient(mockClient);
});

afterEach(async () => {
  await server.close();
  db.close();
  try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('Full test cycle: REST API + Graph + PatternStore', () => {
  it('creates a task via REST API', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        goal: 'Click the Settings button',
        targetAppPath: '/test/app',
        llmModel: 'gpt-4o',
        maxSteps: 10,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeDefined();
    expect(body.goal).toBe('Click the Settings button');
    expect(body.status).toBe('queued');
  });

  it('lists tasks after creation', async () => {
    // Create a task first
    await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        goal: 'Test task listing',
        targetAppPath: '/test/app',
        llmModel: 'gpt-4o',
      },
    });

    const res = await server.inject({ method: 'GET', url: '/api/tasks' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.total).toBeDefined();
  });

  it('executes graph and reaches a terminal state', async () => {
    const graph = createTestGraph();
    const compiled = graph.compile();

    const result = await compiled.invoke(
      {
        goal: 'Test full cycle',
        targetAppPath: '/test/app',
        llmModel: 'gpt-4o',
        maxSteps: 10,
        taskId: 'e2e-full-cycle',
      },
      { configurable: { thread_id: 'e2e-full-cycle' }, recursionLimit: 100 },
    );

    expect(result).toBeDefined();
    expect(result.status).not.toBe('running');
    // Graph should reach one of: completed, failed, or aborted
    expect(['completed', 'failed', 'aborted']).toContain(result.status);
    expect(result.stepCount).toBeGreaterThan(0);
  });

  it('reads and writes feedback patterns', () => {
    const store = new PatternStore(dataDir);

    // Insert a pattern
    const pattern = {
      id: crypto.randomUUID(),
      errorType: 'element_not_found',
      targetDescription: 'Settings button on main page',
      remediationHint: 'Wait for page to fully load before clicking',
      similarityKeywords: ['settings', 'button', 'navigation'],
      frequency: 1,
      lastSeen: new Date().toISOString(),
      relatedGoalPatterns: ['click settings', 'navigate settings'],
    };
    store.upsert(pattern);

    // Read it back
    const all = store.readAll();
    expect(all.length).toBe(1);
    expect(all[0].errorType).toBe('element_not_found');
    expect(all[0].remediationHint).toBe('Wait for page to fully load before clicking');
    expect(all[0].similarityKeywords).toContain('settings');

    // Upsert again → should increment frequency
    const updated = store.upsert({
      ...pattern,
      frequency: 1,
      lastSeen: new Date().toISOString(),
    });
    expect(updated.frequency).toBeGreaterThanOrEqual(2);
  });

  it('loads patterns for prompt injection with max 50 cap', () => {
    const store = new PatternStore(dataDir);

    // Insert 60 patterns
    for (let i = 0; i < 60; i++) {
      store.upsert({
        id: crypto.randomUUID(),
        errorType: `error-type-${i}`,
        targetDescription: `target description for test ${i}`,
        remediationHint: `Try doing X instead for error ${i}`,
        similarityKeywords: ['test', `keyword-${i}`],
        frequency: 1,
        lastSeen: new Date().toISOString(),
        relatedGoalPatterns: ['test goal'],
      });
    }

    const prompt = store.loadPatternsForPrompt('test goal', 50);
    // Should return a non-empty string capped at 50 patterns
    expect(prompt.length).toBeGreaterThan(0);
    // Count occurrences of "error-type-" to verify cap
    const matches = prompt.match(/error-type-/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeLessThanOrEqual(50);
  });
});
