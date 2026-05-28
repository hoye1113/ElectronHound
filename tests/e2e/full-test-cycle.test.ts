import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../apps/server/src/server.js';
import { setMCPClient, MCPClient } from '../../packages/agent-core/src/mcp/client.js';
import { mkdtempSync, rmSync } from 'node:fs';
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

  // TODO: Rewrite for AgentLoop (LangGraph StateGraph removed in Pi migration)
  it.skip('executes agent loop and reaches a terminal state', async () => {
    // Previously tested createTestGraph().compile().invoke()
    // Now needs to test AgentLoop via runTest() with a mock LLM provider
  });

  // TODO: PatternStore was removed with report-graph in Pi migration
  it.skip('reads and writes feedback patterns', () => {
    // PatternStore no longer exists — needs reimplementation
  });

  it.skip('loads patterns for prompt injection with max 50 cap', () => {
    // PatternStore no longer exists — needs reimplementation
  });
});
