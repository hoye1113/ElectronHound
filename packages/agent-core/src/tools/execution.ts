/**
 * EATA Execution Tools
 *
 * 1 execution tool: execute_code
 * Supports executing arbitrary code in Node.js or browser context.
 */

import { z } from 'zod';
import type {
  Tool,
  ToolResult,
  ExecutionContext,
  ExecuteCodeParams,
} from './types.js';

// ─── Zod schema ─────────────────────────────────────────────────────────

const executeCodeSchema = z.object({
  code: z.string().min(1),
  runtime: z.enum(['node', 'browser']).optional().default('node'),
  timeout: z.number().int().positive().optional(),
  env: z.record(z.string(), z.string()).optional(),
});

// ─── Tool ───────────────────────────────────────────────────────────────

/**
 * Execute code in a sandboxed runtime (Node.js or browser).
 */
export class ExecuteCodeTool implements Tool {
  readonly name = 'execute_code';
  readonly description =
    'Execute arbitrary code in a Node.js or browser sandbox';
  readonly schema = executeCodeSchema;

  constructor(private readonly context: ExecutionContext) {}

  async invoke(params: ExecuteCodeParams): Promise<ToolResult> {
    try {
      const data = await this.context.execute(params.code, {
        runtime: params.runtime,
        timeout: params.timeout,
        env: params.env,
      });
      return {
        success: true,
        data,
        metadata: { runtime: params.runtime ?? 'node' },
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: `ExecuteCode failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

/**
 * Create the execute_code tool for the given execution context.
 */
export function createExecutionTools(context: ExecutionContext): ExecuteCodeTool[] {
  return [new ExecuteCodeTool(context)];
}
