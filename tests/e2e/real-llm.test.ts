import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../apps/server/src/server.js';
import { setMCPClient, MCPClient } from '../../packages/agent-core/src/mcp/client.js';
import { runTest } from '../../packages/agent-core/src/runner.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

const hasApiKey = !!process.env.OPENAI_API_KEY;

describe.skipIf(!hasApiKey)('Real LLM E2E tests', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let dataDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'eata-real-llm-'));
    const dbPath = join(dataDir, 'db.sqlite3');
    const bundle = await buildServer({ databasePath: dbPath, dataDir });
    server = bundle.server;
    db = bundle.db;

    const client = new MCPClient();
    await client.connect({ playwright: true });
    setMCPClient(client);
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });

  it('creates task and runs AI loop with fixture app', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        goal: 'Click the Settings menu item',
        targetAppPath: './fixtures/test-electron-app',
        llmModel: process.env.LLM_MODEL || 'gpt-4o',
        maxSteps: 10,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const task = JSON.parse(createRes.body);

    const result = await runTest({
      goal: task.goal,
      targetAppPath: task.targetAppPath,
      llmModel: task.llmModel,
      maxSteps: task.maxSteps,
      taskId: task.id,
    });

    expect(['completed', 'failed', 'aborted']).toContain(result.status);
    expect(result.stepCount).toBeGreaterThan(0);
  }, 60000);
});
