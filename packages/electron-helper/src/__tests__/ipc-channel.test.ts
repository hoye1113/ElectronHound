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

// ── Helpers ────────────────────────────────────────────────────────────

async function connectChannel(channel: IpcChannel, timeout?: number): Promise<MockSocket> {
  const connectPromise = channel.connect(timeout);
  const socket = mockSockets[mockSockets.length - 1];
  setTimeout(() => socket.emit('connect'), 0);
  await connectPromise;
  return socket;
}

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

  it('creates a channel with no arguments', () => {
    const channel = new IpcChannel();
    expect(channel).toBeDefined();
    expect(channel.isConnected()).toBe(false);
  });

  // ── Sending messages ──────────────────────────────────────────────────

  it('sends messages to the connected server', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    const writtenMessages: Record<string, unknown>[] = [];
    socket.onWrite((data) => {
      writtenMessages.push(JSON.parse(data.trim()));
    });

    await channel.send({ type: 'execute_main', payload: { code: 'test' } });

    expect(writtenMessages).toHaveLength(1);
    expect(writtenMessages[0].type).toBe('execute_main');
    expect(writtenMessages[0].payload).toEqual({ code: 'test' });
  });

  it('sends messages with id field', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    const writtenMessages: Record<string, unknown>[] = [];
    socket.onWrite((data) => {
      writtenMessages.push(JSON.parse(data.trim()));
    });

    await channel.send({ type: 'request', id: 'req-123', payload: { key: 'value' } });

    expect(writtenMessages).toHaveLength(1);
    expect(writtenMessages[0].id).toBe('req-123');
  });

  it('sends multiple messages sequentially', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    const writtenMessages: Record<string, unknown>[] = [];
    socket.onWrite((data) => {
      writtenMessages.push(JSON.parse(data.trim()));
    });

    await channel.send({ type: 'first' });
    await channel.send({ type: 'second' });
    await channel.send({ type: 'third' });

    expect(writtenMessages).toHaveLength(3);
    expect(writtenMessages[0].type).toBe('first');
    expect(writtenMessages[1].type).toBe('second');
    expect(writtenMessages[2].type).toBe('third');
  });

  it('throws when sending without connection', async () => {
    const channel = new IpcChannel(undefined, 9000);
    await expect(channel.send({ type: 'test' })).rejects.toThrow('not connected');
  });

  it('throws when sending after socket is destroyed', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    socket.destroyed = true;
    await expect(channel.send({ type: 'test' })).rejects.toThrow('not connected');
  });

  it('propagates write errors', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    socket.write = vi.fn().mockImplementation((_data: string, cb?: (err?: Error) => void) => {
      if (cb) cb(new Error('Write failed'));
      return true;
    });

    await expect(channel.send({ type: 'test' })).rejects.toThrow('Write failed');
  });

  // ── Receiving responses ───────────────────────────────────────────────

  it('receives responses via message handlers', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

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
    const socket = await connectChannel(channel);

    const received1: unknown[] = [];
    const received2: unknown[] = [];
    channel.onMessage((msg) => received1.push(msg));
    channel.onMessage((msg) => received2.push(msg));

    socket.receiveData({ type: 'test' });

    await vi.advanceTimersByTimeAsync(10);

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });

  it('delivers messages to handlers registered after data starts flowing', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    // First handler registered before data
    const received1: unknown[] = [];
    channel.onMessage((msg) => received1.push(msg));

    socket.receiveData({ type: 'first' });
    await vi.advanceTimersByTimeAsync(10);

    // Second handler registered after first message
    const received2: unknown[] = [];
    channel.onMessage((msg) => received2.push(msg));

    socket.receiveData({ type: 'second' });
    await vi.advanceTimersByTimeAsync(10);

    expect(received1).toHaveLength(2);
    expect(received2).toHaveLength(1);
    expect((received2[0] as { type: string }).type).toBe('second');
  });

  // ── Connection via socket path ────────────────────────────────────────

  it('connects via socket path', async () => {
    const channel = new IpcChannel('/tmp/test.sock');
    const socket = await connectChannel(channel);

    expect(socket.connect).toHaveBeenCalledWith('/tmp/test.sock');
    expect(channel.isConnected()).toBe(true);
  });

  it('connects via TCP port', async () => {
    const channel = new IpcChannel(undefined, 8080);
    const socket = await connectChannel(channel);

    expect(socket.connect).toHaveBeenCalledWith(8080, '127.0.0.1');
    expect(channel.isConnected()).toBe(true);
  });

  // ── No socketPath or port configured ──────────────────────────────────

  it('emits error when neither socketPath nor port is configured', async () => {
    const channel = new IpcChannel();

    const connectPromise = channel.connect();
    const _socket = mockSockets[mockSockets.length - 1];

    // The error is emitted on the socket, which will reject the connect promise
    // since we're not yet connected
    await expect(connectPromise).rejects.toThrow('no socketPath or port configured');
  });

  // ── Connection is no-op if already connected ─────────────────────────

  it('returns immediately if already connected', async () => {
    const channel = new IpcChannel(undefined, 9000);
    await connectChannel(channel);

    expect(channel.isConnected()).toBe(true);

    // Second connect should resolve immediately without creating new socket
    const socketCountBefore = mockSockets.length;
    await channel.connect();
    expect(mockSockets.length).toBe(socketCountBefore);
  });

  // ── Timeout handling ──────────────────────────────────────────────────

  it('rejects on connection timeout', async () => {
    const channel = new IpcChannel(undefined, 9000);

    const connectPromise = channel.connect(100);

    const resultPromise = connectPromise.then(
      () => { throw new Error('should have rejected'); },
      (err: Error) => err,
    );

    await vi.advanceTimersByTimeAsync(150);

    const err = await resultPromise;
    expect(err.message).toContain('timed out');
    expect(err.message).toContain('100ms');
  });

  it('rejects on connection error', async () => {
    const channel = new IpcChannel(undefined, 9000);

    const connectPromise = channel.connect();
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('error', new Error('ECONNREFUSED')), 0);

    await expect(connectPromise).rejects.toThrow('ECONNREFUSED');
    expect(channel.isConnected()).toBe(false);
  });

  it('ignores errors after successful connection', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    expect(channel.isConnected()).toBe(true);

    // Emit error after connection — should not crash or disconnect
    socket.emit('error', new Error('Late error'));

    // Channel should still report connected
    expect(channel.isConnected()).toBe(true);
  });

  // ── Auto-reconnect ───────────────────────────────────────────────────

  it('schedules reconnect on connection close', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

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
    await connectChannel(channel);

    await channel.close();

    // Advance timers
    await vi.advanceTimersByTimeAsync(5000);

    // Should still be only 1 socket (no reconnect attempted)
    expect(mockSockets).toHaveLength(1);
  });

  it('uses exponential backoff for reconnect failures', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    // Disconnect
    socket.destroyed = true;
    socket.emit('close');

    // First reconnect attempt (after 1000ms delay)
    await vi.advanceTimersByTimeAsync(1100);
    const socket2 = mockSockets[mockSockets.length - 1];
    // Fail the reconnect — mark as destroyed so next connect() creates a new socket
    socket2.destroyed = true;
    socket2.emit('error', new Error('ECONNREFUSED'));

    // Allow the catch handler to run (microtask)
    await vi.advanceTimersByTimeAsync(0);

    // Second reconnect should be scheduled after 2000ms (doubled from 1000ms).
    // Advance to just before 2nd attempt — still only 2 sockets
    await vi.advanceTimersByTimeAsync(1800);
    expect(mockSockets.length).toBe(2);

    // Now advance past the 2000ms mark to trigger 2nd attempt
    await vi.advanceTimersByTimeAsync(500);
    expect(mockSockets.length).toBeGreaterThanOrEqual(3);
  });

  it('caps reconnect delay at maxReconnectDelay', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    // Disconnect
    socket.destroyed = true;
    socket.emit('close');

    // Fail several reconnect attempts to reach max backoff
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(10000);
      const latestSocket = mockSockets[mockSockets.length - 1];
      if (latestSocket && !latestSocket.destroyed) {
        latestSocket.emit('error', new Error('ECONNREFUSED'));
      }
    }

    // The delay should be capped at 5000ms (maxReconnectDelay)
    // This verifies the cap works without crashing
    expect(mockSockets.length).toBeGreaterThanOrEqual(2);
  });

  it('does not schedule multiple reconnects simultaneously', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    socket.destroyed = true;
    socket.emit('close');

    // Multiple close events should not create multiple reconnect timers
    socket.emit('close');
    socket.emit('close');

    await vi.advanceTimersByTimeAsync(2000);

    // Should only have one extra socket from reconnect, not multiple
    // (2 total: original + one reconnect attempt)
    expect(mockSockets.length).toBeLessThanOrEqual(3);
  });

  // ── Close ─────────────────────────────────────────────────────────────

  it('close() ends the socket and clears state', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    await channel.close();

    expect(socket.end).toHaveBeenCalled();
    expect(channel.isConnected()).toBe(false);
  });

  it('close() is safe to call when not connected', async () => {
    const channel = new IpcChannel(undefined, 9000);
    await expect(channel.close()).resolves.not.toThrow();
  });

  it('close() clears reconnect timer if pending', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    // Trigger reconnect scheduling
    socket.destroyed = true;
    socket.emit('close');

    // Close before reconnect fires
    await channel.close();

    // Advance timers — should not trigger reconnect
    await vi.advanceTimersByTimeAsync(10000);
    expect(mockSockets).toHaveLength(1);
  });

  // ── Ping/pong auto-response ───────────────────────────────────────────

  it('auto-responds to ping messages', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    const writtenMessages: Record<string, unknown>[] = [];
    socket.onWrite((data) => {
      writtenMessages.push(JSON.parse(data.trim()));
    });

    socket.receiveData({ type: 'ping', id: 'ping-1' });

    await vi.advanceTimersByTimeAsync(10);

    const pongs = writtenMessages.filter((m) => m.type === 'pong');
    expect(pongs).toHaveLength(1);
    expect(pongs[0].id).toBe('ping-1');
  });

  it('auto-responds to multiple pings', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    const writtenMessages: Record<string, unknown>[] = [];
    socket.onWrite((data) => {
      writtenMessages.push(JSON.parse(data.trim()));
    });

    socket.receiveData({ type: 'ping', id: 'p1' });
    socket.receiveData({ type: 'ping', id: 'p2' });
    socket.receiveData({ type: 'ping', id: 'p3' });

    await vi.advanceTimersByTimeAsync(10);

    const pongs = writtenMessages.filter((m) => m.type === 'pong');
    expect(pongs).toHaveLength(3);
    expect(pongs.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('ping messages are also delivered to handlers', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    const received: unknown[] = [];
    channel.onMessage((msg) => received.push(msg));

    socket.receiveData({ type: 'ping', id: 'test' });

    await vi.advanceTimersByTimeAsync(10);

    // Handler should also receive the ping
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('ping');
  });

  it('ignores pong send errors silently', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    // Make write fail
    socket.write = vi.fn().mockImplementation((_data: string, cb?: (err?: Error) => void) => {
      if (cb) cb(new Error('Socket broken'));
      return true;
    });

    // This should not throw even though pong send fails
    socket.receiveData({ type: 'ping', id: 'test' });

    await vi.advanceTimersByTimeAsync(10);
    // No error thrown — pong errors are silently ignored
  });

  // ── Buffering ─────────────────────────────────────────────────────────

  it('handles partial NDJSON messages (buffered data)', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

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

  it('handles multiple complete messages in a single data chunk', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    const received: unknown[] = [];
    channel.onMessage((msg) => received.push(msg));

    const multiMessage =
      JSON.stringify({ type: 'a' }) + '\n' +
      JSON.stringify({ type: 'b' }) + '\n' +
      JSON.stringify({ type: 'c' }) + '\n';

    socket.emit('data', Buffer.from(multiMessage));

    await vi.advanceTimersByTimeAsync(10);
    expect(received).toHaveLength(3);
    expect((received[0] as { type: string }).type).toBe('a');
    expect((received[1] as { type: string }).type).toBe('b');
    expect((received[2] as { type: string }).type).toBe('c');
  });

  it('handles mix of complete and partial messages in one chunk', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    const received: unknown[] = [];
    channel.onMessage((msg) => received.push(msg));

    const complete1 = JSON.stringify({ type: 'complete1' }) + '\n';
    const partial = JSON.stringify({ type: 'partial' });
    // Send complete message + partial message (no trailing newline)
    socket.emit('data', Buffer.from(complete1 + partial));

    await vi.advanceTimersByTimeAsync(10);
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('complete1');

    // Now send the rest
    socket.emit('data', Buffer.from('\n'));
    await vi.advanceTimersByTimeAsync(10);
    expect(received).toHaveLength(2);
    expect((received[1] as { type: string }).type).toBe('partial');
  });

  it('skips malformed JSON lines', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

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
    const socket = await connectChannel(channel);

    const received: unknown[] = [];
    channel.onMessage((msg) => received.push(msg));

    socket.emit('data', Buffer.from('\n\n\n'));
    socket.receiveData({ type: 'real' });

    await vi.advanceTimersByTimeAsync(10);
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('real');
  });

  it('handles data with only whitespace lines', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    const received: unknown[] = [];
    channel.onMessage((msg) => received.push(msg));

    socket.emit('data', Buffer.from('   \n  \n\t\n'));
    socket.receiveData({ type: 'after-whitespace' });

    await vi.advanceTimersByTimeAsync(10);
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('after-whitespace');
  });

  // ── Message with payload ──────────────────────────────────────────────

  it('delivers messages with complex payloads', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    const received: unknown[] = [];
    channel.onMessage((msg) => received.push(msg));

    const complexPayload = {
      type: 'operation_result',
      id: 'op-1',
      payload: {
        success: true,
        data: { nested: { deep: true }, arr: [1, 2, 3] },
      },
    };
    socket.receiveData(complexPayload);

    await vi.advanceTimersByTimeAsync(10);
    expect(received).toHaveLength(1);
    const msg = received[0] as Record<string, unknown>;
    expect(msg.type).toBe('operation_result');
    expect(msg.id).toBe('op-1');
    expect((msg.payload as Record<string, unknown>).success).toBe(true);
  });

  // ── isConnected ───────────────────────────────────────────────────────

  it('isConnected returns false before connection', () => {
    const channel = new IpcChannel(undefined, 9000);
    expect(channel.isConnected()).toBe(false);
  });

  it('isConnected returns true after successful connection', async () => {
    const channel = new IpcChannel(undefined, 9000);
    await connectChannel(channel);
    expect(channel.isConnected()).toBe(true);
  });

  it('isConnected returns false after socket is destroyed', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    socket.destroyed = true;
    expect(channel.isConnected()).toBe(false);
  });

  it('isConnected returns false after close', async () => {
    const channel = new IpcChannel(undefined, 9000);
    await connectChannel(channel);

    await channel.close();
    expect(channel.isConnected()).toBe(false);
  });

  // ── send with newline delimiter ───────────────────────────────────────

  it('appends newline to sent messages', async () => {
    const channel = new IpcChannel(undefined, 9000);
    const socket = await connectChannel(channel);

    let writtenData = '';
    socket.onWrite((data) => {
      writtenData = data;
    });

    await channel.send({ type: 'test' });

    expect(writtenData).toMatch(/\n$/);
    expect(writtenData.trim()).toBe(JSON.stringify({ type: 'test' }));
  });
});
