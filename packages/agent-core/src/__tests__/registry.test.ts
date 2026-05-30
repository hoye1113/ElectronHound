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

  describe('streamInvoke', () => {
    it('yields error when tool.invoke throws', async () => {
      const registry = new ToolRegistry();
      const throwingTool = {
        name: 'throwing_tool',
        description: 'A tool that throws',
        schema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
        invoke: vi.fn().mockRejectedValue(new Error('Tool exploded')),
      };
      registry.register(throwingTool as never);

      const chunks: Array<{ type: string; error?: string }> = [];
      for await (const chunk of registry.streamInvoke('throwing_tool', {})) {
        chunks.push(chunk as { type: string; error?: string });
      }

      expect(chunks.some((c) => c.type === 'progress')).toBe(true);
      expect(chunks.some((c) => c.type === 'error' && c.error?.includes('Tool exploded'))).toBe(true);
    });

    it('yields error when tool not found', async () => {
      const registry = new ToolRegistry();

      const chunks: Array<{ type: string; error?: string }> = [];
      for await (const chunk of registry.streamInvoke('nonexistent', {})) {
        chunks.push(chunk as { type: string; error?: string });
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      expect(chunks[0].error).toContain('not found');
    });

    it('yields error when params are invalid', async () => {
      const registry = new ToolRegistry();
      const tool = {
        name: 'test_tool',
        description: 'A test tool',
        schema: { safeParse: vi.fn().mockReturnValue({ success: false, error: { message: 'bad params' } }) },
        invoke: vi.fn(),
      };
      registry.register(tool as never);

      const chunks: Array<{ type: string; error?: string }> = [];
      for await (const chunk of registry.streamInvoke('test_tool', {})) {
        chunks.push(chunk as { type: string; error?: string });
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      expect(chunks[0].error).toContain('bad params');
    });
  });
});
