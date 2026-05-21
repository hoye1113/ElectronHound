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

// ─── CDP types (Playwright CDP integration, replaces MCP) ───────────────

/**
 * Configuration for a CDP connection (Playwright or Electron).
 */
export interface CDPConfig {
  /** CDP endpoint URL (e.g., ws://127.0.0.1:9222/devtools/browser/...) */
  endpoint?: string;
  /** Host for CDP server */
  host?: string;
  /** Port for CDP server */
  port?: number;
  /** Connection timeout in ms */
  timeout?: number;
  /** Type of target to connect to */
  targetType?: 'browser' | 'electron';
}

/**
 * Information about an active CDP session.
 */
export interface CDPSessionInfo {
  /** Unique session identifier */
  sessionId: string;
  /** Optional CDP target ID */
  targetId?: string;
  /** Session type */
  type: 'browser' | 'page' | 'electron-main' | 'electron-renderer';
}

/**
 * Raw CDP command result from the protocol.
 */
export interface CDPRawResult {
  /** CDP method result payload */
  result?: any;
  /** CDP error if any */
  error?: { code: number; message: string };
}

/**
 * CDP-specific tool params (shared by all CDP tools).
 */
export interface CDPToolParams {
  /** Target session ID to execute the tool on */
  sessionId?: string;
  /** Additional CDP-specific options */
  options?: Record<string, any>;
}

/**
 * CDP-specific tool result.
 */
export interface CDPToolResult {
  /** Whether the CDP command succeeded */
  success: boolean;
  /** Result data from the CDP command */
  data?: any;
  /** Error message if the command failed */
  error?: string;
  /** CDP session info */
  sessionInfo?: CDPSessionInfo;
}

/**
 * Abstraction over a CDP connection for CDP tools.
 * CDPClient manages the WebSocket connection to Playwright/Electron DevTools.
 */
export interface CDPContext {
  /** Establish a CDP connection */
  connect(config: CDPConfig): Promise<CDPSessionInfo>;
  /** Close the CDP connection */
  disconnect(): Promise<void>;
  /** Check if connected */
  isConnected(): boolean;
  /** Send a CDP command and return the result */
  sendCommand(method: string, params?: Record<string, any>, sessionId?: string): Promise<CDPRawResult>;
  /** Create a new CDP session for a specific target */
  createSession(targetId?: string, type?: CDPSessionInfo['type']): Promise<CDPSessionInfo>;
  /** Close a CDP session */
  closeSession(sessionId: string): Promise<void>;
  /** List active sessions */
  listSessions(): CDPSessionInfo[];
}

/**
 * CDP Browser tool params (for tools that interact via CDP protocol).
 */
export interface CDPBrowserSnapshotParams extends CDPToolParams {
  format?: 'aria' | 'screenshot';
}

export interface CDPBrowserClickParams extends CDPToolParams {
  selector: string;
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  timeout?: number;
}

export interface CDPBrowserTypeParams extends CDPToolParams {
  selector: string;
  text: string;
  clear?: boolean;
  delay?: number;
}

export interface CDPBrowserNavigateParams extends CDPToolParams {
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
}

export interface CDPBrowserPressKeyParams extends CDPToolParams {
  key: string;
  selector?: string;
}

export interface CDPBrowserHoverParams extends CDPToolParams {
  selector: string;
  timeout?: number;
}

export interface CDPBrowserDragParams extends CDPToolParams {
  sourceSelector: string;
  targetSelector: string;
  timeout?: number;
}

/**
 * CDP Electron tool params.
 */
export interface CDPLaunchParams extends CDPToolParams {
  appPath: string;
  args?: string[];
  env?: Record<string, string>;
  cdpPort?: number;
}

export interface CDPCloseParams extends CDPToolParams {
  force?: boolean;
  timeout?: number;
}

export interface CDPExecuteMainParams extends CDPToolParams {
  code: string;
  timeout?: number;
}

export interface CDPTriggerIpcParams extends CDPToolParams {
  channel: string;
  payload?: any;
  expectResponse?: boolean;
  timeout?: number;
}

export interface CDPMockDialogParams extends CDPToolParams {
  type: 'alert' | 'confirm' | 'prompt';
  response?: string | boolean;
  dismiss?: boolean;
}
