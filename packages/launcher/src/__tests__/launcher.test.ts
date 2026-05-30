import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnElectron, type SpawnOptions } from '../launcher.js';
import { EventEmitter } from 'node:events';

// Mock child_process module
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// Mock node:module for requireResolve
vi.mock('node:module', () => ({
  createRequire: vi.fn(() => {
    const mockRequire = Object.assign(
      vi.fn(),
      { resolve: vi.fn((id: string) => `/mock/path/to/${id}`) },
    );
    return mockRequire;
  }),
}));

// Mock version-detect module to avoid actual version detection
vi.mock('../version-detect.js', () => ({
  detectElectronVersion: vi.fn().mockResolvedValue(null),
  checkCompatibility: vi.fn().mockReturnValue({ compatible: true, warnings: [], errors: [] }),
  parseElectronVersion: vi.fn(),
  isVersionSupported: vi.fn(),
  SUPPORTED_ELECTRON_VERSIONS: [28, 30, 32, 39],
  ELECTRON_VERSION_RANGE: { min: 28, max: 39 },
}));

import { spawn } from 'node:child_process';

const mockSpawn = vi.mocked(spawn);

function createMockChildProcess(): EventEmitter & {
  pid: number;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
  stderr: EventEmitter & {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };
} {
  const mockStderr = new EventEmitter() as EventEmitter & {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };
  mockStderr.on = vi.fn(mockStderr.on.bind(mockStderr));
  mockStderr.off = vi.fn(mockStderr.off.bind(mockStderr));

  const mockChild = new EventEmitter() as EventEmitter & {
    pid: number;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
    stderr: typeof mockStderr;
  };
  mockChild.pid = 12345;
  mockChild.killed = false;
  mockChild.kill = vi.fn(() => {
    mockChild.killed = true;
  });
  mockChild.stderr = mockStderr;

  return mockChild;
}

describe('Launcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('spawnElectron', () => {
    it('should build correct args with targetAppPath and debugging port', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild as never);

      // Simulate CDP port discovery from stderr
      setImmediate(() => {
        mockChild.stderr?.emit('data', Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc'));
      });

      const options: SpawnOptions = {
        targetAppPath: '/path/to/app',
        debuggingPort: 9222,
      };

      const result = await spawnElectron(options);

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('electron'),
        ['/path/to/app', '--remote-debugging-port=9222'],
        expect.objectContaining({
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: false,
        }),
      );
      expect(result.pid).toBe(12345);
      expect(result.cdpPort).toBe(9222);
      expect(typeof result.kill).toBe('function');
    });

    it('should include --require flag when helperPath is provided', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild as never);

      setImmediate(() => {
        mockChild.stderr?.emit('data', Buffer.from('DevTools listening on ws://127.0.0.1:0/devtools/browser/abc'));
      });

      const options: SpawnOptions = {
        targetAppPath: '/path/to/app',
        helperPath: '/path/to/helper.js',
        debuggingPort: 0,
      };

      await spawnElectron(options);

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('electron'),
        ['/path/to/app', '--remote-debugging-port=0', '--require', '/path/to/helper.js'],
        expect.any(Object),
      );
    });

    it('should merge custom env with process.env', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild as never);

      setImmediate(() => {
        mockChild.stderr?.emit('data', Buffer.from('DevTools listening on ws://127.0.0.1:0/devtools/browser/abc'));
      });

      const options: SpawnOptions = {
        targetAppPath: '/path/to/app',
        env: { CUSTOM_VAR: 'test-value' },
      };

      await spawnElectron(options);

      const spawnCall = mockSpawn.mock.calls[0];
      const spawnOptions = spawnCall[2];
      expect(spawnOptions.env).toHaveProperty('CUSTOM_VAR', 'test-value');
    });

    it('should kill terminate process via kill method', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild as never);

      setImmediate(() => {
        mockChild.stderr?.emit('data', Buffer.from('DevTools listening on ws://127.0.0.1:0/devtools/browser/abc'));
      });

      const options: SpawnOptions = {
        targetAppPath: '/path/to/app',
      };

      const result = await spawnElectron(options);

      expect(mockChild.killed).toBe(false);
      result.kill();
      expect(mockChild.killed).toBe(true);
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should handle error event on child process', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild as never);

      setImmediate(() => {
        mockChild.emit('error', new Error('spawn ENOENT'));
      });

      const options: SpawnOptions = {
        targetAppPath: '/path/to/app',
        timeout: 100,
      };

      // Should not throw - error is logged, not re-thrown
      // But the CDP port resolution will timeout since no stderr data
      await expect(spawnElectron(options)).rejects.toThrow(
        'spawn ENOENT',
      );
    });

    it('should reject when process exits before CDP ready', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild as never);

      setImmediate(() => {
        mockChild.emit('exit', 1, null);
      });

      const options: SpawnOptions = {
        targetAppPath: '/path/to/app',
        timeout: 5000,
      };

      await expect(spawnElectron(options)).rejects.toThrow(
        'Electron process exited before CDP ready',
      );
    });

    it('should reject on timeout when no CDP port appears', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild as never);

      // Never emit CDP port data
      const options: SpawnOptions = {
        targetAppPath: '/path/to/app',
        timeout: 100,
      };

      await expect(spawnElectron(options)).rejects.toThrow(
        'Timeout waiting for CDP port after 100ms',
      );
    });
  });

  describe('user-data-dir isolation (PR-4)', () => {
    it('should pass --user-data-dir flag when taskId is provided', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild as never);

      const options: SpawnOptions = {
        targetAppPath: '/path/to/app',
        taskId: 'test-task-123',
        timeout: 100,
      };

      // Start the spawn (will timeout, but we can check the args)
      const promise = spawnElectron(options);

      // Emit CDP port to resolve
      setTimeout(() => {
        mockChild.stderr.emit('data', Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n'));
      }, 10);

      await promise;

      // Verify --user-data-dir was passed
      const spawnArgs = mockSpawn.mock.calls[0];
      const args = spawnArgs[1] as string[];
      const userDataDirArg = args.find((a: string) => a.startsWith('--user-data-dir='));
      expect(userDataDirArg).toBeDefined();
      expect(userDataDirArg).toContain('eata-test-task-123-');
    });

    it('should not pass --user-data-dir when taskId is not provided', async () => {
      const mockChild = createMockChildProcess();
      mockSpawn.mockReturnValue(mockChild as never);

      const options: SpawnOptions = {
        targetAppPath: '/path/to/app',
        timeout: 100,
      };

      const promise = spawnElectron(options);

      setTimeout(() => {
        mockChild.stderr.emit('data', Buffer.from('DevTools listening on ws://127.0.0.1:9222/devtools/browser/abc\n'));
      }, 10);

      await promise;

      const spawnArgs = mockSpawn.mock.calls[0];
      const args = spawnArgs[1] as string[];
      const userDataDirArg = args.find((a: string) => a.startsWith('--user-data-dir='));
      expect(userDataDirArg).toBeUndefined();
    });
  });
});
