import { describe, it, vi, beforeEach } from 'vitest';
import {
  setDaemonManager,
  resetDaemonManager,
  type MCPDaemonManager,
} from '../mcp/daemon.js';

describe('MCP Daemon Manager', () => {
  beforeEach(() => {
    resetDaemonManager();
  });

  describe('setDaemonManager', () => {
    it('should set a custom daemon manager', () => {
      const mockManager = {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        createContext: vi.fn().mockResolvedValue({
          contextId: 'ctx-1',
          taskId: 'task-1',
          client: { callTool: vi.fn() },
        }),
        destroyContext: vi.fn().mockResolvedValue(undefined),
        healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
      } as unknown as MCPDaemonManager;

      // Should not throw
      setDaemonManager(mockManager);
    });
  });

  describe('resetDaemonManager', () => {
    it('should reset the daemon manager to null', () => {
      const mockManager = {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        createContext: vi.fn().mockResolvedValue({
          contextId: 'ctx-1',
          taskId: 'task-1',
          client: { callTool: vi.fn() },
        }),
        destroyContext: vi.fn().mockResolvedValue(undefined),
        healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
      } as unknown as MCPDaemonManager;

      setDaemonManager(mockManager);
      // Should not throw
      resetDaemonManager();
    });

    it('should be safe to call reset multiple times', () => {
      resetDaemonManager();
      resetDaemonManager();
      // Should not throw
    });
  });
});
