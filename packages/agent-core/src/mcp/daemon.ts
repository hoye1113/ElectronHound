import { spawn, type ChildProcess } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { toErrorMessage } from '../utils/error.js';
import { createStderrLogger } from '../utils/logger.js';

const logger = createStderrLogger('MCPDaemon');

/**
 * Configuration for the MCP daemon manager.
 */
export interface MCPDaemonConfig {
  /** Timeout in ms before force-killing daemon on shutdown (default: 30000) */
  shutdownTimeoutMs?: number;
  /** Interval in ms between health checks (default: 60000) */
  healthCheckIntervalMs?: number;
}

/**
 * Represents an isolated browser context for a task.
 */
export interface DaemonContext {
  /** Unique identifier for this context */
  contextId: string;
  /** Task ID that owns this context */
  taskId: string;
  /** MCP client scoped to this context */
  client: {
    callTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  };
}

/**
 * Health check result for the daemon.
 */
export interface DaemonHealth {
  /** Whether the daemon is healthy */
  healthy: boolean;
  /** Daemon process PID if running */
  pid?: number;
  /** Reason for unhealthy status */
  reason?: string;
}

/**
 * Manages a persistent Playwright MCP daemon process.
 *
 * The daemon maintains a single Chromium instance that is shared across
 * multiple tasks. Each task gets an isolated BrowserContext for separation.
 *
 * Benefits:
 * - Eliminates cold start overhead for subsequent tasks
 * - Reduces memory usage by sharing browser process
 * - Faster task startup time
 */
export class MCPDaemonManager {
  private daemonProcess: ChildProcess | null = null;
  private daemonClient: Client | null = null;
  private daemonTransport: StdioClientTransport | null = null;
  private contexts: Map<string, DaemonContext> = new Map();
  private config: Required<MCPDaemonConfig>;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: MCPDaemonConfig) {
    this.config = {
      shutdownTimeoutMs: config?.shutdownTimeoutMs ?? 30000,
      healthCheckIntervalMs: config?.healthCheckIntervalMs ?? 60000,
    };
  }

  /**
   * Ensure the daemon is running. Starts it if not already running.
   * Reuses existing daemon if available.
   */
  async ensureDaemon(): Promise<void> {
    if (this.daemonProcess && this.daemonProcess.connected) {
      logger.info('Reusing existing daemon process');
      return;
    }

    logger.info('Starting new Playwright MCP daemon process');
    await this.startDaemon();
  }

  /**
   * Start the daemon process.
   */
  private async startDaemon(): Promise<void> {
    try {
      this.daemonProcess = spawn(
        'npx',
        ['@playwright/mcp', '--headless', '--daemon'],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: process.env,
        },
      );

      // Set up exit handler
      this.daemonProcess.on('exit', (code, signal) => {
        logger.warn(`Daemon process exited with code ${code}, signal ${signal}`);
        this.daemonProcess = null;
        this.daemonClient = null;
        this.daemonTransport = null;
        this.stopHealthCheck();
      });

      this.daemonProcess.on('error', (err) => {
        logger.error(`Daemon process error: ${toErrorMessage(err)}`);
        this.daemonProcess = null;
        this.daemonClient = null;
        this.daemonTransport = null;
      });

      // Create MCP client connected to daemon
      this.daemonTransport = new StdioClientTransport({
        command: 'npx',
        args: ['@playwright/mcp', '--headless', '--daemon'],
      });

      this.daemonClient = new Client({
        name: 'agent-core-daemon',
        version: '0.1.0',
      });

      await this.daemonClient.connect(this.daemonTransport);

      // Start health check
      this.startHealthCheck();

      logger.info(`Daemon started with PID ${this.daemonProcess.pid}`);
    } catch (error) {
      this.daemonProcess = null;
      this.daemonClient = null;
      this.daemonTransport = null;
      throw error;
    }
  }

  /**
   * Check if the daemon is currently running.
   */
  isRunning(): boolean {
    return this.daemonProcess !== null && this.daemonProcess.connected === true;
  }

  /**
   * Get the daemon process PID.
   */
  getDaemonPid(): number | null {
    return this.daemonProcess?.pid ?? null;
  }

  /**
   * Create an isolated BrowserContext for a task.
   */
  async createContext(taskId: string): Promise<DaemonContext> {
    if (!this.isRunning() || !this.daemonClient) {
      throw new Error('Daemon is not running');
    }

    try {
      // Call daemon to create a new browser context
      await this.daemonClient.callTool({
        name: 'browser_create_context',
        arguments: { taskId },
      });

      const contextId = `ctx-${taskId}-${Date.now()}`;

      // Create scoped client for this context
      const contextClient = {
        callTool: async (toolName: string, args: Record<string, unknown>) => {
          if (!this.daemonClient) {
            throw new Error('Daemon client not available');
          }
          return this.daemonClient.callTool({
            name: toolName,
            arguments: { ...args, contextId },
          });
        },
      };

      const context: DaemonContext = {
        contextId,
        taskId,
        client: contextClient,
      };

      this.contexts.set(taskId, context);
      logger.info(`Created context ${contextId} for task ${taskId}`);

      return context;
    } catch (error) {
      logger.error(`Failed to create context for task ${taskId}: ${toErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Destroy a task's BrowserContext.
   */
  async destroyContext(taskId: string): Promise<void> {
    const context = this.contexts.get(taskId);
    if (!context) {
      logger.warn(`Context for task ${taskId} not found, skipping destroy`);
      return;
    }

    try {
      // Call daemon to destroy the browser context
      if (this.daemonClient) {
        await this.daemonClient.callTool({
          name: 'browser_destroy_context',
          arguments: { contextId: context.contextId },
        });
      }
    } catch (error) {
      logger.warn(`Error destroying context: ${toErrorMessage(error)}`);
    } finally {
      this.contexts.delete(taskId);
      logger.info(`Destroyed context for task ${taskId}`);
    }
  }

  /**
   * Get the number of active contexts.
   */
  getActiveContextCount(): number {
    return this.contexts.size;
  }

  /**
   * Perform a health check on the daemon.
   */
  async checkHealth(): Promise<DaemonHealth> {
    if (!this.isRunning() || !this.daemonClient) {
      return {
        healthy: false,
        reason: 'Daemon is not running',
      };
    }

    try {
      // Simple health check - try to call a tool
      await this.daemonClient.callTool({
        name: 'browser_health_check',
        arguments: {},
      });

      return {
        healthy: true,
        pid: this.daemonProcess?.pid,
      };
    } catch (error) {
      return {
        healthy: false,
        pid: this.daemonProcess?.pid,
        reason: toErrorMessage(error),
      };
    }
  }

  /**
   * Start periodic health checks.
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();

    this.healthCheckTimer = setInterval(async () => {
      const health = await this.checkHealth();
      if (!health.healthy) {
        logger.warn(`Daemon health check failed: ${health.reason}`);
      }
    }, this.config.healthCheckIntervalMs);

    // Unref the timer so it doesn't keep the process alive
    if (this.healthCheckTimer.unref) {
      this.healthCheckTimer.unref();
    }
  }

  /**
   * Stop health check timer.
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Gracefully shutdown the daemon.
   *
   * 1. Wait for all contexts to be destroyed (with timeout)
   * 2. Close MCP client connection
   * 3. Send SIGTERM to daemon process
   * 4. Force kill with SIGKILL if timeout reached
   */
  async shutdown(): Promise<void> {
    if (!this.daemonProcess) {
      logger.info('No daemon to shutdown');
      return;
    }

    logger.info('Shutting down daemon...');

    // Stop health checks
    this.stopHealthCheck();

    // Wait for contexts to be cleaned up with timeout
    const shutdownStart = Date.now();
    while (
      this.contexts.size > 0 &&
      Date.now() - shutdownStart < this.config.shutdownTimeoutMs
    ) {
      // Wait a bit for contexts to be cleaned up
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Force clean remaining contexts
    if (this.contexts.size > 0) {
      logger.warn(`Force cleaning ${this.contexts.size} remaining contexts`);
      this.contexts.clear();
    }

    // Close MCP client
    if (this.daemonClient) {
      try {
        await this.daemonClient.close();
      } catch (error) {
        logger.warn(`Error closing daemon client: ${toErrorMessage(error)}`);
      }
      this.daemonClient = null;
    }

    // Close transport
    if (this.daemonTransport) {
      try {
        await this.daemonTransport.close();
      } catch (error) {
        logger.warn(`Error closing daemon transport: ${toErrorMessage(error)}`);
      }
      this.daemonTransport = null;
    }

    // Send SIGTERM to daemon process
    if (this.daemonProcess) {
      this.daemonProcess.kill('SIGTERM');

      // Wait for process to exit or force kill
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.daemonProcess) {
            logger.warn('Daemon did not exit gracefully, sending SIGKILL');
            this.daemonProcess.kill('SIGKILL');
          }
          resolve();
        }, this.config.shutdownTimeoutMs);

        this.daemonProcess?.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.daemonProcess = null;
    }

    logger.info('Daemon shutdown complete');
  }

  /**
   * Get current daemon configuration.
   */
  getConfig(): Required<MCPDaemonConfig> {
    return { ...this.config };
  }
}

/**
 * Singleton instance of the daemon manager.
 */
let defaultManager: MCPDaemonManager | null = null;

/**
 * Get or create the default daemon manager instance.
 */
export function getDaemonManager(config?: MCPDaemonConfig): MCPDaemonManager {
  if (!defaultManager) {
    defaultManager = new MCPDaemonManager(config);
  }
  return defaultManager;
}

/**
 * Set a custom daemon manager instance (useful for testing).
 */
export function setDaemonManager(manager: MCPDaemonManager): void {
  defaultManager = manager;
}

/**
 * Reset the default daemon manager (useful for testing).
 */
export function resetDaemonManager(): void {
  defaultManager = null;
}
