import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';

// ── Mock Socket ────────────────────────────────────────────────────────

class MockSocket extends EventEmitter {
  destroyed = false;
  private _writeHandler: ((data: string) => void) | null = null;

  connect = vi.fn().mockReturnThis();

  write = vi.fn().mockImplementation((data: string, cb?: (err?: Error) => void) => {
    if (this._writeHandler) {
      this._writeHandler(data);
    }
    if (cb) cb();
    return true;
  });

  end = vi.fn().mockImplementation(() => {
    this.destroyed = true;
    this.emit('close');
  });

  /** Inject data as if received from the server */
  receiveData(json: Record<string, unknown>): void {
    this.emit('data', Buffer.from(JSON.stringify(json) + '\n'));
  }

  /** Set a handler to capture outgoing writes */
  onWrite(handler: (data: string) => void): void {
    this._writeHandler = handler;
  }
}

// ── Mock node:net ──────────────────────────────────────────────────────

const mockSockets: MockSocket[] = [];

vi.mock('node:net', () => ({
  Socket: vi.fn().mockImplementation(() => {
    const socket = new MockSocket();
    mockSockets.push(socket);
    return socket as unknown as Socket;
  }),
}));

import { IpcChannel } from '../ipc-channel.js';

// ── Tests ──────────────────────────────────────────────────────────────

describe('IpcChannel', () => {
  beforeEach(() => {
    mockSockets.length = 0;
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Channel creation ──────────────────────────────────────────────────

  it('creates a channel with socket path', () => {
    const channel = new IpcChannel('/tmp/test.sock');
    expect(channel).toBeDefined();
    expect(channel.isConnected()).toBe(false);
  });

  it('creates a channel with port', () => {
    const channel = new IpcChannel(undefined, 9000);
    expect(channel).toBeDefined();
    expect(channel.isConnected()).toBe(false);
  });

  // ── Sending messages ──────────────────────────────────────────────────

  it('sends messages to the connected server', async () => {
    const channel = new IpcChannel(undefined, 9000);

    const connectPromise = channel.connect();
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    const writtenMessages: Record<string, unknown>[] = [];
    socket.onWrite((data) => {
      writtenMessages.push(JSON.parse(data.trim()));
    });

    await channel.send({ type: 'execute_main', payload: { code: 'test' } });

    expect(writtenMessages).toHaveLength(1);
    expect(writtenMessages[0].type).toBe('execute_main');
    expect(writtenMessages[0].payload).toEqual({ code: 'test' });
  });

  it('throws when sending without connection', async () => {
    const channel = new IpcChannel(undefined, 9000);
    await expect(channel.send({ type: 'test' })).rejects.toThrow('not connected');
  });

  // ── Receiving responses ───────────────────────────────────────────────

  it('receives responses via message handlers', async () => {
    const channel = new IpcChannel(undefined, 9000);

    const connectPromise = channel.connect();
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    const received: unknown[] = [];
    channel.onMessage((msg) => received.push(msg));

    socket.receiveData({ type: 'response', payload: { data: 'hello' } });
    socket.receiveData({ type: 'event', payload: { ts: 456 } });

    await vi.advanceTimersByTimeAsync(10);

    expect(received).toHaveLength(2);
    expect((received[0] as { type: string }).type).toBe('response');
    expect((received[1] as { type: string }).type).toBe('event');
  });

  it('supports multiple message handlers', async () => {
    const channel = new IpcChannel(undefined, 9000);

    const connectPromise = channel.connect();
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    const received1: unknown[] = [];
    const received2: unknown[] = [];
    channel.onMessage((msg) => received1.push(msg));
    channel.onMessage((msg) => received2.push(msg));

    socket.receiveData({ type: 'test' });

    await vi.advanceTimersByTimeAsync(10);

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });

  // ── Connection via socket path ────────────────────────────────────────

  it('connects via socket path', async () => {
    const channel = new IpcChannel('/tmp/test.sock');

    const connectPromise = channel.connect();
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    expect(socket.connect).toHaveBeenCalledWith('/tmp/test.sock');
    expect(channel.isConnected()).toBe(true);
  });

  it('connects via TCP port', async () => {
    const channel = new IpcChannel(undefined, 8080);

    const connectPromise = channel.connect();
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    expect(socket.connect).toHaveBeenCalledWith(8080, '127.0.0.1');
    expect(channel.isConnected()).toBe(true);
  });

  // ── Timeout handling ──────────────────────────────────────────────────

  it('rejects on connection timeout', async () => {
    const channel = new IpcChannel(undefined, 9000);

    const connectPromise = channel.connect(100);

    // Attach handler before advancing timers to avoid unhandled rejection
    const resultPromise = connectPromise.then(
      () => { throw new Error('should have rejected'); },
      (err: Error) => err,
    );

    // Advance past the timeout
    await vi.advanceTimersByTimeAsync(150);

    const err = await resultPromise;
    expect(err.message).toContain('timed out');
  });

  it('rejects on connection error', async () => {
    const channel = new IpcChannel(undefined, 9000);

    const connectPromise = channel.connect();
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('error', new Error('ECONNREFUSED')), 0);

    await expect(connectPromise).rejects.toThrow('ECONNREFUSED');
    expect(channel.isConnected()).toBe(false);
  });

  // ── Auto-reconnect ───────────────────────────────────────────────────

  it('schedules reconnect on connection close', async () => {
    const channel = new IpcChannel(undefined, 9000);

    const connectPromise = channel.connect();
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    expect(channel.isConnected()).toBe(true);

    // Simulate server closing the connection
    socket.destroyed = true;
    socket.emit('close');

    expect(channel.isConnected()).toBe(false);

    // Advance timers to trigger reconnect
    await vi.advanceTimersByTimeAsync(2000);

    // A new socket should have been created for reconnection
    expect(mockSockets.length).toBeGreaterThanOrEqual(2);
  });

  it('does not reconnect when close() is called explicitly', async () => {
    const channel = new IpcChannel(undefined, 9000);

    const connectPromise = channel.connect();
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    await channel.close();

    // Advance timers
    await vi.advanceTimersByTimeAsync(5000);

    // Should still be only 1 socket (no reconnect attempted)
    expect(mockSockets).toHaveLength(1);
  });

  // ── Close ─────────────────────────────────────────────────────────────

  it('close() ends the socket and clears state', async () => {
    const channel = new IpcChannel(undefined, 9000);

    const connectPromise = channel.connect();
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    await channel.close();

    expect(socket.end).toHaveBeenCalled();
    expect(channel.isConnected()).toBe(false);
  });

  it('close() is safe to call when not connected', async () => {
    const channel = new IpcChannel(undefined, 9000);
    await expect(channel.close()).resolves.not.toThrow();
  });

  // ── Ping/pong auto-response ───────────────────────────────────────────

  it('auto-responds to ping messages', async () => {
    const channel = new IpcChannel(undefined, 9000);

    const connectPromise = channel.connect();
    const socket = mockSockets[mockSockets.length - 1];
    const writtenMessages: Record<string, unknown>[] = [];

    socket.onWrite((data) => {
      writtenMessages.push(JSON.parse(data.trim()));
    });

    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    socket.receiveData({ type: 'ping', id: 'ping-1' });

    await vi.advanceTimersByTimeAsync(10);

    const pongs = writtenMessages.filter((m) => m.type === 'pong');
    expect(pongs).toHaveLength(1);
    expect(pongs[0].id).toBe('ping-1');
  });

  // ── Buffering ─────────────────────────────────────────────────────────

  it('handles partial NDJSON messages (buffered data)', async () => {
    const channel = new IpcChannel(undefined, 9000);

    const connectPromise = channel.connect();
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    const received: unknown[] = [];
    channel.onMessage((msg) => received.push(msg));

    // Send data split across multiple chunks
    const fullJson = JSON.stringify({ type: 'chunked' }) + '\n';
    const part1 = fullJson.slice(0, 5);
    const part2 = fullJson.slice(5);

    socket.emit('data', Buffer.from(part1));
    socket.emit('data', Buffer.from(part2));

    await vi.advanceTimersByTimeAsync(10);
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('chunked');
  });

  it('skips malformed JSON lines', async () => {
    const channel = new IpcChannel(undefined, 9000);

    const connectPromise = channel.connect();
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    const received: unknown[] = [];
    channel.onMessage((msg) => received.push(msg));

    socket.emit('data', Buffer.from('invalid json\n'));
    socket.receiveData({ type: 'valid' });

    await vi.advanceTimersByTimeAsync(10);
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('valid');
  });

  it('skips empty lines', async () => {
    const channel = new IpcChannel(undefined, 9000);

    const connectPromise = channel.connect();
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    const received: unknown[] = [];
    channel.onMessage((msg) => received.push(msg));

    socket.emit('data', Buffer.from('\n\n\n'));
    socket.receiveData({ type: 'real' });

    await vi.advanceTimersByTimeAsync(10);
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('real');
  });
});
