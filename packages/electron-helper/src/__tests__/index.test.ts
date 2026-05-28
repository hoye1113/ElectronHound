import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

// ── Module._load patching for eval('require')('electron') ─────────────
//
// The source code uses `eval('require')('electron')` which bypasses
// vitest's vi.mock() system. We patch Node's Module._load directly
// to intercept require('electron') calls.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeRequire = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NodeModule = nodeRequire('module') as any;

let mockElectronValue: Record<string, unknown> | null = null;
const originalModuleLoad = NodeModule._load as (
  request: string,
  parent: unknown,
  isMain: boolean,
) => unknown;

function patchedModuleLoad(
  this: unknown,
  request: string,
  parent: unknown,
  isMain: boolean,
) {
  if (request === 'electron' && mockElectronValue !== null) {
    return mockElectronValue;
  }
  return originalModuleLoad.call(this, request, parent, isMain);
}

// ── Hoisted mocks for IPC dependencies ────────────────────────────────

const { IpcChannelMock, OperationHandlerMock } = vi.hoisted(() => ({
  IpcChannelMock: vi.fn(),
  OperationHandlerMock: vi.fn(),
}));

vi.mock('../ipc-channel.js', () => ({
  IpcChannel: IpcChannelMock,
}));
vi.mock('../operation-handler.js', () => ({
  OperationHandler: OperationHandlerMock,
}));

// ── Electron code path tests ──────────────────────────────────────────

describe('index.ts - Electron code path', () => {
  beforeEach(() => {
    vi.resetModules();
    NodeModule._load = patchedModuleLoad;
    IpcChannelMock.mockReset();
    OperationHandlerMock.mockReset();
  });

  afterEach(() => {
    NodeModule._load = originalModuleLoad;
    mockElectronValue = null;
    vi.restoreAllMocks();
  });

  // ── Auto-initialization at module load ─────────────────────────────

  describe('auto-initialization at module load', () => {
    it('should auto-initialize when electron has app property', async () => {
      const mockAppendSwitch = vi.fn();
      mockElectronValue = {
        app: { commandLine: { appendSwitch: mockAppendSwitch } },
      };

      await import('../index.js');

      // Auto-init: isElectronMain() -> true -> initialize() -> setCdpPort(0)
      expect(mockAppendSwitch).toHaveBeenCalledWith('remote-debugging-port', '0');
    });

    it('should call appendSwitch exactly once during auto-init', async () => {
      const mockAppendSwitch = vi.fn();
      mockElectronValue = {
        app: { commandLine: { appendSwitch: mockAppendSwitch } },
      };

      await import('../index.js');

      expect(mockAppendSwitch).toHaveBeenCalledTimes(1);
    });

    it('should mark as initialized so subsequent calls are no-ops', async () => {
      const mockAppendSwitch = vi.fn();
      mockElectronValue = {
        app: { commandLine: { appendSwitch: mockAppendSwitch } },
      };

      const { initialize } = await import('../index.js');
      mockAppendSwitch.mockClear();

      // Second call should be no-op due to idempotent guard
      initialize({ cdpPort: 9222 });
      expect(mockAppendSwitch).not.toHaveBeenCalled();
    });
  });

  // ── setCdpPort through initialize ──────────────────────────────────

  describe('setCdpPort through initialize()', () => {
    it('should call commandLine.appendSwitch with CDP port 0 by default', async () => {
      const mockAppendSwitch = vi.fn();
      mockElectronValue = {
        app: { commandLine: { appendSwitch: mockAppendSwitch } },
      };

      await import('../index.js');

      expect(mockAppendSwitch).toHaveBeenCalledWith('remote-debugging-port', '0');
    });

    it('should handle missing commandLine gracefully', async () => {
      mockElectronValue = { app: {} };
      await expect(import('../index.js')).resolves.toBeDefined();
    });

    it('should handle null app gracefully', async () => {
      mockElectronValue = { app: null };
      await expect(import('../index.js')).resolves.toBeDefined();
    });

    it('should catch error from appendSwitch', async () => {
      mockElectronValue = {
        app: {
          commandLine: {
            appendSwitch: vi.fn().mockImplementation(() => {
              throw new Error('Native error');
            }),
          },
        },
      };

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      await import('../index.js');

      expect(stderrSpy).toHaveBeenCalled();
      const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderrOutput).toContain('setCdpPort');

      stderrSpy.mockRestore();
    });

    it('should catch non-Error exceptions from appendSwitch', async () => {
      mockElectronValue = {
        app: {
          commandLine: {
            appendSwitch: vi.fn().mockImplementation(() => {
              throw 'string error';
            }),
          },
        },
      };

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      await import('../index.js');

      expect(stderrSpy).toHaveBeenCalled();
      const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderrOutput).toContain('setCdpPort');

      stderrSpy.mockRestore();
    });

    it('should not call appendSwitch when it is not a function', async () => {
      mockElectronValue = {
        app: { commandLine: { appendSwitch: 'not a function' } },
      };

      await expect(import('../index.js')).resolves.toBeDefined();
    });
  });

  // ── isElectronMain behavior ────────────────────────────────────────

  describe('isElectronMain behavior', () => {
    it('should return true when electron has app (setCdpPort runs)', async () => {
      const mockAppendSwitch = vi.fn();
      mockElectronValue = {
        app: { commandLine: { appendSwitch: mockAppendSwitch } },
      };

      await import('../index.js');

      // If isElectronMain returned true, setCdpPort was called
      expect(mockAppendSwitch).toHaveBeenCalled();
    });

    it('should return false when electron has no app property', async () => {
      const mockAppendSwitch = vi.fn();
      mockElectronValue = { BrowserWindow: { commandLine: { appendSwitch: mockAppendSwitch } } };
      await import('../index.js');
      expect(mockAppendSwitch).not.toHaveBeenCalled();
    });

    it('should return false when electron module is null (real require)', async () => {
      mockElectronValue = null;
      const { initialize } = await import('../index.js');
      expect(() => initialize()).not.toThrow();
    });

    it('should write to stderr when require throws TypeError', async () => {
      // Real require('electron') returns binary path string
      // 'app' in string throws TypeError -> caught -> stderr write
      mockElectronValue = null;

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      await import('../index.js');

      const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderrOutput).toContain('isElectronMain');

      stderrSpy.mockRestore();
    });

    it('should handle require throwing module-not-found', async () => {
      const savedLoad = NodeModule._load;
      try {
        NodeModule._load = function (
          this: unknown,
          request: string,
          parent: unknown,
          isMain: boolean,
        ) {
          if (request === 'electron') {
            throw new Error("Cannot find module 'electron'");
          }
          return savedLoad.call(this, request, parent, isMain);
        };

        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        await import('../index.js');

        const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
        expect(stderrOutput).toContain('isElectronMain');

        stderrSpy.mockRestore();
      } finally {
        NodeModule._load = savedLoad;
      }
    });
  });

  // ── initialize() idempotency with Electron ────────────────────────

  describe('initialize() idempotency with Electron', () => {
    it('should not re-set CDP port on second initialize call', async () => {
      const mockAppendSwitch = vi.fn();
      mockElectronValue = {
        app: { commandLine: { appendSwitch: mockAppendSwitch } },
      };

      const { initialize } = await import('../index.js');

      expect(mockAppendSwitch).toHaveBeenCalledTimes(1);

      initialize({ cdpPort: 9333 });
      expect(mockAppendSwitch).toHaveBeenCalledTimes(1);
    });
  });

  // ── IPC channel setup ─────────────────────────────────────────────
  //
  // For these tests we import WITHOUT 'app' (so auto-init does NOT fire
  // and the initialized guard stays false), then set 'app' before calling
  // initialize() explicitly.

  describe('IPC channel setup', () => {
    it('should create IPC channel when bridgePort is provided', async () => {
      const mockOnMessage = vi.fn();
      const mockConnect = vi.fn().mockResolvedValue(undefined);

      IpcChannelMock.mockImplementation(() => ({
        connect: mockConnect,
        onMessage: mockOnMessage,
        send: vi.fn().mockResolvedValue(undefined),
      }));
      OperationHandlerMock.mockImplementation(() => ({
        handle: vi.fn().mockResolvedValue({ success: true }),
      }));

      mockElectronValue = { BrowserWindow: {} };
      const { initialize } = await import('../index.js');

      mockElectronValue = { app: { commandLine: { appendSwitch: vi.fn() } } };
      initialize({ bridgePort: 3000 });

      expect(IpcChannelMock).toHaveBeenCalled();

      await vi.waitFor(() => {
        expect(mockConnect).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(mockOnMessage).toHaveBeenCalled();
      });
    });

    it('should create IPC channel when bridgeSocketPath is provided', async () => {
      const mockConnect = vi.fn().mockResolvedValue(undefined);
      const mockOnMessage = vi.fn();

      IpcChannelMock.mockImplementation(() => ({
        connect: mockConnect,
        onMessage: mockOnMessage,
        send: vi.fn().mockResolvedValue(undefined),
      }));
      OperationHandlerMock.mockImplementation(() => ({
        handle: vi.fn(),
      }));

      mockElectronValue = { BrowserWindow: {} };
      const { initialize } = await import('../index.js');

      mockElectronValue = { app: { commandLine: { appendSwitch: vi.fn() } } };
      initialize({ bridgeSocketPath: '/tmp/test.sock' });

      await vi.waitFor(() => {
        expect(mockConnect).toHaveBeenCalled();
        expect(mockOnMessage).toHaveBeenCalled();
      });
    });

    it('should pass both bridgeSocketPath and bridgePort to IpcChannel', async () => {
      IpcChannelMock.mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        onMessage: vi.fn(),
        send: vi.fn().mockResolvedValue(undefined),
      }));
      OperationHandlerMock.mockImplementation(() => ({
        handle: vi.fn(),
      }));

      mockElectronValue = { BrowserWindow: {} };
      const { initialize } = await import('../index.js');

      mockElectronValue = { app: { commandLine: { appendSwitch: vi.fn() } } };
      initialize({ bridgeSocketPath: '/tmp/bridge.sock', bridgePort: 8080 });

      expect(IpcChannelMock).toHaveBeenCalledWith('/tmp/bridge.sock', 8080);
    });

    it('should not create IPC channel without bridge config', async () => {
      mockElectronValue = { BrowserWindow: {} };
      const { initialize } = await import('../index.js');

      mockElectronValue = { app: { commandLine: { appendSwitch: vi.fn() } } };
      initialize({ cdpPort: 9222 });

      expect(IpcChannelMock).not.toHaveBeenCalled();
    });

    it('should create OperationHandler for IPC message dispatch', async () => {
      IpcChannelMock.mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        onMessage: vi.fn(),
        send: vi.fn().mockResolvedValue(undefined),
      }));
      OperationHandlerMock.mockImplementation(() => ({
        handle: vi.fn(),
      }));

      mockElectronValue = { BrowserWindow: {} };
      const { initialize } = await import('../index.js');

      mockElectronValue = { app: { commandLine: { appendSwitch: vi.fn() } } };
      initialize({ bridgePort: 3000 });

      expect(OperationHandlerMock).toHaveBeenCalled();
    });

    it('should send operation_result on successful handler execution', async () => {
      let messageHandler: ((msg: unknown) => void) | undefined;
      const mockSend = vi.fn().mockResolvedValue(undefined);

      IpcChannelMock.mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        onMessage: vi.fn().mockImplementation((handler: (msg: unknown) => void) => {
          messageHandler = handler;
        }),
        send: mockSend,
      }));
      OperationHandlerMock.mockImplementation(() => ({
        handle: vi.fn().mockResolvedValue({ success: true, data: { status: 'ok' } }),
      }));

      mockElectronValue = { BrowserWindow: {} };
      const { initialize } = await import('../index.js');

      mockElectronValue = { app: { commandLine: { appendSwitch: vi.fn() } } };
      initialize({ bridgePort: 3000 });

      await vi.waitFor(() => {
        expect(messageHandler).toBeDefined();
      });

      messageHandler!({ type: 'health_check', id: 'msg-1' });

      await vi.waitFor(() => {
        expect(mockSend).toHaveBeenCalledWith({
          type: 'operation_result',
          id: 'msg-1',
          payload: { success: true, data: { status: 'ok' } },
        });
      });
    });

    it('should send operation_error when handler throws', async () => {
      let messageHandler: ((msg: unknown) => void) | undefined;
      const mockSend = vi.fn().mockResolvedValue(undefined);

      IpcChannelMock.mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        onMessage: vi.fn().mockImplementation((handler: (msg: unknown) => void) => {
          messageHandler = handler;
        }),
        send: mockSend,
      }));
      OperationHandlerMock.mockImplementation(() => ({
        handle: vi.fn().mockRejectedValue(new Error('Handler failed')),
      }));

      mockElectronValue = { BrowserWindow: {} };
      const { initialize } = await import('../index.js');

      mockElectronValue = { app: { commandLine: { appendSwitch: vi.fn() } } };
      initialize({ bridgePort: 3000 });

      await vi.waitFor(() => {
        expect(messageHandler).toBeDefined();
      });

      messageHandler!({ type: 'execute_main', id: 'msg-2' });

      await vi.waitFor(() => {
        expect(mockSend).toHaveBeenCalledWith({
          type: 'operation_error',
          id: 'msg-2',
          payload: { error: 'Handler failed' },
        });
      });
    });

    it('should handle connection failure gracefully', async () => {
      IpcChannelMock.mockImplementation(() => ({
        connect: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        onMessage: vi.fn(),
        send: vi.fn(),
      }));
      OperationHandlerMock.mockImplementation(() => ({
        handle: vi.fn(),
      }));

      mockElectronValue = { BrowserWindow: {} };
      const { initialize } = await import('../index.js');

      mockElectronValue = { app: { commandLine: { appendSwitch: vi.fn() } } };
      expect(() => initialize({ bridgePort: 3000 })).not.toThrow();

      // Wait for the rejected promise to settle
      await new Promise((r) => setTimeout(r, 10));
    });

    it('should handle messages without id field', async () => {
      let messageHandler: ((msg: unknown) => void) | undefined;
      const mockSend = vi.fn().mockResolvedValue(undefined);

      IpcChannelMock.mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        onMessage: vi.fn().mockImplementation((handler: (msg: unknown) => void) => {
          messageHandler = handler;
        }),
        send: mockSend,
      }));
      OperationHandlerMock.mockImplementation(() => ({
        handle: vi.fn().mockResolvedValue({ success: true }),
      }));

      mockElectronValue = { BrowserWindow: {} };
      const { initialize } = await import('../index.js');

      mockElectronValue = { app: { commandLine: { appendSwitch: vi.fn() } } };
      initialize({ bridgePort: 3000 });

      await vi.waitFor(() => {
        expect(messageHandler).toBeDefined();
      });

      messageHandler!({ type: 'health_check' });

      await vi.waitFor(() => {
        expect(mockSend).toHaveBeenCalledWith({
          type: 'operation_result',
          id: undefined,
          payload: { success: true },
        });
      });
    });

    it('should handle multiple messages in sequence', async () => {
      const messageHandlers: ((msg: unknown) => void)[] = [];
      const sentMessages: unknown[] = [];

      IpcChannelMock.mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        onMessage: vi.fn().mockImplementation((handler: (msg: unknown) => void) => {
          messageHandlers.push(handler);
        }),
        send: vi.fn().mockImplementation((msg: unknown) => {
          sentMessages.push(msg);
          return Promise.resolve();
        }),
      }));

      let callCount = 0;
      OperationHandlerMock.mockImplementation(() => ({
        handle: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve({ success: true, data: { count: callCount } });
        }),
      }));

      mockElectronValue = { BrowserWindow: {} };
      const { initialize } = await import('../index.js');

      mockElectronValue = { app: { commandLine: { appendSwitch: vi.fn() } } };
      initialize({ bridgePort: 3000 });

      await vi.waitFor(() => {
        expect(messageHandlers.length).toBeGreaterThan(0);
      });

      const handler = messageHandlers[0];

      handler({ type: 'health_check', id: 'msg-1' });
      handler({ type: 'health_check', id: 'msg-2' });
      handler({ type: 'health_check', id: 'msg-3' });

      await vi.waitFor(() => {
        expect(sentMessages).toHaveLength(3);
      });

      expect((sentMessages[0] as Record<string, unknown>).id).toBe('msg-1');
      expect((sentMessages[1] as Record<string, unknown>).id).toBe('msg-2');
      expect((sentMessages[2] as Record<string, unknown>).id).toBe('msg-3');
    });
  });
});

// ── Non-Electron path tests ───────────────────────────────────────────

describe('index.ts - non-Electron path', () => {
  beforeEach(() => {
    vi.resetModules();
    NodeModule._load = originalModuleLoad;
    mockElectronValue = null;
  });

  it('should export initialize function', async () => {
    const { initialize } = await import('../index.js');
    expect(typeof initialize).toBe('function');
  });

  it('should export IpcChannel class', async () => {
    const { IpcChannel } = await import('../index.js');
    expect(typeof IpcChannel).toBe('function');
  });

  it('should export OperationHandler class', async () => {
    const { OperationHandler } = await import('../index.js');
    expect(typeof OperationHandler).toBe('function');
  });

  it('should not auto-initialize in non-Electron', async () => {
    const { initialize } = await import('../index.js');
    expect(() => initialize()).not.toThrow();
  });

  it('should be idempotent', async () => {
    const { initialize } = await import('../index.js');
    initialize({ cdpPort: 9222 });
    expect(() => initialize({ cdpPort: 9333 })).not.toThrow();
  });

  it('should accept all config shapes', async () => {
    const { initialize } = await import('../index.js');
    expect(() => initialize({})).not.toThrow();
  });
});
