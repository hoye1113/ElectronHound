import { Socket } from 'node:net';

export interface IpcMessage {
  type: string;
  id?: string;
  payload?: unknown;
}

type MessageHandler = (message: IpcMessage) => void;

/**
 * IPC channel for communication with the electron-bridge-mcp server.
 * Supports both Unix domain sockets and TCP connections.
 * On Windows, uses named pipes (\\.\pipe\...).
 */
export class IpcChannel {
  private socket: Socket | null = null;
  private handlers: MessageHandler[] = [];
  private buffer = '';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private maxReconnectDelay = 5000;
  private reconnectDelay = 1000;
  private autoReconnect = true;
  private isClosing = false;
  private _connected = false;

  constructor(
    private socketPath?: string,
    private port?: number,
  ) {}

  /**
   * Connect to the bridge server.
   * @param timeout - Connection timeout in ms (default: 10000)
   */
  async connect(timeout = 10_000): Promise<void> {
    if (this.socket && !this.socket.destroyed) {
      return;
    }

    this.isClosing = false;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`IpcChannel connection timed out after ${timeout}ms`));
      }, timeout);

      try {
        this.socket = this.createSocket();

        this.socket.on('connect', () => {
          clearTimeout(timer);
          this._connected = true;
          this.reconnectDelay = 1000;
          resolve();
        });

        this.socket.on('error', (err: Error) => {
          clearTimeout(timer);
          if (!this._connected) {
            reject(err);
          }
          // Errors after connect are handled by reconnection logic
        });

        this.socket.on('data', (data: Buffer) => {
          this.handleData(data);
        });

        this.socket.on('close', () => {
          this._connected = false;
          if (this.autoReconnect && !this.isClosing) {
            this.scheduleReconnect();
          }
        });

        this.connectSocket();
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /**
   * Send a message to the bridge server.
   */
  async send(message: IpcMessage): Promise<void> {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('IpcChannel: not connected');
    }

    const json = JSON.stringify(message);
    return new Promise((resolve, reject) => {
      this.socket!.write(json + '\n', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Register a message handler.
   */
  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Close the connection.
   */
  async close(): Promise<void> {
    this.isClosing = true;
    this.autoReconnect = false;
    this._connected = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket && !this.socket.destroyed) {
      this.socket.end();
    }

    this.socket = null;
  }

  /**
   * Check if the channel is connected.
   */
  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed && this._connected;
  }

  // --- Private methods ---

  private createSocket(): Socket {
    return new Socket();
  }

  private connectSocket(): void {
    if (!this.socket) return;

    if (this.socketPath) {
      this.socket.connect(this.socketPath);
    } else if (this.port) {
      this.socket.connect(this.port, '127.0.0.1');
    } else {
      this.socket.emit('error', new Error('IpcChannel: no socketPath or port configured'));
    }
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString('utf8');

    // Process complete messages (newline-delimited JSON)
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line.trim() === '') continue;

      try {
        const message: IpcMessage = JSON.parse(line);

        // Auto-respond to ping
        if (message.type === 'ping') {
          void this.send({ type: 'pong', id: message.id }).catch(() => {
            // Ignore send errors for pong
          });
        }

        for (const handler of this.handlers) {
          handler(message);
        }
      } catch {
        // Skip malformed messages
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isClosing) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {
        // Exponential backoff
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          this.maxReconnectDelay,
        );
        this.scheduleReconnect();
      });
    }, this.reconnectDelay);
  }
}
