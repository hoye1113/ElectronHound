import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerManager, type WorkerOptions } from '../services/workerManager.js';

// ── Mock child_process.spawn (all in vi.hoisted for hoist safety) ──

// Type for the fake process created in tests (avoids `as any`)
interface FakeProcess {
  pid: number;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  stdout: {
    on: (event: string, cb: (...args: unknown[]) => void) => unknown;
    emitData: (data: string) => void;
  };
  stderr: { on: (event: string, cb: (...args: unknown[]) => void) => unknown };
  stdin: { write: ReturnType<typeof vi.fn>; writable: boolean };
  on: (event: string, cb: (...args: unknown[]) => void) => unknown;
  emitEvent: (event: string, ...args: unknown[]) => void;
  kill: ReturnType<typeof vi.fn>;
}

const { fakeSpawn, getLastSpawnArgs, getLastSpawnEnvs } = vi.hoisted(() => {
  // ── Fake Process Factory ────────────────────────────────────────

  function createFakeProcess() {
    const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
    const stdinWrite = vi.fn().mockReturnValue(true);
    const killFn = vi.fn().mockReturnValue(true);

    const stdoutObj = {
      on(event: string, cb: (...args: unknown[]) => void) {
        const key = `stdout:${event}`;
        if (!listeners[key]) listeners[key] = [];
        listeners[key].push(cb);
        return stdoutObj;
      },
      emitData(data: string) {
        const cbs = listeners['stdout:data'] || [];
        for (const cb of cbs) cb(Buffer.from(data));
      },
    };

    const stderrObj = {
      on(event: string, cb: (...args: unknown[]) => void) {
        const key = `stderr:${event}`;
        if (!listeners[key]) listeners[key] = [];
        listeners[key].push(cb);
        return stderrObj;
      },
    };

    const fakeProcess = {
      pid: 12345,
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      stdout: stdoutObj,
      stderr: stderrObj,
      stdin: { write: stdinWrite, writable: true },
      on(event: string, cb: (...args: unknown[]) => void) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
        return fakeProcess;
      },
      emitEvent(event: string, ...args: unknown[]) {
        const cbs = listeners[event] || [];
        for (const cb of cbs) cb(...args);
      },
      kill: killFn,
    };

    return fakeProcess;
  }

  // ── Spawn Mock ─────────────────────────────────────────────────

  let spawnArgs: string[] = [];
  let spawnEnvs: NodeJS.ProcessEnv = {};

  const fakeSpawn = vi.fn(
    (_command: string, args: string[], opts?: { env?: NodeJS.ProcessEnv }) => {
      spawnArgs = args;
      spawnEnvs = opts?.env ?? {};
      return createFakeProcess();
    },
  );

  return {
    fakeSpawn,
    getLastSpawnArgs: () => spawnArgs,
    getLastSpawnEnvs: () => spawnEnvs,
  };
});

vi.mock('node:child_process', () => ({
  spawn: fakeSpawn,
}));

// ── Helpers ─────────────────────────────────────────────────────────

const defaultOptions: WorkerOptions = {
  taskId: 'test-task-1',
  targetAppPath: '/path/to/app',
  goal: 'Test the login form',
  llmModel: 'gpt-4o',
};

// ── Tests ───────────────────────────────────────────────────────────

describe('WorkerManager', () => {
  let manager: WorkerManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new WorkerManager();
  });

  afterEach(() => {
    vi.useRealTimers();
    manager.shutdown();
    fakeSpawn.mockClear();
  });

  // ── spawnWorker ─────────────────────────────────────────────────

  describe('spawnWorker', () => {
    it('spawns a process with correct command and args', () => {
      manager.spawnWorker(defaultOptions);

      const args = getLastSpawnArgs();
      expect(args).toContain('--task-id');
      expect(args).toContain('test-task-1');
      expect(args).toContain('--goal');
      expect(args).toContain('Test the login form');
      expect(args).toContain('--target-app');
      expect(args).toContain('/path/to/app');
      expect(args).toContain('--llm-model');
      expect(args).toContain('gpt-4o');
    });

    it('includes maxSteps arg when specified', () => {
      manager.spawnWorker({ ...defaultOptions, maxSteps: 100 });
      const args = getLastSpawnArgs();
      const idx = args.indexOf('--max-steps');
      expect(idx).not.toBe(-1);
      expect(args[idx + 1]).toBe('100');
    });

    it('includes contextInjection arg when specified', () => {
      manager.spawnWorker({
        ...defaultOptions,
        contextInjection: 'custom context',
      });
      const args = getLastSpawnArgs();
      const idx = args.indexOf('--context-injection');
      expect(idx).not.toBe(-1);
      expect(args[idx + 1]).toBe('custom context');
    });

    it('does not include maxSteps when not specified', () => {
      manager.spawnWorker(defaultOptions);
      const args = getLastSpawnArgs();
      expect(args).not.toContain('--max-steps');
    });

    it('includes providerId arg when specified', () => {
      manager.spawnWorker({ ...defaultOptions, providerId: 'deepseek-1' });
      const args = getLastSpawnArgs();
      const idx = args.indexOf('--provider-id');
      expect(idx).not.toBe(-1);
      expect(args[idx + 1]).toBe('deepseek-1');
    });

    it('does not include providerId when not specified', () => {
      manager.spawnWorker(defaultOptions);
      const args = getLastSpawnArgs();
      expect(args).not.toContain('--provider-id');
    });

    it('sets LLM_MODEL env variable', () => {
      manager.spawnWorker(defaultOptions);
      const envs = getLastSpawnEnvs();
      expect(envs.LLM_MODEL).toBe('gpt-4o');
    });

    it('returns a WorkerHandle with starting status', () => {
      const handle = manager.spawnWorker(defaultOptions);
      expect(handle.taskId).toBe('test-task-1');
      expect(handle.status).toBe('starting');
      expect(handle.startedAt).toBeInstanceOf(Date);
      expect(handle.lastHeartbeat).toBeInstanceOf(Date);
      expect(handle.process).toBeDefined();
    });

    it('throws when duplicate taskId is spawned', () => {
      manager.spawnWorker(defaultOptions);
      expect(() => manager.spawnWorker(defaultOptions)).toThrow(
        'Worker already exists for task test-task-1',
      );
    });

    it('emits started event', () => {
      const events: Array<{ type: string }> = [];
      manager.onEvent((e) => events.push(e));
      manager.spawnWorker(defaultOptions);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('started');
    });
  });

  // ── JSON-RPC stdout handling ────────────────────────────────────

  describe('JSON-RPC stdout parsing', () => {
    it('transitions to running on step_start', () => {
      const handle = manager.spawnWorker(defaultOptions);
      expect(handle.status).toBe('starting');

      const proc = handle.process as unknown as FakeProcess;
      proc.stdout.emitData(
        '{"jsonrpc":"2.0","method":"step_start","params":{}}\n',
      );

      expect(handle.status).toBe('running');
    });

    it('updates lastHeartbeat on heartbeat message', () => {
      const handle = manager.spawnWorker(defaultOptions);
      const before = handle.lastHeartbeat.getTime();

      vi.advanceTimersByTime(1000);

      const proc = handle.process as unknown as FakeProcess;
      proc.stdout.emitData(
        '{"jsonrpc":"2.0","method":"heartbeat","params":{}}\n',
      );

      expect(handle.lastHeartbeat.getTime()).toBeGreaterThan(before);
    });

    it('marks task completed on task_end with success=true', () => {
      const events: Array<{ type: string }> = [];
      manager.onEvent((e) => events.push(e));

      const handle = manager.spawnWorker(defaultOptions);

      const proc = handle.process as unknown as FakeProcess;
      proc.stdout.emitData(
        '{"jsonrpc":"2.0","method":"task_end","params":{"success":true}}\n',
      );

      expect(handle.status).toBe('completed');
      expect(events).toContainEqual({
        taskId: 'test-task-1',
        type: 'completed',
      });
    });

    it('marks task failed on task_end with success=false', () => {
      const events: Array<{ type: string }> = [];
      manager.onEvent((e) => events.push(e));

      const handle = manager.spawnWorker(defaultOptions);

      const proc = handle.process as unknown as FakeProcess;
      proc.stdout.emitData(
        '{"jsonrpc":"2.0","method":"task_end","params":{"success":false}}\n',
      );

      expect(handle.status).toBe('failed');
      expect(events).toContainEqual({
        taskId: 'test-task-1',
        type: 'failed',
      });
    });

    it('marks task failed on error message', () => {
      const events: Array<{ type: string; error?: string }> = [];
      manager.onEvent((e) => events.push(e));

      const handle = manager.spawnWorker(defaultOptions);

      const proc = handle.process as unknown as FakeProcess;
      proc.stdout.emitData(
        '{"jsonrpc":"2.0","method":"error","params":{"message":"Something broke"}}\n',
      );

      expect(handle.status).toBe('failed');
      expect(events).toContainEqual({
        taskId: 'test-task-1',
        type: 'failed',
        error: 'Something broke',
      });
    });

    it('handles multiple JSON messages in a single chunk', () => {
      const handle = manager.spawnWorker(defaultOptions);

      const proc = handle.process as unknown as FakeProcess;
      proc.stdout.emitData(
        '{"jsonrpc":"2.0","method":"step_start"}\n{"jsonrpc":"2.0","method":"heartbeat"}\n',
      );

      expect(handle.status).toBe('running');
    });

    it('tolerates non-JSON lines in stdout', () => {
      const handle = manager.spawnWorker(defaultOptions);

      const proc = handle.process as unknown as FakeProcess;
      expect(() => {
        proc.stdout.emitData('some plain text output\n');
      }).not.toThrow();

      expect(handle.status).toBe('starting');
    });
  });

  // ── sendControl ─────────────────────────────────────────────────

  describe('sendControl', () => {
    it('writes JSON-RPC control message to stdin', () => {
      const handle = manager.spawnWorker(defaultOptions);
      manager.sendControl('test-task-1', 'cancel', { taskId: 'test-task-1' });

      const stdin = (handle.process as unknown as FakeProcess).stdin;
      expect(stdin.write).toHaveBeenCalledTimes(1);

      const written = (stdin.write as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed.jsonrpc).toBe('2.0');
      expect(parsed.method).toBe('cancel');
      expect(parsed.params).toEqual({ taskId: 'test-task-1' });
      expect(parsed.id).toBeTypeOf('number');
    });

    it('does nothing when worker does not exist', () => {
      expect(() => {
        manager.sendControl('nonexistent', 'cancel');
      }).not.toThrow();
    });

    it('sends pause and resume control messages', () => {
      const handle = manager.spawnWorker(defaultOptions);
      manager.sendControl('test-task-1', 'pause');
      manager.sendControl('test-task-1', 'resume');

      const stdin = (handle.process as unknown as FakeProcess).stdin;
      expect(stdin.write).toHaveBeenCalledTimes(2);
    });

    it('sends inject_context with params', () => {
      const handle = manager.spawnWorker(defaultOptions);
      manager.sendControl('test-task-1', 'inject_context', {
        hint: 'try a different approach',
      });

      const stdin = (handle.process as unknown as FakeProcess).stdin;
      expect(stdin.write).toHaveBeenCalledTimes(1);

      const written = (stdin.write as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed.method).toBe('inject_context');
    });
  });

  // ── Heartbeat timeout ───────────────────────────────────────────

  describe('heartbeat timeout detection', () => {
    it('marks worker as failed when heartbeat times out', () => {
      const events: Array<{ type: string }> = [];
      manager.onEvent((e) => events.push(e));

      const handle = manager.spawnWorker(defaultOptions);
      const proc = handle.process as unknown as FakeProcess;
      proc.stdout.emitData(
        '{"jsonrpc":"2.0","method":"step_start"}\n',
      );

      vi.advanceTimersByTime(12_000);

      expect(handle.status).toBe('failed');
      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
      expect(events.some((e) => e.type === 'failed')).toBe(true);
    });

    it('does not timeout if heartbeat is received', () => {
      const handle = manager.spawnWorker(defaultOptions);
      const proc = handle.process as unknown as FakeProcess;
      proc.stdout.emitData(
        '{"jsonrpc":"2.0","method":"step_start"}\n',
      );

      vi.advanceTimersByTime(8_000);
      proc.stdout.emitData(
        '{"jsonrpc":"2.0","method":"heartbeat"}\n',
      );

      vi.advanceTimersByTime(8_000);

      expect(handle.status).toBe('running');
    });

    it('does not check heartbeat for completed workers', () => {
      const handle = manager.spawnWorker(defaultOptions);
      const proc = handle.process as unknown as FakeProcess;
      proc.stdout.emitData(
        '{"jsonrpc":"2.0","method":"task_end","params":{"success":true}}\n',
      );

      vi.advanceTimersByTime(12_000);
      expect(handle.status).toBe('completed');
    });
  });

  // ── cancelWorker ────────────────────────────────────────────────

  describe('cancelWorker', () => {
    it('sends cancel control message on cancelWorker', () => {
      const handle = manager.spawnWorker(defaultOptions);

      manager.cancelWorker('test-task-1');

      const stdin = (handle.process as unknown as FakeProcess).stdin;
      const written = (stdin.write as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed.method).toBe('cancel');
    });

    it('sends SIGTERM after cancel timeout', () => {
      const handle = manager.spawnWorker(defaultOptions);

      manager.cancelWorker('test-task-1');

      vi.advanceTimersByTime(6_000);

      const proc = handle.process as unknown as FakeProcess;
      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('emits cancelled event on process exit after cancel', () => {
      const events: Array<{ type: string }> = [];
      manager.onEvent((e) => events.push(e));

      const handle = manager.spawnWorker(defaultOptions);
      manager.cancelWorker('test-task-1');

      const proc = handle.process as unknown as FakeProcess;
      proc.emitEvent('exit', 1, 'SIGTERM');

      expect(handle.status).toBe('cancelled');
      expect(events.some((e) => e.type === 'cancelled')).toBe(true);
    });

    it('does nothing for non-existent worker', () => {
      expect(() => {
        manager.cancelWorker('nonexistent');
      }).not.toThrow();
    });
  });

  // ── Crash detection ─────────────────────────────────────────────

  describe('crash detection', () => {
    it('marks worker as failed on unexpected exit with non-zero code', () => {
      const events: Array<{ type: string; error?: string }> = [];
      manager.onEvent((e) => events.push(e));

      const handle = manager.spawnWorker(defaultOptions);
      const proc = handle.process as unknown as FakeProcess;
      proc.stdout.emitData(
        '{"jsonrpc":"2.0","method":"step_start"}\n',
      );
      expect(handle.status).toBe('running');

      proc.emitEvent('exit', 1, null);

      expect(handle.status).toBe('failed');
      expect(events).toContainEqual({
        taskId: 'test-task-1',
        type: 'failed',
        error: 'Process exited with code=1, signal=null',
      });
    });

    it('marks worker as failed on exit with signal', () => {
      const events: Array<{ type: string }> = [];
      manager.onEvent((e) => events.push(e));

      const handle = manager.spawnWorker(defaultOptions);
      const proc = handle.process as unknown as FakeProcess;
      proc.stdout.emitData(
        '{"jsonrpc":"2.0","method":"step_start"}\n',
      );

      proc.emitEvent('exit', null, 'SIGKILL');

      expect(handle.status).toBe('failed');
      expect(events).toContainEqual({
        taskId: 'test-task-1',
        type: 'failed',
        error: 'Process exited with code=null, signal=SIGKILL',
      });
    });

    it('cleans up worker from map after exit', () => {
      const handle = manager.spawnWorker(defaultOptions);
      const proc = handle.process as unknown as FakeProcess;
      proc.emitEvent('exit', 0, null);

      expect(manager.getWorker('test-task-1')).toBeUndefined();
      expect(manager.getAllWorkers()).toHaveLength(0);
    });

    it('marks worker as failed on spawn error', () => {
      const events: Array<{ type: string; error?: string }> = [];
      manager.onEvent((e) => events.push(e));

      const handle = manager.spawnWorker(defaultOptions);
      const proc = handle.process as unknown as FakeProcess;
      proc.emitEvent('error', new Error('ENOENT'));

      expect(handle.status).toBe('failed');
      expect(events).toContainEqual({
        taskId: 'test-task-1',
        type: 'failed',
        error: 'ENOENT',
      });
    });
  });

  // ── getWorker / getWorkerStatus ─────────────────────────────────

  describe('getWorker and getWorkerStatus', () => {
    it('returns worker handle for existing worker', () => {
      const handle = manager.spawnWorker(defaultOptions);
      expect(manager.getWorker('test-task-1')).toBe(handle);
    });

    it('returns undefined for non-existent worker', () => {
      expect(manager.getWorker('nonexistent')).toBeUndefined();
    });

    it('returns correct status string', () => {
      const handle = manager.spawnWorker(defaultOptions);
      expect(manager.getWorkerStatus('test-task-1')).toBe('starting');

      const proc = handle.process as unknown as FakeProcess;
      proc.stdout.emitData(
        '{"jsonrpc":"2.0","method":"step_start"}\n',
      );
      expect(manager.getWorkerStatus('test-task-1')).toBe('running');
    });

    it('getAllWorkers returns all active workers', () => {
      manager.spawnWorker(defaultOptions);
      manager.spawnWorker({ ...defaultOptions, taskId: 'test-task-2' });

      expect(manager.getAllWorkers()).toHaveLength(2);
    });
  });

  // ── shutdown ────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('kills all running workers on shutdown', () => {
      const handle1 = manager.spawnWorker(defaultOptions);
      const handle2 = manager.spawnWorker({
        ...defaultOptions,
        taskId: 'test-task-2',
      });

      manager.shutdown();

      expect((handle1.process as unknown as FakeProcess).kill).toHaveBeenCalledWith('SIGTERM');
      expect((handle2.process as unknown as FakeProcess).kill).toHaveBeenCalledWith('SIGTERM');
      expect(manager.getAllWorkers()).toHaveLength(0);
    });

    it('clears all workers from map', () => {
      manager.spawnWorker(defaultOptions);
      manager.shutdown();
      expect(manager.getAllWorkers()).toHaveLength(0);
      expect(manager.getWorker('test-task-1')).toBeUndefined();
    });
  });

  // ── Event listener isolation ────────────────────────────────────

  describe('event listener error isolation', () => {
    it('does not crash if an event listener throws', () => {
      manager.onEvent(() => {
        throw new Error('Listener error');
      });

      const normalListener = vi.fn();
      manager.onEvent(normalListener);

      expect(() => {
        manager.spawnWorker(defaultOptions);
      }).not.toThrow();

      expect(normalListener).toHaveBeenCalled();
    });
  });
});
