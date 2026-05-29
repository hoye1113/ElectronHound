import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

// Mock sseHub to control addClient behavior
const mockAddClient = vi.fn((_taskId?: string, _reply?: unknown) => true);
const mockBroadcast = vi.fn((_taskId?: string, _event?: unknown) => {});
vi.mock('../streams/sseHub.js', () => ({
  sseHub: {
    addClient: (taskId: string, reply: unknown) => mockAddClient(taskId, reply),
    broadcast: (taskId: string, event: unknown) => mockBroadcast(taskId, event),
  },
}));

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-stream-routes-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

describe('stream routes', () => {
  let server: FastifyInstance;
  let cleanupDir: string;

  beforeAll(async () => {
    const tmp = createTempDbPath();
    cleanupDir = tmp.cleanupDir;
    const bundle = await buildServer({ databasePath: tmp.dbPath });
    server = bundle.server;
  });

  afterAll(async () => {
    await server.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/stream/tasks/not-a-valid-uuid',
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid task ID');
  });

  it('returns 429 when addClient returns false', async () => {
    mockAddClient.mockReturnValueOnce(false);
    const res = await server.inject({
      method: 'GET',
      url: '/api/stream/tasks/550e8400-e29b-41d4-a716-446655440000',
    });
    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Too many SSE connections');
  });

  it('calls addClient with correct taskId on valid UUID', async () => {
    const validId = '550e8400-e29b-41d4-a716-446655440000';
    mockAddClient.mockReturnValueOnce(true);
    mockBroadcast.mockClear();

    // SSE connections don't close, so race with timeout
    await Promise.race([
      server.inject({ method: 'GET', url: `/api/stream/tasks/${validId}` }),
      new Promise((resolve) => setTimeout(resolve, 200)),
    ]);

    expect(mockAddClient).toHaveBeenCalledWith(validId, expect.anything());
  });

  it('broadcasts initial status event after connection', async () => {
    const validId = '660e8400-e29b-41d4-a716-446655440000';
    mockAddClient.mockReturnValueOnce(true);
    mockBroadcast.mockClear();

    await Promise.race([
      server.inject({ method: 'GET', url: `/api/stream/tasks/${validId}` }),
      new Promise((resolve) => setTimeout(resolve, 200)),
    ]);

    expect(mockBroadcast).toHaveBeenCalledWith(validId, {
      event: 'status',
      data: { type: 'connected', taskId: validId },
    });
  });
});
