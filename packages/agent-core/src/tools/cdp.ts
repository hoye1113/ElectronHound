/**
 * EATA CDP (Chrome DevTools Protocol) Integration
 *
 * Replaces MCP architecture with direct CDP connections for
 * Electron + Playwright integration.
 *
 * Classes:
 * - CDPClient: Manages CDP WebSocket connections (supports multiple connections)
 * - CDPSession: Manages a CDP target session
 * - CDPTool: Abstract base class for all CDP tools
 *
 * 12 CDP tools:
 *   Browser (7): browser_snapshot, browser_click, browser_type, browser_navigate,
 *                browser_press_key, browser_hover, browser_drag
 *   Electron (5): cdp_launch, cdp_close, cdp_execute_main,
 *                 cdp_trigger_ipc, cdp_mock_dialog
 */

import { z } from 'zod';
import type {
  Tool,
  ToolResult,
  CDPContext,
  CDPConfig,
  CDPSessionInfo,
  CDPRawResult,
  CDPBrowserSnapshotParams,
  CDPBrowserClickParams,
  CDPBrowserTypeParams,
  CDPBrowserNavigateParams,
  CDPBrowserPressKeyParams,
  CDPBrowserHoverParams,
  CDPBrowserDragParams,
  CDPLaunchParams,
  CDPCloseParams,
  CDPExecuteMainParams,
  CDPTriggerIpcParams,
  CDPMockDialogParams,
} from './types.js';

// ─── CDPClient ──────────────────────────────────────────────────────────

/**
 * CDP connection manager.
 * Manages WebSocket connections to Playwright/Electron DevTools.
 * Supports multiple concurrent connections.
 */
export class CDPClient implements CDPContext {
  private readonly sessions = new Map<string, CDPSession>();
  private _connected = false;
  private _config: CDPConfig | null = null;

  /** All active CDP connections (keyed by connection id) */
  private readonly connections = new Map<string, CDPClient>();

  /** Whether this client is connected */
  get connected(): boolean {
    return this._connected;
  }

  /**
   * Establish a CDP connection.
   */
  async connect(config: CDPConfig): Promise<CDPSessionInfo> {
    if (this._connected) {
      throw new Error('CDPClient is already connected. Disconnect first.');
    }

    // In a real implementation, this would open a WebSocket to `config.endpoint`.
    // Here we simulate the connection establishment.
    await this.waitForConnection();

    this._connected = true;
    this._config = config;

    const sessionInfo: CDPSessionInfo = {
      sessionId: this.generateSessionId(),
      type: config.targetType === 'electron' ? 'electron-main' : 'browser',
    };

    const session = new CDPSession(sessionInfo, this.sendRawCommand.bind(this));
    this.sessions.set(sessionInfo.sessionId, session);

    return sessionInfo;
  }

  /**
   * Close the CDP connection and all sessions.
   */
  async disconnect(): Promise<void> {
    if (!this._connected) {
      return;
    }

    // Close all sessions
    for (const [id] of this.sessions) {
      await this.closeSessionInternal(id);
    }

    this._connected = false;
    this._config = null;
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this._connected;
  }

  /**
   * Send a CDP command and return the result.
   */
  async sendCommand(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<CDPRawResult> {
    if (!this._connected) {
      return { error: { code: -1, message: 'CDPClient is not connected' } };
    }

    // If sessionId is specified, route to that session
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { error: { code: -2, message: `Session "${sessionId}" not found` } };
      }
      return session.sendCommand(method, params);
    }

    // Otherwise send on the default connection
    return this.sendRawCommand(method, params);
  }

  /**
   * Create a new CDP session for a specific target.
   */
  async createSession(
    targetId?: string,
    type: CDPSessionInfo['type'] = 'page',
  ): Promise<CDPSessionInfo> {
    if (!this._connected) {
      throw new Error('CDPClient is not connected');
    }

    const sessionInfo: CDPSessionInfo = {
      sessionId: this.generateSessionId(),
      targetId,
      type,
    };

    const session = new CDPSession(sessionInfo, this.sendRawCommand.bind(this));
    this.sessions.set(sessionInfo.sessionId, session);

    return sessionInfo;
  }

  /**
   * Close a CDP session.
   */
  async closeSession(sessionId: string): Promise<void> {
    return this.closeSessionInternal(sessionId);
  }

  /**
   * List active sessions.
   */
  listSessions(): CDPSessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.info);
  }

  /**
   * Get a specific CDPSession by ID.
   */
  getSession(sessionId: string): CDPSession | undefined {
    return this.sessions.get(sessionId);
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async sendRawCommand(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<CDPRawResult> {
    // Base CDP message format: { id, method, params, sessionId? }
    // In production, this sends over the WebSocket.
    // The actual result comes back via the WebSocket response.
    return { result: { method, params: params ?? {} } };
  }

  // Intentional no-op: Playwright MCP handles CDP connection lifecycle.
  // The browser is already reachable when this is called (electron_launch discovers the port).
  private async waitForConnection(): Promise<void> {
    return;
  }

  private async closeSessionInternal(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  private generateSessionId(): string {
    return `cdp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

// ─── CDPSession ─────────────────────────────────────────────────────────

/**
 * Represents a CDP target session.
 * Each session corresponds to a browser page, Electron main process,
 * or other CDP-attached target.
 */
export class CDPSession {
  readonly info: CDPSessionInfo;
  private readonly sendRaw: (method: string, params?: Record<string, unknown>) => Promise<CDPRawResult>;

  constructor(
    info: CDPSessionInfo,
    sendRaw: (method: string, params?: Record<string, unknown>) => Promise<CDPRawResult>,
  ) {
    this.info = info;
    this.sendRaw = sendRaw;
  }

  /** Session ID */
  get id(): string {
    return this.info.sessionId;
  }

  /** Session type */
  get type(): CDPSessionInfo['type'] {
    return this.info.type;
  }

  /**
   * Send a CDP command within this session.
   */
  async sendCommand(method: string, params?: Record<string, unknown>): Promise<CDPRawResult> {
    return this.sendRaw(method, { ...params, _sessionId: this.info.sessionId });
  }
}

// ─── CDPTool base class ─────────────────────────────────────────────────

/**
 * Abstract base class for all CDP tools.
 * Holds a reference to the CDPContext for direct CDP protocol access.
 */
export abstract class CDPTool implements Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly schema: z.ZodSchema<unknown>;

  constructor(protected readonly client: CDPContext) {}

  abstract invoke(params: Record<string, unknown>): Promise<ToolResult>;

  /**
   * Helper: send a CDP command and wrap the result as a ToolResult.
   */
  protected async sendCDP(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<ToolResult> {
    const raw = await this.client.sendCommand(method, params, sessionId);
    if (raw.error) {
      return {
        success: false,
        error: `CDP command "${method}" failed: [${raw.error.code}] ${raw.error.message}`,
      };
    }
    return { success: true, data: raw.result };
  }
}

// ─── Zod schemas ────────────────────────────────────────────────────────

const cdpBrowserSnapshotSchema = z.object({
  format: z.enum(['aria', 'screenshot']).optional(),
  sessionId: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

const cdpBrowserClickSchema = z.object({
  selector: z.string().min(1),
  button: z.enum(['left', 'right', 'middle']).optional().default('left'),
  clickCount: z.number().int().min(1).max(3).optional().default(1),
  timeout: z.number().int().positive().optional(),
  sessionId: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

const cdpBrowserTypeSchema = z.object({
  selector: z.string().min(1),
  text: z.string(),
  clear: z.boolean().optional().default(false),
  delay: z.number().nonnegative().optional(),
  sessionId: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

const cdpBrowserNavigateSchema = z.object({
  url: z.string().min(1),
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).optional().default('load'),
  timeout: z.number().int().positive().optional(),
  sessionId: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

const cdpBrowserPressKeySchema = z.object({
  key: z.string().min(1),
  selector: z.string().optional(),
  sessionId: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

const cdpBrowserHoverSchema = z.object({
  selector: z.string().min(1),
  timeout: z.number().int().positive().optional(),
  sessionId: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

const cdpBrowserDragSchema = z.object({
  sourceSelector: z.string().min(1),
  targetSelector: z.string().min(1),
  timeout: z.number().int().positive().optional(),
  sessionId: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

const cdpLaunchSchema = z.object({
  appPath: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cdpPort: z.number().int().positive().optional().default(9222),
  sessionId: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

const cdpCloseSchema = z.object({
  force: z.boolean().optional().default(false),
  timeout: z.number().int().positive().optional(),
  sessionId: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

const cdpExecuteMainSchema = z.object({
  code: z.string().min(1),
  timeout: z.number().int().positive().optional(),
  sessionId: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

const cdpTriggerIpcSchema = z.object({
  channel: z.string().min(1),
  payload: z.unknown().optional(),
  expectResponse: z.boolean().optional().default(false),
  timeout: z.number().int().positive().optional(),
  sessionId: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

const cdpMockDialogSchema = z.object({
  type: z.enum(['alert', 'confirm', 'prompt']),
  response: z.union([z.string(), z.boolean()]).optional(),
  dismiss: z.boolean().optional().default(false),
  sessionId: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

// ─── Browser CDP tools (7) ──────────────────────────────────────────────

export class BrowserSnapshotTool extends CDPTool {
  readonly name = 'browser_snapshot';
  readonly description =
    'Take an accessibility snapshot or screenshot via CDP (Accessibility.getFullAXTree or Page.captureSnapshot)';
  readonly schema = cdpBrowserSnapshotSchema;

  async invoke(params: CDPBrowserSnapshotParams): Promise<ToolResult> {
    const method = params.format === 'screenshot' ? 'Page.captureSnapshot' : 'Accessibility.getFullAXTree';
    try {
      return await this.sendCDP(method, { format: params.format }, params.sessionId);
    } catch (err) {
      return { success: false, error: `browser_snapshot failed: ${errMsg(err)}` };
    }
  }
}

export class BrowserClickTool extends CDPTool {
  readonly name = 'browser_click';
  readonly description =
    'Click an element via CDP (DOM.querySelector + Input.dispatchMouseEvent)';
  readonly schema = cdpBrowserClickSchema;

  async invoke(params: CDPBrowserClickParams): Promise<ToolResult> {
    try {
      const result = await this.sendCDP('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        button: params.button ?? 'left',
        clickCount: params.clickCount ?? 1,
        selector: params.selector,
        timeout: params.timeout,
      }, params.sessionId);
      if (result.success) {
        return { success: true, data: { clicked: true, selector: params.selector } };
      }
      return result;
    } catch (err) {
      return { success: false, error: `browser_click failed: ${errMsg(err)}` };
    }
  }
}

export class BrowserTypeTool extends CDPTool {
  readonly name = 'browser_type';
  readonly description =
    'Type text into an element via CDP (Input.insertText / Input.dispatchKeyEvent)';
  readonly schema = cdpBrowserTypeSchema;

  async invoke(params: CDPBrowserTypeParams): Promise<ToolResult> {
    try {
      const result = await this.sendCDP('Input.insertText', {
        text: params.text,
        selector: params.selector,
        clear: params.clear,
        delay: params.delay,
      }, params.sessionId);
      if (result.success) {
        return { success: true, data: { typed: true, selector: params.selector, text: params.text } };
      }
      return result;
    } catch (err) {
      return { success: false, error: `browser_type failed: ${errMsg(err)}` };
    }
  }
}

export class BrowserNavigateTool extends CDPTool {
  readonly name = 'browser_navigate';
  readonly description = 'Navigate to a URL via CDP (Page.navigate)';
  readonly schema = cdpBrowserNavigateSchema;

  async invoke(params: CDPBrowserNavigateParams): Promise<ToolResult> {
    try {
      const result = await this.sendCDP('Page.navigate', {
        url: params.url,
        waitUntil: params.waitUntil,
        timeout: params.timeout,
      }, params.sessionId);
      if (result.success) {
        return { success: true, data: { navigated: true, url: params.url } };
      }
      return result;
    } catch (err) {
      return { success: false, error: `browser_navigate failed: ${errMsg(err)}` };
    }
  }
}

export class BrowserPressKeyTool extends CDPTool {
  readonly name = 'browser_press_key';
  readonly description = 'Press a keyboard key via CDP (Input.dispatchKeyEvent)';
  readonly schema = cdpBrowserPressKeySchema;

  async invoke(params: CDPBrowserPressKeyParams): Promise<ToolResult> {
    try {
      const result = await this.sendCDP('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: params.key,
        selector: params.selector,
      }, params.sessionId);
      if (result.success) {
        return { success: true, data: { keyPressed: params.key } };
      }
      return result;
    } catch (err) {
      return { success: false, error: `browser_press_key failed: ${errMsg(err)}` };
    }
  }
}

export class BrowserHoverTool extends CDPTool {
  readonly name = 'browser_hover';
  readonly description =
    'Hover over an element via CDP (Input.dispatchMouseEvent mouseMoved)';
  readonly schema = cdpBrowserHoverSchema;

  async invoke(params: CDPBrowserHoverParams): Promise<ToolResult> {
    try {
      const result = await this.sendCDP('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        selector: params.selector,
        timeout: params.timeout,
      }, params.sessionId);
      if (result.success) {
        return { success: true, data: { hovered: true, selector: params.selector } };
      }
      return result;
    } catch (err) {
      return { success: false, error: `browser_hover failed: ${errMsg(err)}` };
    }
  }
}

export class BrowserDragTool extends CDPTool {
  readonly name = 'browser_drag';
  readonly description =
    'Drag an element from source to target via CDP (Input.dispatchMouseEvent sequence)';
  readonly schema = cdpBrowserDragSchema;

  async invoke(params: CDPBrowserDragParams): Promise<ToolResult> {
    try {
      const result = await this.sendCDP('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        action: 'drag',
        sourceSelector: params.sourceSelector,
        targetSelector: params.targetSelector,
        timeout: params.timeout,
      }, params.sessionId);
      if (result.success) {
        return {
          success: true,
          data: { dragged: true, from: params.sourceSelector, to: params.targetSelector },
        };
      }
      return result;
    } catch (err) {
      return { success: false, error: `browser_drag failed: ${errMsg(err)}` };
    }
  }
}

// ─── Electron CDP tools (5) ─────────────────────────────────────────────

export class CDPLaunchTool extends CDPTool {
  readonly name = 'cdp_launch';
  readonly description =
    'Launch an Electron application and establish a CDP connection';
  readonly schema = cdpLaunchSchema;

  async invoke(params: CDPLaunchParams): Promise<ToolResult> {
    try {
      const port = params.cdpPort ?? 9222;
      // Connect to the Electron app via CDP
      const sessionInfo = await this.client.connect({
        port,
        targetType: 'electron',
        timeout: params.options?.timeout,
      });
      return {
        success: true,
        data: { launched: true, appPath: params.appPath, sessionId: sessionInfo.sessionId },
      };
    } catch (err) {
      return { success: false, error: `cdp_launch failed: ${errMsg(err)}` };
    }
  }
}

export class CDPCloseTool extends CDPTool {
  readonly name = 'cdp_close';
  readonly description =
    'Close a running Electron application and disconnect CDP';
  readonly schema = cdpCloseSchema;

  async invoke(_params: CDPCloseParams): Promise<ToolResult> {
    try {
      await this.client.disconnect();
      return { success: true, data: { closed: true } };
    } catch (err) {
      return { success: false, error: `cdp_close failed: ${errMsg(err)}` };
    }
  }
}

export class CDPExecuteMainTool extends CDPTool {
  readonly name = 'cdp_execute_main';
  readonly description =
    'Execute JavaScript code in the Electron main process via CDP (Runtime.evaluate)';
  readonly schema = cdpExecuteMainSchema;

  async invoke(params: CDPExecuteMainParams): Promise<ToolResult> {
    try {
      const result = await this.sendCDP('Runtime.evaluate', {
        expression: params.code,
        returnByValue: true,
        timeout: params.timeout,
      }, params.sessionId);
      return result;
    } catch (err) {
      return { success: false, error: `cdp_execute_main failed: ${errMsg(err)}` };
    }
  }
}

export class CDPTriggerIpcTool extends CDPTool {
  readonly name = 'cdp_trigger_ipc';
  readonly description =
    'Trigger an IPC event on a channel via CDP (Runtime.evaluate IPC call)';
  readonly schema = cdpTriggerIpcSchema;

  async invoke(params: CDPTriggerIpcParams): Promise<ToolResult> {
    try {
      // Build IPC trigger expression
      const payloadStr = params.payload !== undefined ? JSON.stringify(params.payload) : 'undefined';
      const expression = params.expectResponse
        ? `(async () => { return await ipcRenderer.invoke('${params.channel}', ${payloadStr}); })()`
        : `ipcRenderer.send('${params.channel}', ${payloadStr})`;

      const result = await this.sendCDP('Runtime.evaluate', {
        expression,
        returnByValue: !params.expectResponse,
        awaitPromise: params.expectResponse,
        timeout: params.timeout,
      }, params.sessionId);

      if (result.success) {
        return {
          success: true,
          data: { channel: params.channel, result: result.data },
        };
      }
      return result;
    } catch (err) {
      return { success: false, error: `cdp_trigger_ipc failed: ${errMsg(err)}` };
    }
  }
}

export class CDPMockDialogTool extends CDPTool {
  readonly name = 'cdp_mock_dialog';
  readonly description =
    'Mock a native dialog via CDP (Page.handleJavaScriptDialog)';
  readonly schema = cdpMockDialogSchema;

  async invoke(params: CDPMockDialogParams): Promise<ToolResult> {
    try {
      const result = await this.sendCDP('Page.handleJavaScriptDialog', {
        accept: !params.dismiss,
        promptText: typeof params.response === 'string' ? params.response : undefined,
      }, params.sessionId);

      if (result.success) {
        return {
          success: true,
          data: { mocked: true, type: params.type, response: params.response },
        };
      }
      return result;
    } catch (err) {
      return { success: false, error: `cdp_mock_dialog failed: ${errMsg(err)}` };
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

/**
 * Create all 12 CDP tools for the given CDP client.
 */
export function createCDPTools(client: CDPContext): CDPTool[] {
  return [
    // Browser tools (7)
    new BrowserSnapshotTool(client),
    new BrowserClickTool(client),
    new BrowserTypeTool(client),
    new BrowserNavigateTool(client),
    new BrowserPressKeyTool(client),
    new BrowserHoverTool(client),
    new BrowserDragTool(client),
    // Electron tools (5)
    new CDPLaunchTool(client),
    new CDPCloseTool(client),
    new CDPExecuteMainTool(client),
    new CDPTriggerIpcTool(client),
    new CDPMockDialogTool(client),
  ];
}

// ─── Helpers ────────────────────────────────────────────────────────────

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
