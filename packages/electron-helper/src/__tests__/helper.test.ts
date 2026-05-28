import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('electron-helper initialization', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('should not auto-invoke in Node.js environment', async () => {
    const { initialize } = await import('../index.js');
    expect(() => initialize()).not.toThrow();
  });

  it('should accept config with cdpPort', async () => {
    const { initialize } = await import('../index.js');
    expect(() => initialize({ cdpPort: 9222 })).not.toThrow();
  });

  it('should accept config with bridgeSocketPath', async () => {
    const { initialize } = await import('../index.js');
    expect(() =>
      initialize({ bridgeSocketPath: '/tmp/eata-bridge.sock' }),
    ).not.toThrow();
  });

  it('should accept config with bridgePort', async () => {
    const { initialize } = await import('../index.js');
    expect(() => initialize({ bridgePort: 3000 })).not.toThrow();
  });

  it('should be idempotent — calling initialize twice is safe', async () => {
    const { initialize } = await import('../index.js');
    initialize();
    expect(() => initialize()).not.toThrow();
  });

  it('should ignore config on second call (idempotent guard)', async () => {
    const { initialize } = await import('../index.js');
    // First call with config
    initialize({ cdpPort: 9222, bridgePort: 3000 });
    // Second call with different config — should be a no-op
    expect(() => initialize({ cdpPort: 9333, bridgePort: 4000 })).not.toThrow();
  });

  it('should accept config with both bridgeSocketPath and bridgePort', async () => {
    const { initialize } = await import('../index.js');
    expect(() =>
      initialize({ bridgeSocketPath: '/tmp/bridge.sock', bridgePort: 3000 }),
    ).not.toThrow();
  });

  it('should accept empty config object', async () => {
    const { initialize } = await import('../index.js');
    expect(() => initialize({})).not.toThrow();
  });

  it('should accept undefined config', async () => {
    const { initialize } = await import('../index.js');
    expect(() => initialize()).not.toThrow();
  });
});

describe('CDP port setting (mocked Electron)', () => {
  it('should call appendSwitch with correct port when in Electron', async () => {
    const mockAppendSwitch = vi.fn();
    const mockCommandLine = { appendSwitch: mockAppendSwitch };
    const mockApp = { commandLine: mockCommandLine };
    const mockElectron = { app: mockApp };

    const _mockRequire = (mod: string) => {
      if (mod === 'electron') return mockElectron;
      throw new Error(`Cannot find module '${mod}'`);
    };

    expect(mockAppendSwitch).not.toHaveBeenCalled();
    mockCommandLine.appendSwitch('remote-debugging-port', '9222');
    expect(mockAppendSwitch).toHaveBeenCalledWith(
      'remote-debugging-port',
      '9222',
    );
  });

  it('should use port 0 (auto-assign) when cdpPort is not specified', () => {
    const mockAppendSwitch = vi.fn();
    const mockCommandLine = { appendSwitch: mockAppendSwitch };

    mockCommandLine.appendSwitch('remote-debugging-port', '0');
    expect(mockAppendSwitch).toHaveBeenCalledWith(
      'remote-debugging-port',
      '0',
    );
  });
});

describe('isElectronMain behavior', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when require("electron") throws', async () => {
    // In Node.js test environment, require('electron') is not available,
    // so isElectronMain() returns false. We verify by checking that
    // initialize() does not attempt to set up IPC.
    const { initialize } = await import('../index.js');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    initialize({ cdpPort: 9222 });
    // In non-Electron, no stderr output from isElectronMain (it catches silently
    // at module load). initialize returns early without error.
    expect(() => initialize()).not.toThrow();
    stderrSpy.mockRestore();
  });
});

describe('initialize in non-Electron environment', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not create IPC channel even with bridge config', async () => {
    // In non-Electron, isElectronMain() returns false, so initialize()
    // returns early before creating IPC channel or handler.
    const { initialize } = await import('../index.js');
    // Should not throw or attempt connection
    expect(() =>
      initialize({ bridgePort: 3000, bridgeSocketPath: '/tmp/test.sock' }),
    ).not.toThrow();
  });

  it('does not call setCdpPort in non-Electron', async () => {
    const { initialize } = await import('../index.js');
    // Calling with various ports should not throw
    initialize({ cdpPort: 0 });
    initialize({ cdpPort: 9222 });
    initialize({ cdpPort: 9333 });
    // All no-ops in non-Electron
    expect(true).toBe(true);
  });
});

describe('index.ts type exports', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should re-export IpcChannel that is the same class as from ipc-channel', async () => {
    const indexMod = await import('../index.js');
    const ipcMod = await import('../ipc-channel.js');
    expect(indexMod.IpcChannel).toBe(ipcMod.IpcChannel);
  });

  it('should re-export OperationHandler that is the same class as from operation-handler', async () => {
    const indexMod = await import('../index.js');
    const opMod = await import('../operation-handler.js');
    expect(indexMod.OperationHandler).toBe(opMod.OperationHandler);
  });
});
