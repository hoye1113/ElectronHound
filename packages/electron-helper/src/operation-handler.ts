export interface Operation {
  type:
    | 'execute_main'
    | 'send_ipc'
    | 'mock_dialog'
    | 'get_menu_items'
    | 'health_check';
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

/**
 * Handles operations dispatched from the electron-bridge-mcp server.
 * All operations use real Electron APIs when available.
 */
export class OperationHandler {
  private electron: typeof import('electron') | null = null;
  private dialogMocks: Map<string, DialogMockConfig> = new Map();

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
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
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
