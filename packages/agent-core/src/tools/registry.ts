/**
 * EATA Tool Registry
 *
 * Default implementation of the ToolRegistry interface.
 * Manages tool registration, lookup, invocation, and streaming.
 */

import type {
  Tool,
  ToolResult,
  ToolParams,
  ToolRegistry as ToolRegistryType,
  ToolStreamChunk,
  CDPContext,
} from './types.js';
import { createCDPTools } from './cdp.js';

/**
 * Default ToolRegistry implementation.
 *
 * Features:
 * - Register/unregister tools by name
 * - Lookup tools by name
 * - Synchronous invoke with parameter validation
 * - Streaming invoke for long-running tools
 * - Duplicate registration detection
 */
export class ToolRegistry implements ToolRegistryType {
  readonly tools: Map<string, Tool> = new Map();

  /**
   * Register a tool in the registry.
   * Throws if a tool with the same name is already registered.
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool by name.
   * Returns true if the tool was found and removed.
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get a tool by name.
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List all registered tool names.
   */
  list(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Invoke a tool by name with parameter validation.
   *
   * 1. Looks up the tool
   * 2. Validates params against the tool's Zod schema
   * 3. Invokes the tool with validated params
   * 4. Catches and wraps errors into ToolResult
   */
  async invoke(name: string, params: ToolParams): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool "${name}" not found in registry`,
      };
    }

    // Validate params against schema
    const parseResult = tool.schema.safeParse(params);
    if (!parseResult.success) {
      return {
        success: false,
        error: `Invalid params for tool "${name}": ${parseResult.error.message}`,
      };
    }

    // Invoke with validated params
    try {
      const result = await tool.invoke(parseResult.data as ToolParams);
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Tool "${name}" threw: ${message}`,
      };
    }
  }

  /**
   * Stream-invoke a tool, yielding progress chunks.
   *
   * For tools that don't natively stream, wraps the single invoke
   * call into a single 'done' chunk. For tools with streaming support,
   * delegates to the tool's own streaming if available.
   */
  async *streamInvoke(name: string, params: ToolParams): AsyncIterable<ToolStreamChunk> {
    const tool = this.tools.get(name);
    if (!tool) {
      yield {
        type: 'error',
        error: `Tool "${name}" not found in registry`,
      };
      return;
    }

    // Validate params
    const parseResult = tool.schema.safeParse(params);
    if (!parseResult.success) {
      yield {
        type: 'error',
        error: `Invalid params for tool "${name}": ${parseResult.error.message}`,
      };
      return;
    }

    // Check if the tool supports native streaming
    const streamableTool = tool as Tool & {
      stream?: (params: ToolParams) => AsyncIterable<ToolStreamChunk>;
    };

    if (streamableTool.stream && typeof streamableTool.stream === 'function') {
      // Native streaming: delegate to the tool
      yield* streamableTool.stream(parseResult.data as ToolParams);
      return;
    }

    // Non-streaming fallback: wrap invoke into chunks
    yield { type: 'progress', percent: 0, message: `Invoking ${name}...` };

    try {
      const result = await tool.invoke(parseResult.data as ToolParams);
      yield { type: 'done', result };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      yield {
        type: 'error',
        error: `Tool "${name}" threw: ${message}`,
      };
    }
  }

  /**
   * Register all provided tools at once.
   */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Clear all registered tools.
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * Register all CDP tools (12 tools: 7 browser + 5 electron).
   * Creates a CDPClient-backed tool set.
   */
  registerCDPTools(client: CDPContext): void {
    this.registerAll(createCDPTools(client));
  }

  /**
   * Create a ToolRegistry pre-populated with CDP tools.
   */
  static withCDP(client: CDPContext): ToolRegistry {
    const registry = new ToolRegistry();
    registry.registerCDPTools(client);
    return registry;
  }
}
