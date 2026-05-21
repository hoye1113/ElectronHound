/**
 * EATA Tool System — Type Definitions
 *
 * Replaces MCP architecture with a direct Tool interface.
 * Tools are categorized into:
 * - Browser tools (7): snapshot, click, type, navigate, press_key, hover, drag
 * - Electron tools (5): launch, close, execute_main, trigger_ipc, mock_dialog
 * - Execution tools (1): execute_code
 */

import type { ZodSchema } from 'zod';

// ─── Core interfaces ────────────────────────────────────────────────────

/**
 * A single tool that can be invoked by the agent.
 */
export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly schema: ZodSchema<any>;

  invoke(params: any): Promise<ToolResult>;
}

/**
 * Result returned by a tool invocation.
 */
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * A streaming chunk from a long-running tool invocation.
 */
export type ToolStreamChunk =
  | { type: 'progress'; percent: number; message?: string }
  | { type: 'data'; payload: any }
  | { type: 'done'; result: ToolResult }
  | { type: 'error'; error: string };

/**
 * Registry that manages and dispatches tool invocations.
 */
export interface ToolRegistry {
  readonly tools: Map<string, Tool>;

  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  invoke(name: string, params: any): Promise<ToolResult>;
  streamInvoke(name: string, params: any): AsyncIterable<ToolStreamChunk>;
}

// ─── Browser tool params ────────────────────────────────────────────────

export interface SnapshotParams {
  /** Optional format: 'aria' (accessibility tree) or 'screenshot' */
  format?: 'aria' | 'screenshot';
}

export interface ClickParams {
  /** CSS selector or accessibility label */
  selector: string;
  /** Mouse button */
  button?: 'left' | 'right' | 'middle';
  /** Click count (1 = single, 2 = double) */
  clickCount?: number;
  /** Timeout in ms */
  timeout?: number;
}

export interface TypeParams {
  /** CSS selector or accessibility label of the input element */
  selector: string;
  /** Text to type */
  text: string;
  /** Clear existing content before typing */
  clear?: boolean;
  /** Delay between keystrokes in ms */
  delay?: number;
}

export interface NavigateParams {
  /** URL to navigate to */
  url: string;
  /** Wait condition */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  /** Timeout in ms */
  timeout?: number;
}

export interface PressKeyParams {
  /** Key to press (e.g. 'Enter', 'Tab', 'Escape', 'Control+A') */
  key: string;
  /** CSS selector for element to focus before pressing (optional) */
  selector?: string;
}

export interface HoverParams {
  /** CSS selector or accessibility label */
  selector: string;
  /** Timeout in ms */
  timeout?: number;
}

export interface DragParams {
  /** CSS selector of the source element */
  sourceSelector: string;
  /** CSS selector of the target element */
  targetSelector: string;
  /** Timeout in ms */
  timeout?: number;
}

// ─── Electron tool params ───────────────────────────────────────────────

export interface LaunchParams {
  /** Path to the Electron app executable or entry script */
  appPath: string;
  /** Additional command-line arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Enable remote debugging */
  enableCdp?: boolean;
  /** CDP port */
  cdpPort?: number;
}

export interface CloseParams {
  /** Force-kill the process */
  force?: boolean;
  /** Timeout before force-kill in ms */
  timeout?: number;
}

export interface ExecuteMainParams {
  /** JavaScript code to execute in the main process */
  code: string;
  /** Timeout in ms */
  timeout?: number;
}

export interface TriggerIpcParams {
  /** IPC channel name */
  channel: string;
  /** Payload to send */
  payload?: any;
  /** Whether to wait for a response */
  expectResponse?: boolean;
  /** Timeout in ms */
  timeout?: number;
}

export interface MockDialogParams {
  /** Dialog type */
  type: 'alert' | 'confirm' | 'prompt';
  /** The response to auto-accept with */
  response?: string | boolean;
  /** Whether to dismiss instead of accept */
  dismiss?: boolean;
}

// ─── Execution tool params ──────────────────────────────────────────────

export interface ExecuteCodeParams {
  /** Code to execute */
  code: string;
  /** Runtime: 'node' for Node.js, 'browser' for browser context */
  runtime?: 'node' | 'browser';
  /** Timeout in ms */
  timeout?: number;
  /** Environment variables */
  env?: Record<string, string>;
}

// ─── Context interfaces (dependency injection for tools) ────────────────

/**
 * Abstraction over a browser page for browser tools.
 * Implementations wrap Playwright CDP connections.
 */
export interface BrowserContext {
  snapshot(format?: 'aria' | 'screenshot'): Promise<any>;
  click(selector: string, options?: { button?: string; clickCount?: number; timeout?: number }): Promise<void>;
  type(selector: string, text: string, options?: { clear?: boolean; delay?: number }): Promise<void>;
  navigate(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void>;
  pressKey(key: string, selector?: string): Promise<void>;
  hover(selector: string, options?: { timeout?: number }): Promise<void>;
  drag(sourceSelector: string, targetSelector: string, options?: { timeout?: number }): Promise<void>;
}

/**
 * Abstraction over an Electron app process for electron tools.
 * Implementations wrap Electron CDP connections.
 */
export interface ElectronContext {
  launch(options: LaunchParams): Promise<any>;
  close(options?: CloseParams): Promise<void>;
  executeMain(code: string, timeout?: number): Promise<any>;
  triggerIpc(channel: string, payload?: any, options?: { expectResponse?: boolean; timeout?: number }): Promise<any>;
  mockDialog(type: string, options?: { response?: string | boolean; dismiss?: boolean }): Promise<void>;
}

/**
 * Abstraction over a code execution sandbox.
 */
export interface ExecutionContext {
  execute(code: string, options?: { runtime?: string; timeout?: number; env?: Record<string, string> }): Promise<any>;
}
