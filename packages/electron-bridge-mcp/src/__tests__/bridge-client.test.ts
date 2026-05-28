import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { BridgeClient } from '../bridge-client.js';

// ── Tests ──────────────────────────────────────────────────────────────

describe('BridgeClient', () => {
  beforeEach(() => {
    mockSockets.length = 0;
    vi.clearAllMocks();
  });

  // ── Instance creation ─────────────────────────────────────────────────

  it('creates a client instance', () => {
    const client = new BridgeClient();
    expect(client).toBeDefined();
    expect(client.isConnected()).toBe(false);
  });

  // ── Connection ────────────────────────────────────────────────────────

  it('connects to a TCP server via host:port', async () => {
    const client = new BridgeClient();

    const connectPromise = client.connect('127.0.0.1:9000');

    // Simulate the socket connecting
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);

    await connectPromise;

    expect(socket.connect).toHaveBeenCalledWith(9000, '127.0.0.1');
    expect(client.isConnected()).toBe(true);
  });

  it('connects to a Unix socket path', async () => {
    const client = new BridgeClient();

    const connectPromise = client.connect('/tmp/test.sock');

    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);

    await connectPromise;

    expect(socket.connect).toHaveBeenCalledWith('/tmp/test.sock');
    expect(client.isConnected()).toBe(true);
  });

  it('rejects on connection error', async () => {
    const client = new BridgeClient();

    const connectPromise = client.connect('127.0.0.1:9000');

    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('error', new Error('ECONNREFUSED')), 0);

    await expect(connectPromise).rejects.toThrow('ECONNREFUSED');
    expect(client.isConnected()).toBe(false);
  });

  it('rejects on connection timeout', async () => {
    const client = new BridgeClient();

    // Use a very short timeout so the test doesn't hang
    const connectPromise = client.connect('127.0.0.1:9000', 50);

    // Attach handler before the rejection fires to avoid unhandled rejection
    const resultPromise = connectPromise.then(
      () => { throw new Error('should have rejected'); },
      (err: Error) => err,
    );

    const err = await resultPromise;
    expect(err.message).toContain('timed out');
  });

  // ── Sending messages ──────────────────────────────────────────────────

  it('sends tool calls and receives responses', async () => {
    const client = new BridgeClient();

    const connectPromise = client.connect('127.0.0.1:9000');
    const socket = mockSockets[mockSockets.length - 1];

    let capturedData = '';
    socket.onWrite((data) => {
      capturedData = data;
    });

    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    // Start a send — the client writes JSON + newline and waits for response
    const sendPromise = client.send({
      type: 'execute_main',
      payload: { code: 'app.getVersion()' },
    });

    // Parse the written message and simulate a response
    const sent = JSON.parse(capturedData.trim());
    expect(sent.type).toBe('execute_main');
    expect(sent.payload).toEqual({ code: 'app.getVersion()' });
    expect(sent.id).toBeDefined();

    // Simulate server response with matching id
    socket.receiveData({
      type: 'response',
      id: sent.id,
      payload: { success: true, data: '1.0.0' },
    });

    const response = await sendPromise;
    expect(response.type).toBe('response');
    expect(response.payload).toEqual({ success: true, data: '1.0.0' });
  });

  it('sends fire-and-forget messages', async () => {
    const client = new BridgeClient();

    const connectPromise = client.connect('127.0.0.1:9000');
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    client.sendFireAndForget({ type: 'ping', payload: { ts: 123 } });

    expect(socket.write).toHaveBeenCalled();
    const written = socket.write.mock.calls[0][0] as string;
    const parsed = JSON.parse(written.trim());
    expect(parsed.type).toBe('ping');
    expect(parsed.payload).toEqual({ ts: 123 });
  });

  it('assigns incremental IDs to sent messages', async () => {
    const client = new BridgeClient();

    const connectPromise = client.connect('127.0.0.1:9000');
    const socket = mockSockets[mockSockets.length - 1];
    const writtenMessages: Record<string, unknown>[] = [];

    socket.onWrite((data) => {
      writtenMessages.push(JSON.parse(data.trim()));
    });

    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    // Send() assigns incremental IDs; send responses to resolve the promises
    const p1 = client.send({ type: 'a' });
    const p2 = client.send({ type: 'b' });
    const p3 = client.send({ type: 'c' });

    expect(writtenMessages[0].id).toBe('1');
    expect(writtenMessages[1].id).toBe('2');
    expect(writtenMessages[2].id).toBe('3');

    // Resolve all pending requests to avoid hanging
    for (const msg of writtenMessages) {
      socket.receiveData({ type: 'response', id: msg.id as string, payload: 'ok' });
    }
    await Promise.all([p1, p2, p3]);
  });

  // ── Response handling ─────────────────────────────────────────────────

  it('routes responses to the correct pending request', async () => {
    const client = new BridgeClient();

    const connectPromise = client.connect('127.0.0.1:9000');
    const socket = mockSockets[mockSockets.length - 1];
    const writtenMessages: Record<string, unknown>[] = [];

    socket.onWrite((data) => {
      writtenMessages.push(JSON.parse(data.trim()));
    });

    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    // Start two sends concurrently
    const promise1 = client.send({ type: 'req-a' });
    const promise2 = client.send({ type: 'req-b' });

    // Respond in reverse order
    const idB = writtenMessages[1].id as string;
    const idA = writtenMessages[0].id as string;

    socket.receiveData({ type: 'response', id: idB, payload: 'result-b' });
    socket.receiveData({ type: 'response', id: idA, payload: 'result-a' });

    const [result1, result2] = await Promise.all([promise1, promise2]);
    expect(result1.payload).toBe('result-a');
    expect(result2.payload).toBe('result-b');
  });

  it('notifies general message handlers', async () => {
    const client = new BridgeClient();

    const connectPromise = client.connect('127.0.0.1:9000');
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    const received: unknown[] = [];
    client.onMessage((msg) => received.push(msg));

    socket.receiveData({ type: 'event', payload: { data: 'test' } });

    // Allow microtask to process
    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('event');
  });

  it('auto-responds to ping messages', async () => {
    const client = new BridgeClient();

    const connectPromise = client.connect('127.0.0.1:9000');
    const socket = mockSockets[mockSockets.length - 1];
    const writtenMessages: Record<string, unknown>[] = [];

    socket.onWrite((data) => {
      writtenMessages.push(JSON.parse(data.trim()));
    });

    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    socket.receiveData({ type: 'ping', id: 'ping-1' });

    await new Promise((r) => setTimeout(r, 10));

    // Should have sent a pong response (plus any from connect, so filter)
    const pongs = writtenMessages.filter((m) => m.type === 'pong');
    expect(pongs).toHaveLength(1);
    expect(pongs[0].id).toBe('ping-1');
  });

  // ── Error handling ────────────────────────────────────────────────────

  it('throws when sending without connection', async () => {
    const client = new BridgeClient();
    await expect(client.send({ type: 'test' })).rejects.toThrow('not connected');
  });

  it('throws when using fire-and-forget without connection', () => {
    const client = new BridgeClient();
    expect(() => client.sendFireAndForget({ type: 'test' })).toThrow('not connected');
  });

  it('handles malformed incoming data gracefully', async () => {
    const client = new BridgeClient();

    const connectPromise = client.connect('127.0.0.1:9000');
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    const received: unknown[] = [];
    client.onMessage((msg) => received.push(msg));

    // Send malformed data — should not throw
    socket.emit('data', Buffer.from('not valid json\n'));

    // Valid message should still be processed
    socket.receiveData({ type: 'valid', payload: 'ok' });

    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('valid');
  });

  it('handles partial NDJSON messages (buffered data)', async () => {
    const client = new BridgeClient();

    const connectPromise = client.connect('127.0.0.1:9000');
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    const received: unknown[] = [];
    client.onMessage((msg) => received.push(msg));

    // Send data split across multiple chunks
    const fullJson = JSON.stringify({ type: 'chunked' }) + '\n';
    const part1 = fullJson.slice(0, 5);
    const part2 = fullJson.slice(5);

    socket.emit('data', Buffer.from(part1));
    socket.emit('data', Buffer.from(part2));

    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('chunked');
  });

  // ── Connection lifecycle ──────────────────────────────────────────────

  it('sets connected to false on socket close', async () => {
    const client = new BridgeClient();

    const connectPromise = client.connect('127.0.0.1:9000');
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    expect(client.isConnected()).toBe(true);

    socket.emit('close');
    expect(client.isConnected()).toBe(false);
  });

  it('close() ends the socket and clears state', async () => {
    const client = new BridgeClient();

    const connectPromise = client.connect('127.0.0.1:9000');
    const socket = mockSockets[mockSockets.length - 1];
    setTimeout(() => socket.emit('connect'), 0);
    await connectPromise;

    client.close();

    expect(socket.end).toHaveBeenCalled();
    expect(client.isConnected()).toBe(false);
  });

  it('close() is safe to call when not connected', () => {
    const client = new BridgeClient();
    expect(() => client.close()).not.toThrow();
  });
});
