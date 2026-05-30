import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../tools/registry.js';
import type { CDPContext } from '../tools/types.js';

function createMockCDPContext(): CDPContext {
  return {
    connect: vi.fn().mockResolvedValue({ sessionId: 'test', type: 'page' }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    sendCommand: vi.fn().mockResolvedValue({ success: true, data: {} }),
    createSession: vi.fn().mockResolvedValue({ sessionId: 'test', type: 'page' }),
    closeSession: vi.fn().mockResolvedValue(undefined),
    listSessions: vi.fn().mockReturnValue([]),
  };
}

describe('ToolRegistry', () => {
  describe('registerCDPTools', () => {
    it('should register all CDP tools', () => {
      const registry = new ToolRegistry();
      const client = createMockCDPContext();

      registry.registerCDPTools(client);

      const toolNames = registry.list();
      expect(toolNames.length).toBeGreaterThan(0);
      // Should have browser and electron tools
      expect(toolNames.some((n) => n.startsWith('cdp_'))).toBe(true);
    });

    it('should register tools that can be invoked', async () => {
      const registry = new ToolRegistry();
      const client = createMockCDPContext();

      registry.registerCDPTools(client);

      // Should be able to get a tool
      const toolNames = registry.list();
      expect(toolNames.length).toBeGreaterThan(0);
      const firstTool = registry.get(toolNames[0]);
      expect(firstTool).toBeDefined();
    });
  });

  describe('withCDP', () => {
    it('should create a registry with CDP tools', () => {
      const client = createMockCDPContext();
      const registry = ToolRegistry.withCDP(client);

      expect(registry).toBeInstanceOf(ToolRegistry);
      expect(registry.list().length).toBeGreaterThan(0);
    });

    it('should create independent registries', () => {
      const client = createMockCDPContext();
      const registry1 = ToolRegistry.withCDP(client);
      const registry2 = ToolRegistry.withCDP(client);

      expect(registry1).not.toBe(registry2);
    });
  });
});
