/**
 * ToolRegistry Adapter
 *
 * Wraps the existing ToolRegistry to match the AgentLoop interface.
 *
 * Usage:
 *   const registry = new ToolRegistry();
 *   const adapter = createToolRegistryAdapter(registry);
 *   const result = await adapter.execute({ toolName: 'snapshot', toolArgs: {} });
 */

import type { ToolRegistry } from './types.js';
import type { ExecutionResult } from '../runtime/types.js';

/**
 * ToolRegistry adapter interface for AgentLoop.
 */
export interface ToolRegistryAdapter {
  execute(toolName: string, toolArgs: Record<string, unknown>): Promise<ExecutionResult>;
}

/**
 * Create a ToolRegistry adapter from the existing ToolRegistry.
 */
export function createToolRegistryAdapter(registry: ToolRegistry): ToolRegistryAdapter {
  return {
    async execute(toolName: string, toolArgs: Record<string, unknown>): Promise<ExecutionResult> {
      try {
        const result = await registry.invoke(toolName, toolArgs);
        return {
          success: result.success,
          result: result.data ?? null,
          error: result.error,
        };
      } catch (error: unknown) {
        return {
          success: false,
          result: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
