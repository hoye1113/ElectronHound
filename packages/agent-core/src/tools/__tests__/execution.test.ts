/**
 * Execution tools tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionContext } from '../types.js';
import { createExecutionTools, ExecuteCodeTool } from '../execution.js';

// ─── Mock context ───────────────────────────────────────────────────────

function createMockExecContext(): ExecutionContext {
  return {
    execute: vi.fn().mockResolvedValue({ output: 'result', exitCode: 0 }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('Execution tools', () => {
  let ctx: ExecutionContext;

  beforeEach(() => {
    ctx = createMockExecContext();
    vi.clearAllMocks();
  });

  describe('createExecutionTools', () => {
    it('creates 1 execution tool', () => {
      const tools = createExecutionTools(ctx);
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('execute_code');
    });
  });

  describe('execute_code', () => {
    it('executes code and returns result', async () => {
      const t = new ExecuteCodeTool(ctx);
      const result = await t.invoke({ code: 'console.log("hi")' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ output: 'result', exitCode: 0 });
      expect(result.metadata).toEqual({ runtime: 'node' });
      expect(ctx.execute).toHaveBeenCalledWith('console.log("hi")', {
        runtime: undefined,
        timeout: undefined,
        env: undefined,
      });
    });

    it('passes runtime and timeout options', async () => {
      const t = new ExecuteCodeTool(ctx);
      await t.invoke({ code: '1+1', runtime: 'browser', timeout: 3000 });

      expect(ctx.execute).toHaveBeenCalledWith('1+1', {
        runtime: 'browser',
        timeout: 3000,
        env: undefined,
      });
    });

    it('passes environment variables', async () => {
      const t = new ExecuteCodeTool(ctx);
      await t.invoke({ code: 'process.env.X', env: { X: 'test' } });

      expect(ctx.execute).toHaveBeenCalledWith('process.env.X', {
        runtime: undefined,
        timeout: undefined,
        env: { X: 'test' },
      });
    });

    it('handles execution error', async () => {
      (ctx.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Sandbox error'));
      const t = new ExecuteCodeTool(ctx);
      const result = await t.invoke({ code: 'bad code' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Sandbox error');
    });
  });
});
