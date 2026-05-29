import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildServer } from '../../apps/server/src/server.js';
import { SSEHub } from '../../apps/server/src/streams/sseHub.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance, FastifyReply } from 'fastify';

let server: FastifyInstance;
let db: Database.Database;
let cleanupDir: string;

beforeEach(async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-e2e-sse-'));
  cleanupDir = tmpDir;
  const result = await buildServer({
    databasePath: join(tmpDir, 'test.sqlite3'),
    dataDir: tmpDir,
  });
  server = result.server;
  db = result.db;
});

afterEach(async () => {
  await server.close();
  db.close();
  try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── Helper: create a mock FastifyReply for SSE testing ──────────────

interface MockSSEClient {
  reply: FastifyReply;
  raw: {
    write: ReturnType<typeof vi.fn>;
    flushHeaders: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    _closeCallback: (() => void) | null;
    _writtenData: string[];
  };
}

function createMockSSEClient(): MockSSEClient {
  const writtenData: string[] = [];

  const raw = {
    write: vi.fn((data: string) => {
      writtenData.push(data);
      return true;
    }),
    flushHeaders: vi.fn(),
    on: vi.fn((_event: string, cb: () => void) => {
      raw._closeCallback = cb;
    }),
    _closeCallback: null as (() => void) | null,
    _writtenData: writtenData,
  };

  const reply = {
    header: vi.fn(),
    raw: raw as unknown as NodeJS.WritableStream,
  } as unknown as FastifyReply;

  return { reply, raw: raw as unknown as typeof raw };
}

describe('SSE Streaming E2E: Connection Establishment', () => {
  it('server has SSE stream route registered', () => {
    const routes = server.printRoutes();
    // Fastify printRoutes() groups by common prefix — 'stream' shares 's' with 'schedules'
    expect(routes).toMatch(/tream\/tasks/);
    expect(routes).toContain(':id (GET');
  });

  it('server has sseHub decoration', () => {
    expect(server.sseHub).toBeDefined();
    expect(server.sseHub).toBeInstanceOf(SSEHub);
  });

  it('sseHub starts with zero clients', () => {
    expect(server.sseHub.getTotalClientCount()).toBe(0);
    expect(server.sseHub.getClientCount('any-task')).toBe(0);
  });
});

describe('SSE Streaming E2E: Event Format Validation', () => {
  it('formats status events correctly', () => {
    const hub = new SSEHub();
    const { reply, raw } = createMockSSEClient();

    hub.addClient('task-1', reply);
    hub.broadcast('task-1', {
      event: 'status',
      data: { taskId: 'task-1', status: 'running' },
    });

    expect(raw._writtenData.length).toBe(1);
    const sseMessage = raw._writtenData[0];
    expect(sseMessage).toBe('event: status\ndata: {"taskId":"task-1","status":"running"}\n\n');
  });

  it('formats step events correctly', () => {
    const hub = new SSEHub();
    const { reply, raw } = createMockSSEClient();

    hub.addClient('task-2', reply);
    hub.broadcast('task-2', {
      event: 'step',
      data: { stepIndex: 0, phase: 'observe', status: 'success', observation: 'Found button' },
    });

    expect(raw._writtenData.length).toBe(1);
    const sseMessage = raw._writtenData[0];
    expect(sseMessage).toContain('event: step');
    expect(sseMessage).toContain('"stepIndex":0');
    expect(sseMessage).toContain('"phase":"observe"');
    expect(sseMessage).toContain('"observation":"Found button"');
    expect(sseMessage).toMatch(/\n\n$/); // SSE messages end with double newline
  });

  it('formats log events correctly', () => {
    const hub = new SSEHub();
    const { reply, raw } = createMockSSEClient();

    hub.addClient('task-3', reply);
    hub.broadcast('task-3', {
      event: 'log',
      data: { level: 'info', message: 'Task started', timestamp: '2025-01-01T00:00:00.000Z' },
    });

    expect(raw._writtenData.length).toBe(1);
    const sseMessage = raw._writtenData[0];
    expect(sseMessage).toContain('event: log');
    expect(sseMessage).toContain('"level":"info"');
    expect(sseMessage).toContain('"message":"Task started"');
  });

  it('formats error events correctly', () => {
    const hub = new SSEHub();
    const { reply, raw } = createMockSSEClient();

    hub.addClient('task-4', reply);
    hub.broadcast('task-4', {
      event: 'error',
      data: { error: 'MCP connection failed', taskId: 'task-4' },
    });

    expect(raw._writtenData.length).toBe(1);
    const sseMessage = raw._writtenData[0];
    expect(sseMessage).toContain('event: error');
    expect(sseMessage).toContain('"error":"MCP connection failed"');
  });

  it('formats complete events correctly', () => {
    const hub = new SSEHub();
    const { reply, raw } = createMockSSEClient();

    hub.addClient('task-5', reply);
    hub.broadcast('task-5', {
      event: 'complete',
      data: { taskId: 'task-5', status: 'completed', stepCount: 5 },
    });

    expect(raw._writtenData.length).toBe(1);
    const sseMessage = raw._writtenData[0];
    expect(sseMessage).toContain('event: complete');
    expect(sseMessage).toContain('"stepCount":5');
  });
});

describe('SSE Streaming E2E: Task Status Events', () => {
  it('broadcasts task cancellation event when task is cancelled', async () => {
    // Insert task directly to avoid worker pool changing its status
    const taskId = 'sse-cancel-task';
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', 50, 0, ?, ?)`
    ).run(taskId, 'SSE cancel test', '/app', 'gpt-4o', now, now);

    // Register a mock SSE client for this task
    const { reply, raw } = createMockSSEClient();
    server.sseHub.addClient(taskId, reply);

    // Cancel the task — this should trigger an SSE broadcast
    const cancelRes = await server.inject({
      method: 'POST',
      url: `/api/tasks/${taskId}/cancel`,
    });
    expect(cancelRes.statusCode).toBe(200);

    // Verify SSE event was broadcast
    expect(raw.write).toHaveBeenCalled();
    const sseMessages = raw._writtenData;
    const cancelEvent = sseMessages.find((msg: string) => msg.includes('"status":"cancelled"'));
    expect(cancelEvent).toBeDefined();
    expect(cancelEvent).toContain('event: status');
    expect(cancelEvent).toContain(`"taskId":"${taskId}"`);
  });

  it('SSE events are scoped per task ID', () => {
    const hub = new SSEHub();
    const clientA = createMockSSEClient();
    const clientB = createMockSSEClient();

    hub.addClient('task-A', clientA.reply);
    hub.addClient('task-B', clientB.reply);

    // Broadcast to task-A only
    hub.broadcast('task-A', {
      event: 'status',
      data: { taskId: 'task-A', status: 'running' },
    });

    expect(clientA.raw.write).toHaveBeenCalled();
    expect(clientB.raw.write).not.toHaveBeenCalled();
  });

  it('broadcastAll sends to all connected clients', () => {
    const hub = new SSEHub();
    const clientA = createMockSSEClient();
    const clientB = createMockSSEClient();

    hub.addClient('task-A', clientA.reply);
    hub.addClient('task-B', clientB.reply);

    hub.broadcastAll({
      event: 'status',
      data: { type: 'global:shutdown' },
    });

    expect(clientA.raw.write).toHaveBeenCalled();
    expect(clientB.raw.write).toHaveBeenCalled();
  });
});

describe('SSE Streaming E2E: Batch Progress Events', () => {
  it('batch cancellation triggers broadcastAll event', async () => {
    // Insert batch and tasks directly to avoid worker pool interference
    const batchId = '550e8400-e29b-41d4-a716-446655440020';
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO batches (id, name, status, total_tasks, completed_tasks, failed_tasks, priority, created_at, updated_at)
      VALUES (?, 'SSE Batch Test', 'running', 3, 0, 0, 'medium', ?, ?)
    `).run(batchId, now, now);

    for (let i = 0; i < 3; i++) {
      db.prepare(`
        INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, created_at, updated_at, batch_id)
        VALUES (?, ?, '/app', 'gpt-4o', 'queued', 50, 0, ?, ?, ?)
      `).run(`sse-task-${i}`, `SSE task ${i + 1}`, now, now, batchId);
    }

    // Register a mock SSE client (broadcastAll sends to all)
    const { reply, raw } = createMockSSEClient();
    server.sseHub.addClient('sse-listener', reply);

    // Cancel the batch — triggers broadcastAll
    const cancelRes = await server.inject({
      method: 'POST',
      url: `/api/tasks/batch/${batchId}/cancel`,
    });
    expect(cancelRes.statusCode).toBe(200);

    // Verify broadcastAll was called
    expect(raw.write).toHaveBeenCalled();
    const sseMessages = raw._writtenData;
    const batchCancelEvent = sseMessages.find((msg: string) => msg.includes('batch:cancelled'));
    expect(batchCancelEvent).toBeDefined();
    expect(batchCancelEvent).toContain(`"batchId":"${batchId}"`);
  });

  it('batch progress updates include percentage data', () => {
    const hub = new SSEHub();
    const { reply, raw } = createMockSSEClient();

    hub.addClient('batch-listener', reply);

    // Simulate a batch progress broadcast
    hub.broadcastAll({
      event: 'status',
      data: {
        type: 'batch:progress',
        batchId: 'test-batch',
        completed: 2,
        failed: 0,
        total: 4,
        percentage: 50,
      },
    });

    expect(raw._writtenData.length).toBe(1);
    const sseMessage = raw._writtenData[0];
    expect(sseMessage).toContain('event: status');
    expect(sseMessage).toContain('"type":"batch:progress"');
    expect(sseMessage).toContain('"percentage":50');
    expect(sseMessage).toContain('"completed":2');
    expect(sseMessage).toContain('"total":4');
  });

  it('batch completion events include summary', () => {
    const hub = new SSEHub();
    const { reply, raw } = createMockSSEClient();

    hub.addClient('batch-listener', reply);

    hub.broadcastAll({
      event: 'status',
      data: {
        type: 'batch:completed',
        batchId: 'test-batch',
        summary: {
          total: 3,
          completed: 3,
          failed: 0,
        },
      },
    });

    expect(raw._writtenData.length).toBe(1);
    const sseMessage = raw._writtenData[0];
    expect(sseMessage).toContain('batch:completed');
    expect(sseMessage).toContain('"total":3');
    expect(sseMessage).toContain('"completed":3');
    expect(sseMessage).toContain('"failed":0');
  });
});

describe('SSE Streaming E2E: Client Lifecycle', () => {
  it('client auto-disconnects on close event', () => {
    const hub = new SSEHub();
    const { reply, raw } = createMockSSEClient();

    hub.addClient('task-1', reply);
    expect(hub.getClientCount('task-1')).toBe(1);

    // Simulate client disconnect
    raw._closeCallback?.();
    expect(hub.getClientCount('task-1')).toBe(0);
  });

  it('supports multiple clients per task', () => {
    const hub = new SSEHub();
    const client1 = createMockSSEClient();
    const client2 = createMockSSEClient();

    hub.addClient('task-multi', client1.reply);
    hub.addClient('task-multi', client2.reply);

    expect(hub.getClientCount('task-multi')).toBe(2);
    expect(hub.getTotalClientCount()).toBe(2);

    hub.broadcast('task-multi', {
      event: 'status',
      data: { taskId: 'task-multi', status: 'running' },
    });

    expect(client1.raw.write).toHaveBeenCalled();
    expect(client2.raw.write).toHaveBeenCalled();
  });

  it('does not remove clients when write returns false (backpressure)', () => {
    const hub = new SSEHub();
    const goodClient = createMockSSEClient();
    const badClient = createMockSSEClient();

    // Make the bad client's write fail (simulates backpressure)
    badClient.raw.write.mockReturnValue(false);

    hub.addClient('task-1', goodClient.reply);
    hub.addClient('task-1', badClient.reply);
    expect(hub.getClientCount('task-1')).toBe(2);

    hub.broadcast('task-1', {
      event: 'error',
      data: { error: 'test' },
    });

    // Client should NOT be removed on backpressure (write returns false)
    expect(hub.getClientCount('task-1')).toBe(2);
  });

  it('broadcast to non-existent task is a no-op', () => {
    const hub = new SSEHub();
    expect(() =>
      hub.broadcast('nonexistent', {
        event: 'status',
        data: {},
      }),
    ).not.toThrow();
  });

  it('broadcastAll with no clients is a no-op', () => {
    const hub = new SSEHub();
    expect(() =>
      hub.broadcastAll({
        event: 'status',
        data: { type: 'global' },
      }),
    ).not.toThrow();
  });
});

describe('SSE Streaming E2E: Event Type Coverage', () => {
  it('all SSE event types are supported', () => {
    const hub = new SSEHub();
    const { reply, raw } = createMockSSEClient();
    hub.addClient('task-all', reply);

    const eventTypes = ['step', 'log', 'status', 'complete', 'error'] as const;

    for (const eventType of eventTypes) {
      hub.broadcast('task-all', {
        event: eventType,
        data: { type: eventType },
      });
    }

    expect(raw._writtenData.length).toBe(eventTypes.length);

    for (let i = 0; i < eventTypes.length; i++) {
      expect(raw._writtenData[i]).toContain(`event: ${eventTypes[i]}`);
    }
  });

  it('SSE headers are set correctly on client registration', () => {
    const hub = new SSEHub();
    const { reply, raw } = createMockSSEClient();

    hub.addClient('task-headers', reply);

    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(reply.header).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(raw.flushHeaders).toHaveBeenCalled();
  });
});
