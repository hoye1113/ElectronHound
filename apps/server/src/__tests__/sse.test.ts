import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SSEHub, sseHub, type SSEEvent } from '../streams/sseHub.js';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import type { FastifyReply } from 'fastify';

function createTempDbPath(): string {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-sse-test-'));
  return join(tmpDir, 'test-db.sqlite3');
}

function createMockReply(): { reply: FastifyReply; raw: { write: ReturnType<typeof vi.fn>; flushHeaders: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; _closeCallback: (() => void) | null } } {
  const raw = {
    write: vi.fn(() => true),
    flushHeaders: vi.fn(),
    on: vi.fn((_event: string, cb: () => void) => {
      // Store callback for manual trigger in tests
      raw._closeCallback = cb;
    }),
    _closeCallback: null as (() => void) | null,
  };

  const reply = {
    header: vi.fn(),
    raw: raw as unknown as NodeJS.WritableStream,
  } as unknown as FastifyReply;

  return { reply, raw: raw as unknown as typeof raw };
}

describe('SSEHub', () => {
  let hub: SSEHub;

  beforeEach(() => {
    hub = new SSEHub();
  });

  it('addClient sets SSE headers and flushes', () => {
    const { reply, raw } = createMockReply();
    hub.addClient('task-1', reply);

    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(reply.header).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(raw.flushHeaders).toHaveBeenCalled();
  });

  it('addClient registers client in map', () => {
    const { reply } = createMockReply();
    hub.addClient('task-1', reply);

    expect(hub.getClientCount('task-1')).toBe(1);
    expect(hub.getTotalClientCount()).toBe(1);
  });

  it('broadcast formats SSE correctly and writes to clients', () => {
    const { reply, raw } = createMockReply();
    hub.addClient('task-1', reply);

    const event: SSEEvent = {
      event: 'step',
      data: { stepId: 'step-1', status: 'running' },
    };
    hub.broadcast('task-1', event);

    expect(raw.write).toHaveBeenCalledWith(
      'event: step\ndata: {"stepId":"step-1","status":"running"}\n\n'
    );
  });

  it('broadcast only sends to subscribed task clients', () => {
    const { reply: replyA, raw: rawA } = createMockReply();
    const { reply: replyB, raw: rawB } = createMockReply();

    hub.addClient('task-A', replyA);
    hub.addClient('task-B', replyB);

    const event: SSEEvent = { event: 'log', data: { message: 'test' } };
    hub.broadcast('task-A', event);

    expect(rawA.write).toHaveBeenCalled();
    expect(rawB.write).not.toHaveBeenCalled();
  });

  it('broadcastAll sends to all connected clients', () => {
    const { reply: replyA, raw: rawA } = createMockReply();
    const { reply: replyB, raw: rawB } = createMockReply();

    hub.addClient('task-A', replyA);
    hub.addClient('task-B', replyB);

    const event: SSEEvent = { event: 'status', data: { type: 'global' } };
    hub.broadcastAll(event);

    expect(rawA.write).toHaveBeenCalled();
    expect(rawB.write).toHaveBeenCalled();
  });

  it('removeClient removes from map and cleans up empty tasks', () => {
    const { reply } = createMockReply();
    hub.addClient('task-1', reply);
    expect(hub.getClientCount('task-1')).toBe(1);

    hub.removeClient('task-1', reply);
    expect(hub.getClientCount('task-1')).toBe(0);
    expect(hub.getTotalClientCount()).toBe(0);
  });

  it('client is auto-removed on close event', () => {
    const { reply, raw } = createMockReply();
    hub.addClient('task-1', reply);
    expect(hub.getClientCount('task-1')).toBe(1);

    // Simulate close event
    raw._closeCallback?.();
    expect(hub.getClientCount('task-1')).toBe(0);
  });

  it('handles multiple clients per task', () => {
    const { reply: reply1, raw: raw1 } = createMockReply();
    const { reply: reply2, raw: raw2 } = createMockReply();

    hub.addClient('task-1', reply1);
    hub.addClient('task-1', reply2);

    expect(hub.getClientCount('task-1')).toBe(2);

    const event: SSEEvent = { event: 'step', data: { id: '1' } };
    hub.broadcast('task-1', event);

    expect(raw1.write).toHaveBeenCalled();
    expect(raw2.write).toHaveBeenCalled();
  });

  it('does not remove clients when write returns false (backpressure)', () => {
    const { reply: goodReply, raw: goodRaw } = createMockReply();
    const { reply: badReply, raw: badRaw } = createMockReply();

    badRaw.write.mockReturnValue(false);

    hub.addClient('task-1', goodReply);
    hub.addClient('task-1', badReply);
    expect(hub.getClientCount('task-1')).toBe(2);

    const event: SSEEvent = { event: 'error', data: { msg: 'fail' } };
    hub.broadcast('task-1', event);

    expect(goodRaw.write).toHaveBeenCalled();
    expect(badRaw.write).toHaveBeenCalled();
    // Client should NOT be removed on backpressure (write returns false)
    expect(hub.getClientCount('task-1')).toBe(2);
  });

  it('broadcast to non-existent task is a no-op', () => {
    const event: SSEEvent = { event: 'step', data: {} };
    expect(() => hub.broadcast('nonexistent', event)).not.toThrow();
  });

  it('getClientCount returns 0 for unknown task', () => {
    expect(hub.getClientCount('unknown')).toBe(0);
  });
});

describe('SSE singleton export', () => {
  it('exports a singleton instance', () => {
    expect(sseHub).toBeInstanceOf(SSEHub);
  });
});

describe('SSE route registration', () => {
  let cleanupDirs: string[] = [];

  afterEach(async () => {
    for (const dir of cleanupDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    cleanupDirs = [];
  });

  it('server has sseHub decoration', async () => {
    const dbPath = createTempDbPath();
    cleanupDirs.push(dbPath.replace(/[^/\\]+$/, ''));

    const { server, db } = await buildServer({ databasePath: dbPath });

    expect(server.sseHub).toBeDefined();
    expect(server.sseHub).toBeInstanceOf(SSEHub);

    await server.close();
    db.close();
  });

  it('GET /api/stream/tasks/:id route exists', async () => {
    const dbPath = createTempDbPath();
    cleanupDirs.push(dbPath.replace(/[^/\\]+$/, ''));

    const { server, db } = await buildServer({ databasePath: dbPath });

    // SSE connections stay open, so server.inject() would hang.
    // Instead, verify the route is registered by checking Fastify's route list.
    const routes = server.printRoutes();
    // Fastify printRoutes() groups by common prefix — 'stream' shares 's' with 'schedules'
    // so the tree renders as 's' → 'tream/tasks/'. Match the tree fragment.
    expect(routes).toMatch(/tream\/tasks/);
    expect(routes).toContain(':id (GET');

    await server.close();
    db.close();
  });
});
