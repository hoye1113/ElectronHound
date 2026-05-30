import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../apps/server/src/server.js';
import { MCPClient } from '../../packages/agent-core/src/mcp/client.js';
import { AgentLoop } from '../../packages/agent-core/src/runtime/agentLoop.js';
import { SessionManager } from '../../packages/agent-core/src/session/sessionManager.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import type { LLMProvider } from '../../packages/agent-core/src/llm/types.js';

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
});

afterEach(async () => {
  await server.close();
  db.close();
  try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

/**
 * Creates a mock LLM provider that simulates a 3-step agent cycle:
 *   Step 1: Observe app loading → Plan launch → Verify: retry
 *   Step 2: Observe app loaded → Plan click button → Verify: retry
 *   Step 3: Observe success → Verify: pass
 */
function createMockCycleLLM(): LLMProvider {
  let step = 0;
  return {
    async generateText() {
      step++;
      if (step === 1) return { text: 'App is starting up, loading spinner visible' };
      if (step === 2) return { text: 'App loaded, main page visible with Settings button' };
      return { text: 'Settings page displayed, goal achieved' };
    },
    async generateObject() {
      // Plan phase (step is already incremented by generateText)
      if (step <= 2) {
        return {
          object: {
            reasoning: step === 1 ? 'Need to launch the app' : 'Need to click Settings',
            action: step === 1 ? 'Launch app' : 'Click Settings button',
            toolName: step === 1 ? 'electron_launch' : 'browser_click',
            toolArgs: step === 1
              ? { targetAppPath: '/test/app' }
              : { ref: 'settings-btn' },
            expectedOutcome: step === 1 ? 'App launches' : 'Settings page opens',
            verdict: 'retry',
          },
        };
      }
      // Verify phase: goal achieved
      return {
        object: {
          reasoning: 'Settings page is displayed, goal is complete',
          action: 'Confirm success',
          toolName: 'browser_snapshot',
          toolArgs: {},
          expectedOutcome: 'Confirmed',
          verdict: 'pass',
        },
      };
    },
  };
}

describe('Full test cycle: REST API + AgentLoop', () => {
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

  it('executes agent loop and reaches a terminal state', async () => {
    // Wire up AgentLoop with a mock LLM that simulates a 3-step test cycle
    const mockClient = new MCPClient();
    await mockClient.connect({});

    const sessionManager = new SessionManager(':memory:');
    const llm = createMockCycleLLM();

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager,
      mcpClient: mockClient,
      maxSteps: 10,
      stuckThreshold: 5,
    });

    const result = await loop.run('Click the Settings button');

    // Should reach a terminal verdict
    expect(['pass', 'fail', 'stuck']).toContain(result.verdict);
    expect(result.sessionId).toBeDefined();

    // Report should be generated
    expect(result.report).toBeDefined();
    expect(result.report!.goal).toBe('Click the Settings button');
    expect(result.report!.verdict).toBe(result.verdict);
    expect(result.report!.stepCount).toBeGreaterThan(0);
    expect(result.report!.summary).toBeDefined();
    expect(result.report!.timestamp).toBeDefined();

    // Session should be persisted
    const session = sessionManager.getSession(result.sessionId);
    expect(session).not.toBeNull();
    expect(session!.entries.length).toBeGreaterThan(0);

    // First entry should be the user's task prompt
    expect(session!.entries[0].content).toBe('Click the Settings button');
    expect(session!.entries[0].role).toBe('user');

    sessionManager.close();
  });

  it('agent loop records all phases in session entries', async () => {
    const mockClient = new MCPClient();
    await mockClient.connect({});

    const sessionManager = new SessionManager(':memory:');
    const llm = createMockCycleLLM();

    const loop = new AgentLoop({
      llmProvider: llm,
      sessionManager,
      mcpClient: mockClient,
      maxSteps: 10,
      stuckThreshold: 5,
    });

    const result = await loop.run('Test session recording');

    const session = sessionManager.getSession(result.sessionId);
    expect(session).not.toBeNull();

    // Each step produces multiple session entries:
    //   - observation (assistant)
    //   - plan (assistant)
    //   - execution (system)
    //   - verdict (assistant)
    // Plus: initial user entry and final report
    const roles = session!.entries.map(e => e.role);
    expect(roles).toContain('user');     // task prompt
    expect(roles).toContain('assistant'); // observation, plan, verdict
    expect(roles).toContain('system');    // execution result, report

    // Last entry should be the report
    const lastEntry = session!.entries[session!.entries.length - 1];
    expect(lastEntry.type).toBe('system');
    const reportData = JSON.parse(lastEntry.content);
    expect(reportData.goal).toBe('Test session recording');
    expect(reportData.verdict).toBeDefined();

    sessionManager.close();
  });
});

describe('PatternStore integration', () => {
  // Pattern write/load/dedup tested at unit level in feedbackLoader.test.ts (savePatterns integration)
  it.skip('writes feedback patterns from completed agent runs — covered by feedbackLoader.test.ts', () => {});
  it.skip('deduplicates patterns by error type and description — covered by feedbackLoader.test.ts', () => {});
  it.skip('loads patterns for prompt context with size cap — covered by feedbackLoader.test.ts', () => {});
});
