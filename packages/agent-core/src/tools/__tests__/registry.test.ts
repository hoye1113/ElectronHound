/**
 * ToolRegistry tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../registry.js';
import type { Tool, ToolResult, ToolStreamChunk } from '../types.js';

// ─── Helpers ────────────────────────────────────────────────────────────

function createMockTool(overrides: Partial<Tool> = {}): Tool {
  return {
    name: 'test_tool',
    description: 'A test tool',
    schema: z.object({ value: z.string() }),
    invoke: vi.fn().mockResolvedValue({ success: true, data: 'ok' }),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  // ── register ──────────────────────────────────────────────────────────

  describe('register', () => {
    it('registers a tool by name', () => {
      const tool = createMockTool();
      registry.register(tool);

      expect(registry.has('test_tool')).toBe(true);
      expect(registry.get('test_tool')).toBe(tool);
    });

    it('throws on duplicate registration', () => {
      const tool = createMockTool();
      registry.register(tool);

      expect(() => registry.register(tool)).toThrow('already registered');
    });

    it('registers multiple tools with different names', () => {
      registry.register(createMockTool({ name: 'a' }));
      registry.register(createMockTool({ name: 'b' }));

      expect(registry.list()).toEqual(['a', 'b']);
    });
  });

  // ── get ───────────────────────────────────────────────────────────────

  describe('get', () => {
    it('returns the tool by name', () => {
      const tool = createMockTool();
      registry.register(tool);

      expect(registry.get('test_tool')).toBe(tool);
    });

    it('returns undefined for unknown tool', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  // ── invoke ────────────────────────────────────────────────────────────

  describe('invoke', () => {
    it('invokes a registered tool with valid params', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({ success: true, data: 'result' });
      const tool = createMockTool({ invoke: mockInvoke });
      registry.register(tool);

      const result = await registry.invoke('test_tool', { value: 'hello' });

      expect(result.success).toBe(true);
      expect(result.data).toBe('result');
      expect(mockInvoke).toHaveBeenCalledWith({ value: 'hello' });
    });

    it('returns error for unknown tool', async () => {
      const result = await registry.invoke('unknown', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error for invalid params', async () => {
      const tool = createMockTool();
      registry.register(tool);

      const result = await registry.invoke('test_tool', { value: 123 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid params');
    });

    it('catches and wraps tool errors', async () => {
      const tool = createMockTool({
        invoke: vi.fn().mockRejectedValue(new Error('boom')),
      });
      registry.register(tool);

      const result = await registry.invoke('test_tool', { value: 'ok' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('boom');
    });
  });

  // ── streamInvoke ──────────────────────────────────────────────────────

  describe('streamInvoke', () => {
    it('yields error for unknown tool', async () => {
      const chunks: ToolStreamChunk[] = [];
      for await (const chunk of registry.streamInvoke('unknown', {})) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
    });

    it('yields error for invalid params', async () => {
      registry.register(createMockTool());

      const chunks: ToolStreamChunk[] = [];
      for await (const chunk of registry.streamInvoke('test_tool', { value: 123 })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
    });

    it('wraps non-streaming tool into progress + done chunks', async () => {
      const tool = createMockTool({
        invoke: vi.fn().mockResolvedValue({ success: true, data: 'streamed' }),
      });
      registry.register(tool);

      const chunks: ToolStreamChunk[] = [];
      for await (const chunk of registry.streamInvoke('test_tool', { value: 'ok' })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].type).toBe('progress');
      expect(chunks[1].type).toBe('done');
      if (chunks[1].type === 'done') {
        expect(chunks[1].result.success).toBe(true);
      }
    });

    it('delegates to native stream when available', async () => {
      async function* nativeStream(): AsyncIterable<ToolStreamChunk> {
        yield { type: 'data', payload: 'chunk1' };
        yield { type: 'done', result: { success: true, data: 'final' } };
      }

      const tool = {
        name: 'streaming_tool',
        description: 'Streams',
        schema: z.object({ value: z.string() }),
        invoke: vi.fn(),
        stream: nativeStream,
      } as any as Tool & { stream: () => AsyncIterable<ToolStreamChunk> };

      registry.register(tool);

      const chunks: ToolStreamChunk[] = [];
      for await (const chunk of registry.streamInvoke('streaming_tool', { value: 'ok' })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].type).toBe('data');
      expect(chunks[1].type).toBe('done');
    });
  });

  // ── registerAll / clear / unregister ──────────────────────────────────

  describe('batch operations', () => {
    it('registerAll adds multiple tools', () => {
      registry.registerAll([
        createMockTool({ name: 'x' }),
        createMockTool({ name: 'y' }),
      ]);

      expect(registry.list()).toEqual(['x', 'y']);
    });

    it('clear removes all tools', () => {
      registry.registerAll([
        createMockTool({ name: 'a' }),
        createMockTool({ name: 'b' }),
      ]);
      registry.clear();

      expect(registry.list()).toEqual([]);
    });

    it('unregister removes a specific tool', () => {
      registry.register(createMockTool({ name: 'removable' }));
      expect(registry.unregister('removable')).toBe(true);
      expect(registry.has('removable')).toBe(false);
    });

    it('unregister returns false for unknown tool', () => {
      expect(registry.unregister('nope')).toBe(false);
    });
  });
});
