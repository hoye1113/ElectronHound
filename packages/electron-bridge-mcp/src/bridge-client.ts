import { Socket } from 'node:net';

export interface BridgeMessage {
  type: string;
  id?: string;
  payload?: unknown;
}

type MessageHandler = (message: BridgeMessage) => void;
type ResponseHandler = (response: BridgeMessage) => void;

/**
 * IPC channel client that connects to the electron-helper's IPC endpoint.
 * Uses NDJSON protocol (newline-delimited JSON) over TCP sockets.
 * For v0.1, real connections are tested in e2e; unit tests mock this class.
 */
export class BridgeClient {
  private socket: Socket | null = null;
  private buffer = '';
  private handlers: MessageHandler[] = [];
  private responseHandlers = new Map<string, ResponseHandler>();
  private requestId = 0;
  private _connected = false;

  /**
   * Connect to the bridge server at the given socket path or port.
   * @param socketPath - Unix socket path or named pipe (Windows) or TCP host:port
   * @param timeout - Connection timeout in ms
   */
  async connect(socketPath: string, timeout = 10_000): Promise<void> {
    if (this.socket && !this.socket.destroyed) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`BridgeClient connection timed out after ${timeout}ms`));
      }, timeout);

      this.socket = new Socket();

      this.socket.on('connect', () => {
        clearTimeout(timer);
        this._connected = true;
        resolve();
      });

      this.socket.on('error', (err: Error) => {
        clearTimeout(timer);
        if (!this._connected) {
          reject(err);
        }
      });

      this.socket.on('data', (data: Buffer) => {
        this.handleData(data);
      });

      this.socket.on('close', () => {
        this._connected = false;
      });

      // Try parsing socketPath as host:port or as a path
      if (socketPath.includes(':')) {
        const [host, portStr] = socketPath.split(':');
        this.socket.connect(Number(portStr), host);
      } else {
        this.socket.connect(socketPath);
      }
    });
  }

  /**
   * Send a message and wait for a response with matching id.
   * Uses NDJSON protocol: JSON.stringify(msg) + '\n'.
   */
  async send(message: { type: string; payload?: unknown }): Promise<BridgeMessage> {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('BridgeClient: not connected');
    }

    const id = String(++this.requestId);
    const msg: BridgeMessage = { ...message, id };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.responseHandlers.delete(id);
        reject(new Error(`BridgeClient: request ${id} timed out`));
      }, 30_000);

      this.responseHandlers.set(id, (response: BridgeMessage) => {
        clearTimeout(timeout);
        resolve(response);
      });

      const json = JSON.stringify(msg);
      this.socket!.write(json + '\n', (err) => {
        if (err) {
          clearTimeout(timeout);
          this.responseHandlers.delete(id);
          reject(err);
        }
      });
    });
  }

  /**
   * Send a fire-and-forget message (no response expected).
   */
  sendFireAndForget(message: { type: string; payload?: unknown }): void {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('BridgeClient: not connected');
    }

    const json = JSON.stringify(message);
    this.socket.write(json + '\n');
  }

  /**
   * Register a handler for incoming messages.
   */
  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Close the connection.
   */
  close(): void {
    this._connected = false;

    if (this.socket && !this.socket.destroyed) {
      this.socket.end();
    }

    this.socket = null;
    this.responseHandlers.clear();
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed && this._connected;
  }

  // --- Private methods ---

  private handleData(data: Buffer): void {
    this.buffer += data.toString('utf8');

    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line.trim() === '') continue;

      try {
        const message: BridgeMessage = JSON.parse(line);

        // Auto-respond to ping
        if (message.type === 'ping') {
          const json = JSON.stringify({ type: 'pong', id: message.id });
          if (this.socket && !this.socket.destroyed) {
            this.socket.write(json + '\n');
          }
        }

        // Route to response handler if this is a response to a pending request
        if (message.id && this.responseHandlers.has(message.id)) {
          const handler = this.responseHandlers.get(message.id)!;
          this.responseHandlers.delete(message.id);
          handler(message);
        }

        // Also notify all general handlers
        for (const handler of this.handlers) {
          handler(message);
        }
      } catch {
        // Skip malformed messages
      }
    }
  }
}
