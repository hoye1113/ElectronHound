export interface Operation {
  type:
    | 'execute_main'
    | 'send_ipc'
    | 'mock_dialog'
    | 'get_menu_items'
    | 'health_check'
    | 'take_screenshot'
    | 'get_console_logs'
    | 'evaluate_in_page'
    | 'get_network_requests'
    | 'set_window_bounds';
  payload?: Record<string, unknown>;
}

export interface OperationResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Flat representation of a menu item for serialization. */
export interface MenuItemInfo {
  label: string;
  accelerator?: string;
  enabled: boolean;
  visible: boolean;
  type: string;
}

/** Stored mock dialog configuration. */
interface DialogMockConfig {
  dialogType: 'open' | 'save' | 'message';
  response: unknown;
}

/** Minimal interface for a CDP (Chrome DevTools Protocol) session. */
export interface CDPSession {
  send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  on(event: string, callback: (...args: unknown[]) => void): void;
}

/**
 * Handles operations dispatched from the electron-bridge-mcp server.
 * All operations use real Electron APIs when available.
 */
export class OperationHandler {
  private electron: typeof import('electron') | null = null;
  private dialogMocks: Map<string, DialogMockConfig> = new Map();
  private cdpSession: CDPSession | null = null;

  /**
   * Set the CDP session for CDP-based operations (screenshot, console logs, etc.).
   */
  setCdpSession(session: CDPSession): void {
    this.cdpSession = session;
  }

  /**
   * Lazily load the Electron module.
   * Returns null when not running inside Electron.
   */
  private getElectron(): typeof import('electron') | null {
    if (this.electron !== undefined && this.electron !== null) {
      return this.electron;
    }
    try {
      // Dynamic require avoids bundler issues in non-Electron contexts
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = eval('require')('electron');
      // In non-Electron Node processes, require('electron') returns the
      // binary path string rather than the API module.  Guard against that.
      if (typeof mod !== 'object' || mod === null || typeof mod.BrowserWindow !== 'function') {
        this.electron = null;
        return null;
      }
      this.electron = mod as typeof import('electron');
      return this.electron;
    } catch (err: unknown) {
      process.stderr.write(`[electron-helper] getElectron: ${err instanceof Error ? err.message : String(err)}\n`);
      this.electron = null;
      return null;
    }
  }

  /**
   * Dispatch an operation and return the result.
   */
  async handle(operation: Operation): Promise<OperationResult> {
    switch (operation.type) {
      case 'health_check':
        return this.handleHealthCheck();
      case 'execute_main':
        return this.handleExecuteMain(operation.payload);
      case 'send_ipc':
        return this.handleSendIpc(operation.payload);
      case 'mock_dialog':
        return this.handleMockDialog(operation.payload);
      case 'get_menu_items':
        return this.handleGetMenuItems();
      case 'take_screenshot':
        return this.handleTakeScreenshot();
      case 'get_console_logs':
        return this.handleGetConsoleLogs();
      case 'evaluate_in_page':
        return this.handleEvaluateInPage(operation.payload);
      case 'get_network_requests':
        return this.handleGetNetworkRequests();
      case 'set_window_bounds':
        return this.handleSetWindowBounds(operation.payload);
      default:
        return {
          success: false,
          error: `Unknown operation type: ${(operation as Operation).type}`,
        };
    }
  }

  private handleHealthCheck(): OperationResult {
    const electron = this.getElectron();
    return {
      success: true,
      data: {
        status: 'ok',
        hasElectron: electron !== null,
        mockDialogCount: this.dialogMocks.size,
      },
    };
  }

  private async handleExecuteMain(
    payload: Record<string, unknown> | undefined,
  ): Promise<OperationResult> {
    try {
      const code = payload?.code;
      if (typeof code !== 'string' || code.length === 0) {
        return { success: false, error: 'payload.code must be a non-empty string' };
      }

      const electron = this.getElectron();
      if (!electron) {
        return { success: false, error: 'Electron module not available' };
      }

      const timeout = typeof payload?.timeout === 'number' ? payload.timeout : 5000;

      const windows = electron.BrowserWindow.getAllWindows();
      if (windows.length === 0) {
        return { success: false, error: 'No BrowserWindow available' };
      }

      const webContents = windows[0].webContents;
      const resultPromise = webContents.executeJavaScript(code);

      // Race against timeout
      const result = await Promise.race([
        resultPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`executeJavaScript timed out after ${timeout}ms`)), timeout),
        ),
      ]);

      return { success: true, data: { result } };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private handleSendIpc(
    payload: Record<string, unknown> | undefined,
  ): OperationResult {
    try {
      const channel = payload?.channel;
      if (typeof channel !== 'string' || channel.length === 0) {
        return { success: false, error: 'payload.channel must be a non-empty string' };
      }

      const electron = this.getElectron();
      if (!electron) {
        return { success: false, error: 'Electron module not available' };
      }

      const args = Array.isArray(payload?.args) ? payload.args : [];

      const windows = electron.BrowserWindow.getAllWindows();
      if (windows.length === 0) {
        return { success: false, error: 'No BrowserWindow available' };
      }

      windows[0].webContents.send(channel, ...args);
      return { success: true, data: { sent: true, channel, argCount: args.length } };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private handleMockDialog(
    payload: Record<string, unknown> | undefined,
  ): OperationResult {
    try {
      const dialogType = payload?.dialogType;
      if (dialogType !== 'open' && dialogType !== 'save' && dialogType !== 'message') {
        return {
          success: false,
          error: "payload.dialogType must be 'open', 'save', or 'message'",
        };
      }

      if (payload?.response === undefined) {
        return { success: false, error: 'payload.response is required' };
      }

      const config: DialogMockConfig = {
        dialogType,
        response: payload.response,
      };
      this.dialogMocks.set(dialogType, config);

      return {
        success: true,
        data: { mocked: true, dialogType, activeMockCount: this.dialogMocks.size },
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private handleGetMenuItems(): OperationResult {
    try {
      const electron = this.getElectron();
      if (!electron) {
        return { success: false, error: 'Electron module not available' };
      }

      const menu = electron.Menu.getApplicationMenu();
      if (!menu) {
        return { success: true, data: { items: [] } };
      }

      const items = this.flattenMenuItems(menu.items);
      return { success: true, data: { items } };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── CDP-based operations ────────────────────────────────────────────────

  private async handleTakeScreenshot(): Promise<OperationResult> {
    if (!this.cdpSession) {
      return { success: false, error: 'CDP session not available' };
    }
    try {
      const screenshot = await this.cdpSession.send('Page.captureScreenshot', { format: 'png', quality: 80 });
      return { success: true, data: { screenshot: screenshot.data } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async handleGetConsoleLogs(): Promise<OperationResult> {
    if (!this.cdpSession) {
      return { success: false, error: 'CDP session not available' };
    }
    try {
      const logs: unknown[] = [];
      this.cdpSession.on('Runtime.consoleAPICalled', (params: unknown) => {
        const p = params as Record<string, unknown>;
        logs.push({
          type: p.type,
          args: (p.args as Array<Record<string, unknown>>)?.map((a) => a.value ?? a.description),
          timestamp: p.timestamp,
        });
      });
      await this.cdpSession.send('Runtime.enable');
      return { success: true, data: { logs } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async handleEvaluateInPage(
    payload: Record<string, unknown> | undefined,
  ): Promise<OperationResult> {
    if (!this.cdpSession) {
      return { success: false, error: 'CDP session not available' };
    }
    try {
      const expression = payload?.expression;
      if (typeof expression !== 'string' || expression.length === 0) {
        return { success: false, error: 'payload.expression must be a non-empty string' };
      }
      const result = await this.cdpSession.send('Runtime.evaluate', { expression, returnByValue: true });
      return { success: true, data: { result: result.result, exceptionDetails: result.exceptionDetails } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async handleGetNetworkRequests(): Promise<OperationResult> {
    if (!this.cdpSession) {
      return { success: false, error: 'CDP session not available' };
    }
    try {
      const requests: unknown[] = [];
      this.cdpSession.on('Network.requestWillBeSent', (params: unknown) => {
        const p = params as Record<string, unknown>;
        const request = p.request as Record<string, unknown>;
        requests.push({
          url: request.url,
          method: request.method,
          type: p.type,
          timestamp: p.timestamp,
        });
      });
      await this.cdpSession.send('Network.enable');
      return { success: true, data: { requests } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async handleSetWindowBounds(
    payload: Record<string, unknown> | undefined,
  ): Promise<OperationResult> {
    if (!this.cdpSession) {
      return { success: false, error: 'CDP session not available' };
    }
    try {
      const bounds = payload?.bounds as { x: number; y: number; width: number; height: number } | undefined;
      if (!bounds || typeof bounds.x !== 'number' || typeof bounds.y !== 'number' || typeof bounds.width !== 'number' || typeof bounds.height !== 'number') {
        return { success: false, error: 'payload.bounds must be an object with x, y, width, height numbers' };
      }
      const windowIdResult = await this.cdpSession.send('Browser.getWindowForTarget');
      const windowId = windowIdResult.windowId as number;
      await this.cdpSession.send('Browser.setWindowBounds', { windowId, bounds });
      return { success: true, data: { windowId, bounds } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Recursively flatten Electron MenuItem arrays into serializable objects.
   */
  private flattenMenuItems(items: Electron.MenuItem[]): MenuItemInfo[] {
    const result: MenuItemInfo[] = [];
    for (const item of items) {
      result.push({
        label: item.label,
        accelerator: item.accelerator || undefined,
        enabled: item.enabled,
        visible: item.visible,
        type: item.type,
      });
      if (item.submenu && 'items' in item.submenu) {
        result.push(...this.flattenMenuItems(item.submenu.items as Electron.MenuItem[]));
      }
    }
    return result;
  }
}
