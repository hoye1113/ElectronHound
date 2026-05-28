/**
 * ToolRegistryAdapter tests
 */

import { describe, it, expect, vi } from 'vitest';
import { createToolRegistryAdapter } from '../adapter.js';
import type { ToolRegistry, ToolResult } from '../types.js';

// ─── Helpers ────────────────────────────────────────────────────────────

function createMockRegistry(invokeMock?: ReturnType<typeof vi.fn>): ToolRegistry {
  return {
    tools: new Map(),
    register: vi.fn(),
    get: vi.fn(),
    invoke: invokeMock ?? vi.fn(),
    streamInvoke: vi.fn(),
  } as unknown as ToolRegistry;
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('createToolRegistryAdapter', () => {
  describe('execute', () => {
    it('returns success with data when registry.invoke succeeds', async () => {
      const result: ToolResult = { success: true, data: 'result-data' };
      const invoke = vi.fn().mockResolvedValue(result);
      const registry = createMockRegistry(invoke);
      const adapter = createToolRegistryAdapter(registry);

      const output = await adapter.execute('my_tool', { key: 'value' });

      expect(invoke).toHaveBeenCalledWith('my_tool', { key: 'value' });
      expect(output).toEqual({
        success: true,
        result: 'result-data',
        error: undefined,
      });
    });

    it('returns success with null result when data is undefined', async () => {
      const result: ToolResult = { success: true };
      const invoke = vi.fn().mockResolvedValue(result);
      const registry = createMockRegistry(invoke);
      const adapter = createToolRegistryAdapter(registry);

      const output = await adapter.execute('tool_no_data', {});

      expect(output).toEqual({
        success: true,
        result: null,
        error: undefined,
      });
    });

    it('returns failure with error message when registry.invoke returns success: false', async () => {
      const result: ToolResult = { success: false, error: 'tool error message' };
      const invoke = vi.fn().mockResolvedValue(result);
      const registry = createMockRegistry(invoke);
      const adapter = createToolRegistryAdapter(registry);

      const output = await adapter.execute('failing_tool', { bad: true });

      expect(invoke).toHaveBeenCalledWith('failing_tool', { bad: true });
      expect(output).toEqual({
        success: false,
        result: null,
        error: 'tool error message',
      });
    });

    it('returns failure when registry.invoke rejects with an Error', async () => {
      const invoke = vi.fn().mockRejectedValue(new Error('unexpected failure'));
      const registry = createMockRegistry(invoke);
      const adapter = createToolRegistryAdapter(registry);

      const output = await adapter.execute('throwing_tool', {});

      expect(output).toEqual({
        success: false,
        result: null,
        error: 'unexpected failure',
      });
    });

    it('returns failure when registry.invoke rejects with a non-Error value', async () => {
      const invoke = vi.fn().mockRejectedValue('string rejection');
      const registry = createMockRegistry(invoke);
      const adapter = createToolRegistryAdapter(registry);

      const output = await adapter.execute('string_throw_tool', {});

      expect(output).toEqual({
        success: false,
        result: null,
        error: 'string rejection',
      });
    });
  });
});
