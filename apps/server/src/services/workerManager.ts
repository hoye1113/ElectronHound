import { spawn, type ChildProcess } from 'node:child_process';
import type { JsonRpcNotification, JsonRpcControl } from '@eata/shared-types';

// ── Types ───────────────────────────────────────────────────────────

export interface WorkerOptions {
  taskId: string;
  targetAppPath: string;
  goal: string;
  llmModel: string;
  maxSteps?: number;
  contextInjection?: string;
  providerId?: string;
}

export type WorkerStatus =
  | 'starting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface WorkerHandle {
  taskId: string;
  process: ChildProcess;
  status: WorkerStatus;
  startedAt: Date;
  lastHeartbeat: Date;
}

export interface WorkerEvent {
  taskId: string;
  type: 'started' | 'completed' | 'failed' | 'cancelled';
  error?: string;
}

// ── Constants ───────────────────────────────────────────────────────

const RUNNER_SCRIPT = 'packages/agent-core/src/worker-entry.ts';
const HEARTBEAT_TIMEOUT = 10_000;
const HEARTBEAT_CHECK_INTERVAL = 2_000;
const CANCEL_TIMEOUT = 5_000;

// ── WorkerManager ───────────────────────────────────────────────────

export class WorkerManager {
  private workers: Map<string, WorkerHandle> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private eventListeners: Array<(event: WorkerEvent) => void> = [];

  // ── Public API ──────────────────────────────────────────────────

  onEvent(listener: (event: WorkerEvent) => void): void {
    this.eventListeners.push(listener);
  }

  removeListener(listener: (event: WorkerEvent) => void): void {
    const idx = this.eventListeners.indexOf(listener);
    if (idx !== -1) {
      this.eventListeners.splice(idx, 1);
    }
  }

  spawnWorker(options: WorkerOptions): WorkerHandle {
    if (this.workers.has(options.taskId)) {
      throw new Error(`Worker already exists for task ${options.taskId}`);
    }

    const args = this.buildArgs(options);
    const child = spawn('npx', ['tsx', RUNNER_SCRIPT, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: this.buildEnv(options),
    });

    const handle: WorkerHandle = {
      taskId: options.taskId,
      process: child,
      status: 'starting',
      startedAt: new Date(),
      lastHeartbeat: new Date(),
    };

    this.workers.set(options.taskId, handle);

    // Stdout: JSON-RPC notifications (newline-delimited)
    child.stdout?.on('data', (chunk: Buffer) => {
      this.handleStdout(options.taskId, chunk.toString());
    });

    // Stderr: log as errors
    child.stderr?.on('data', (chunk: Buffer) => {
      console.error(`[worker:${options.taskId}] stderr:`, chunk.toString().trim());
    });

    // Process exit
    child.on('exit', (code, signal) => {
      this.handleExit(options.taskId, code, signal);
    });

    // Process error (spawn failure)
    child.on('error', (err) => {
      console.error(`[worker:${options.taskId}] spawn error:`, err.message);
      const handle = this.workers.get(options.taskId);
      if (handle) {
        handle.status = 'failed';
      }
      this.emit({ taskId: options.taskId, type: 'failed', error: err.message });
    });

    // Start heartbeat monitoring on first worker
    if (!this.heartbeatInterval) {
      this.startHeartbeatMonitor();
    }

    this.emit({ taskId: options.taskId, type: 'started' });

    return handle;
  }

  cancelWorker(taskId: string): void {
    const handle = this.workers.get(taskId);
    if (!handle) return;

    // Mark as cancelled BEFORE sending signal so handleExit() emits the right event
    handle.status = 'cancelled';

    // Send JSON-RPC cancel control message
    this.sendControl(taskId, 'cancel', { taskId });

    // Force kill after timeout if still running
    setTimeout(() => {
      if (handle.process.exitCode === null && handle.process.signalCode === null) {
        handle.process.kill('SIGTERM');
      }
    }, CANCEL_TIMEOUT);
  }

  sendControl(
    taskId: string,
    method: JsonRpcControl['method'],
    params?: Record<string, unknown>,
  ): void {
    const handle = this.workers.get(taskId);
    if (!handle || !handle.process.stdin || !handle.process.stdin.writable) {
      return;
    }

    const message: JsonRpcControl = {
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
    };

    handle.process.stdin.write(JSON.stringify(message) + '\n');
  }

  getWorker(taskId: string): WorkerHandle | undefined {
    return this.workers.get(taskId);
  }

  getWorkerStatus(taskId: string): WorkerStatus | undefined {
    return this.workers.get(taskId)?.status;
  }

  getAllWorkers(): WorkerHandle[] {
    return Array.from(this.workers.values());
  }

  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    for (const [taskId, handle] of this.workers) {
      if (handle.process.exitCode === null && handle.process.signalCode === null) {
        handle.process.kill('SIGTERM');
      }
    }

    this.workers.clear();
  }

  // ── Private ─────────────────────────────────────────────────────

  /**
   * Sanitize user input to prevent shell command injection.
   * Removes shell metacharacters: ; | & $ ` ( ) and enforces length limit.
   */
  static sanitizeArg(input: string, maxLength: number): string {
    const sanitized = input.replace(/[;|&$`()]/g, '');
    return sanitized.slice(0, maxLength);
  }

  private buildArgs(options: WorkerOptions): string[] {
    const args = [
      '--task-id', options.taskId,
      '--goal', options.goal,
      '--target-app', options.targetAppPath,
      '--llm-model', options.llmModel,
      '--thread-id', options.taskId, // for LangGraph checkpoint recovery
    ];

    if (options.maxSteps !== undefined) {
      args.push('--max-steps', String(options.maxSteps));
    }

    if (options.contextInjection) {
      args.push('--context-injection', options.contextInjection);
    }

    if (options.providerId) {
      args.push('--provider-id', options.providerId);
    }

    return args;
  }

  private buildEnv(options: WorkerOptions): NodeJS.ProcessEnv {
    return {
      ...process.env,
      LLM_MODEL: options.llmModel,
    };
  }

  private handleStdout(taskId: string, data: string): void {
    const lines = data.split('\n').filter((line) => line.trim().length > 0);

    for (const line of lines) {
      try {
        const msg: JsonRpcNotification = JSON.parse(line);
        this.dispatchNotification(taskId, msg);
      } catch {
        // Non-JSON output — log as raw text
        console.warn(`[worker:${taskId}] non-JSON stdout:`, line);
      }
    }
  }

  private dispatchNotification(
    taskId: string,
    msg: JsonRpcNotification,
  ): void {
    const handle = this.workers.get(taskId);
    if (!handle) return;


    switch (msg.method) {
      case 'heartbeat':
        // Update heartbeat timestamp but keep running status
        handle.lastHeartbeat = new Date();
        break;

      case 'step_start':
        // Transition from starting to running on first step
        if (handle.status === 'starting') {
          handle.status = 'running';
        }
        handle.lastHeartbeat = new Date();
        break;

      case 'step_complete':
        handle.lastHeartbeat = new Date();
        break;

      case 'log':
        handle.lastHeartbeat = new Date();
        break;

      case 'task_end': {
        const success = (msg.params as Record<string, unknown> | undefined)
          ?.success;
        handle.status = success ? 'completed' : 'failed';
        this.emit({
          taskId,
          type: success ? 'completed' : 'failed',
        });
        break;
      }

      case 'error': {
        handle.status = 'failed';
        const errorMsg =
          (msg.params as Record<string, unknown> | undefined)?.message;
        this.emit({
          taskId,
          type: 'failed',
          error: typeof errorMsg === 'string' ? errorMsg : 'Unknown error',
        });
        break;
      }
    }
  }

  private handleExit(
    taskId: string,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    const handle = this.workers.get(taskId);
    if (!handle) return;

    if (handle.status === 'cancelled') {
      // Cancel was requested — emit cancellation event
      this.emit({ taskId, type: 'cancelled' });
    } else if (handle.status === 'running' || handle.status === 'starting') {
      // Unexpected exit while still running
      handle.status = 'failed';
      this.emit({
        taskId,
        type: 'failed',
        error: `Process exited with code=${code}, signal=${signal}`,
      });
    }

    // Remove worker from map
    this.workers.delete(taskId);

    // If no more workers, stop heartbeat monitor
    if (this.workers.size === 0 && this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private startHeartbeatMonitor(): void {
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeats();
    }, HEARTBEAT_CHECK_INTERVAL);
  }

  private checkHeartbeats(): void {
    const now = Date.now();
    const stalled: string[] = [];

    for (const [taskId, handle] of this.workers) {
      if (
        (handle.status === 'running' || handle.status === 'starting') &&
        now - handle.lastHeartbeat.getTime() > HEARTBEAT_TIMEOUT
      ) {
        stalled.push(taskId);
      }
    }

    for (const taskId of stalled) {
      const handle = this.workers.get(taskId);
      if (handle) {
        handle.status = 'failed';
        handle.process.kill('SIGTERM');
        this.emit({
          taskId,
          type: 'failed',
          error: 'Heartbeat timeout — worker unresponsive',
        });
      }
    }
  }

  private emit(event: WorkerEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Swallow listener errors
      }
    }
  }
}
