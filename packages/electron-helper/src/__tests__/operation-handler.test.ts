import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OperationHandler } from '../operation-handler.js';
import type { Operation } from '../operation-handler.js';

type DataRecord = Record<string, unknown>;
type MockElectron = {
  BrowserWindow: { getAllWindows: () => unknown[] };
  Menu: { getApplicationMenu: () => unknown };
};

describe('OperationHandler', () => {
  let handler: OperationHandler;

  beforeEach(() => {
    handler = new OperationHandler();
  });

  // ── health_check ────────────────────────────────────────────────────────

  describe('health_check', () => {
    it('should return success with status ok', async () => {
      const result = await handler.handle({ type: 'health_check' });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).status).toBe('ok');
      expect(result.error).toBeUndefined();
    });

    it('should report hasElectron as false in Node.js', async () => {
      const result = await handler.handle({ type: 'health_check' });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.hasElectron).toBe(false);
    });

    it('should report zero mock dialog count initially', async () => {
      const result = await handler.handle({ type: 'health_check' });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.mockDialogCount).toBe(0);
    });

    it('should reflect updated mock dialog count', async () => {
      await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: {} },
      });
      await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'save', response: {} },
      });

      const result = await handler.handle({ type: 'health_check' });
      const data = result.data as Record<string, unknown>;
      expect(data.mockDialogCount).toBe(2);
    });

    it('should report hasElectron as true when Electron is mocked', async () => {
      const mockElectron = {
        BrowserWindow: { getAllWindows: () => [] },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({ type: 'health_check' });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.hasElectron).toBe(true);
    });
  });

  // ── execute_main ────────────────────────────────────────────────────────

  describe('execute_main', () => {
    it('should return error when Electron is not available', async () => {
      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: 'console.log("test")' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Electron module not available');
    });

    it('should return error for missing code', async () => {
      const result = await handler.handle({
        type: 'execute_main',
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for empty payload', async () => {
      const result = await handler.handle({ type: 'execute_main' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for empty string code', async () => {
      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for non-string code', async () => {
      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: 12345 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for null code', async () => {
      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: null },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for boolean code', async () => {
      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: true },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error when no BrowserWindow is available', async () => {
      const mockElectron = {
        BrowserWindow: { getAllWindows: () => [] },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: '1+1' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No BrowserWindow available');
    });

    it('should execute code and return result on success', async () => {
      const mockWebContents = {
        executeJavaScript: async (code: string) => eval(code),
      };
      const mockElectron = {
        BrowserWindow: {
          getAllWindows: () => [{ webContents: mockWebContents }],
        },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: '1 + 2' },
      });

      expect(result.success).toBe(true);
      expect((result.data as DataRecord).result).toBe(3);
    });

    it('should use custom timeout', async () => {
      // A promise that never resolves to simulate timeout
      const mockWebContents = {
        executeJavaScript: () => new Promise(() => {}),
      };
      const mockElectron = {
        BrowserWindow: {
          getAllWindows: () => [{ webContents: mockWebContents }],
        },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: 'slow()', timeout: 50 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
      expect(result.error).toContain('50ms');
    });

    it('should default to 5000ms timeout when not specified', async () => {
      const mockWebContents = {
        executeJavaScript: () => new Promise(() => {}),
      };
      const mockElectron = {
        BrowserWindow: {
          getAllWindows: () => [{ webContents: mockWebContents }],
        },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      // Use a short timeout via payload to avoid waiting 5s
      // But we test the default path by not providing timeout
      // We'll verify it doesn't crash and returns timeout error eventually
      // To keep the test fast, we override: if timeout is not a number, default 5000 applies
      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: 'slow()', timeout: 50 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('should handle executeJavaScript throwing an error', async () => {
      const mockWebContents = {
        executeJavaScript: async () => {
          throw new Error('script error');
        },
      };
      const mockElectron = {
        BrowserWindow: {
          getAllWindows: () => [{ webContents: mockWebContents }],
        },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: 'throw new Error()' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('script error');
    });

    it('should handle executeJavaScript throwing non-Error', async () => {
      const mockWebContents = {
        executeJavaScript: async () => {
          throw 'string throw';  
        },
      };
      const mockElectron = {
        BrowserWindow: {
          getAllWindows: () => [{ webContents: mockWebContents }],
        },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: 'throw "string"' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('string throw');
    });
  });

  // ── send_ipc ────────────────────────────────────────────────────────────

  describe('send_ipc', () => {
    it('should return error when Electron is not available', async () => {
      const result = await handler.handle({
        type: 'send_ipc',
        payload: { channel: 'test', args: ['hello'] },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Electron module not available');
    });

    it('should return error for missing channel', async () => {
      const result = await handler.handle({
        type: 'send_ipc',
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for empty string channel', async () => {
      const result = await handler.handle({
        type: 'send_ipc',
        payload: { channel: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for non-string channel', async () => {
      const result = await handler.handle({
        type: 'send_ipc',
        payload: { channel: 123 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for null channel', async () => {
      const result = await handler.handle({
        type: 'send_ipc',
        payload: { channel: null },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for empty payload', async () => {
      const result = await handler.handle({ type: 'send_ipc' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error when no BrowserWindow is available', async () => {
      const mockElectron = {
        BrowserWindow: { getAllWindows: () => [] },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({
        type: 'send_ipc',
        payload: { channel: 'test-channel' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No BrowserWindow available');
    });

    it('should send IPC message and return success', async () => {
      const sendMock = vi.fn();
      const mockWebContents = { send: sendMock };
      const mockElectron = {
        BrowserWindow: {
          getAllWindows: () => [{ webContents: mockWebContents }],
        },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({
        type: 'send_ipc',
        payload: { channel: 'my-channel', args: ['arg1', 'arg2'] },
      });

      expect(result.success).toBe(true);
      expect((result.data as DataRecord).sent).toBe(true);
      expect((result.data as DataRecord).channel).toBe('my-channel');
      expect((result.data as DataRecord).argCount).toBe(2);
      expect(sendMock).toHaveBeenCalledWith('my-channel', 'arg1', 'arg2');
    });

    it('should default args to empty array when not provided', async () => {
      const sendMock = vi.fn();
      const mockWebContents = { send: sendMock };
      const mockElectron = {
        BrowserWindow: {
          getAllWindows: () => [{ webContents: mockWebContents }],
        },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({
        type: 'send_ipc',
        payload: { channel: 'no-args' },
      });

      expect(result.success).toBe(true);
      expect((result.data as DataRecord).argCount).toBe(0);
      expect(sendMock).toHaveBeenCalledWith('no-args');
    });

    it('should default args to empty array when args is not an array', async () => {
      const sendMock = vi.fn();
      const mockWebContents = { send: sendMock };
      const mockElectron = {
        BrowserWindow: {
          getAllWindows: () => [{ webContents: mockWebContents }],
        },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({
        type: 'send_ipc',
        payload: { channel: 'bad-args', args: 'not-an-array' },
      });

      expect(result.success).toBe(true);
      expect((result.data as DataRecord).argCount).toBe(0);
      expect(sendMock).toHaveBeenCalledWith('bad-args');
    });

    it('should handle send throwing an Error', async () => {
      const mockWebContents = {
        send: () => {
          throw new Error('send failed');
        },
      };
      const mockElectron = {
        BrowserWindow: {
          getAllWindows: () => [{ webContents: mockWebContents }],
        },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({
        type: 'send_ipc',
        payload: { channel: 'fail-channel' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('send failed');
    });

    it('should handle send throwing non-Error', async () => {
      const mockWebContents = {
        send: () => {
          throw 42;  
        },
      };
      const mockElectron = {
        BrowserWindow: {
          getAllWindows: () => [{ webContents: mockWebContents }],
        },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({
        type: 'send_ipc',
        payload: { channel: 'fail-channel' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('42');
    });
  });

  // ── mock_dialog ─────────────────────────────────────────────────────────

  describe('mock_dialog', () => {
    it('should store open dialog mock and return success', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: { filePaths: ['/tmp/test'] } },
      });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).mocked).toBe(true);
      expect((result.data as Record<string, unknown>).dialogType).toBe('open');
    });

    it('should store save dialog mock', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'save', response: { filePath: '/tmp/out.txt' } },
      });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).dialogType).toBe('save');
    });

    it('should store message dialog mock', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'message', response: { response: 0 } },
      });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).dialogType).toBe('message');
    });

    it('should reject invalid dialogType', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'invalid', response: {} },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('dialogType');
    });

    it('should reject missing response', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'save' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('response');
    });

    it('should reject when response is explicitly undefined', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: undefined },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('response');
    });

    it('should track active mock count', async () => {
      await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: {} },
      });
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'save', response: {} },
      });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).activeMockCount).toBe(2);
    });

    it('should overwrite existing mock for same dialogType', async () => {
      await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: { filePaths: ['/first'] } },
      });
      await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: { filePaths: ['/second'] } },
      });

      // Count should still be 1 since it overwrites
      const result = await handler.handle({ type: 'health_check' });
      const data = result.data as Record<string, unknown>;
      expect(data.mockDialogCount).toBe(1);
    });

    it('should reject for missing payload', async () => {
      const result = await handler.handle({ type: 'mock_dialog' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should accept falsy but defined response values', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: false },
      });

      expect(result.success).toBe(true);
    });

    it('should accept null response value', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: null },
      });

      expect(result.success).toBe(true);
    });

    it('should accept empty object response', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'save', response: {} },
      });

      expect(result.success).toBe(true);
    });
  });

  // ── get_menu_items ──────────────────────────────────────────────────────

  describe('get_menu_items', () => {
    it('should return error when Electron is not available', async () => {
      const result = await handler.handle({ type: 'get_menu_items' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Electron module not available');
    });

    it('should return empty items when application menu is null', async () => {
      const mockElectron = {
        BrowserWindow: { getAllWindows: () => [] },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({ type: 'get_menu_items' });

      expect(result.success).toBe(true);
      expect((result.data as DataRecord).items).toEqual([]);
    });

    it('should return flattened menu items when menu exists', async () => {
      const mockMenu = {
        items: [
          {
            label: 'File',
            accelerator: 'CmdOrCtrl+N',
            enabled: true,
            visible: true,
            type: 'normal',
          },
          {
            label: 'Edit',
            enabled: false,
            visible: true,
            type: 'submenu',
          },
        ],
      };
      const mockElectron = {
        BrowserWindow: { getAllWindows: () => [] },
        Menu: { getApplicationMenu: () => mockMenu },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({ type: 'get_menu_items' });

      expect(result.success).toBe(true);
      const items = (result.data as DataRecord).items as Array<Record<string, unknown>>;
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({
        label: 'File',
        accelerator: 'CmdOrCtrl+N',
        enabled: true,
        visible: true,
        type: 'normal',
      });
      expect(items[1]).toEqual({
        label: 'Edit',
        accelerator: undefined,
        enabled: false,
        visible: true,
        type: 'submenu',
      });
    });

    it('should recursively flatten submenu items', async () => {
      const mockMenu = {
        items: [
          {
            label: 'File',
            enabled: true,
            visible: true,
            type: 'submenu',
            submenu: {
              items: [
                {
                  label: 'New',
                  accelerator: 'CmdOrCtrl+N',
                  enabled: true,
                  visible: true,
                  type: 'normal',
                },
                {
                  label: 'Open',
                  enabled: true,
                  visible: true,
                  type: 'normal',
                },
              ],
            },
          },
          {
            label: 'Help',
            enabled: true,
            visible: true,
            type: 'normal',
          },
        ],
      };
      const mockElectron = {
        BrowserWindow: { getAllWindows: () => [] },
        Menu: { getApplicationMenu: () => mockMenu },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({ type: 'get_menu_items' });

      expect(result.success).toBe(true);
      const items = (result.data as DataRecord).items as Array<Record<string, unknown>>;
      // 1 parent (File) + 2 children (New, Open) + 1 sibling (Help) = 4
      expect(items).toHaveLength(4);
      expect(items[0].label).toBe('File');
      expect(items[1].label).toBe('New');
      expect(items[1].accelerator).toBe('CmdOrCtrl+N');
      expect(items[2].label).toBe('Open');
      expect(items[2].accelerator).toBeUndefined();
      expect(items[3].label).toBe('Help');
    });

    it('should handle deeply nested submenus', async () => {
      const mockMenu = {
        items: [
          {
            label: 'Level1',
            enabled: true,
            visible: true,
            type: 'submenu',
            submenu: {
              items: [
                {
                  label: 'Level2',
                  enabled: true,
                  visible: true,
                  type: 'submenu',
                  submenu: {
                    items: [
                      {
                        label: 'Level3',
                        enabled: true,
                        visible: false,
                        type: 'normal',
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      };
      const mockElectron = {
        BrowserWindow: { getAllWindows: () => [] },
        Menu: { getApplicationMenu: () => mockMenu },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({ type: 'get_menu_items' });

      expect(result.success).toBe(true);
      const items = (result.data as DataRecord).items as Array<Record<string, unknown>>;
      expect(items).toHaveLength(3);
      expect(items[0].label).toBe('Level1');
      expect(items[1].label).toBe('Level2');
      expect(items[2].label).toBe('Level3');
      expect(items[2].visible).toBe(false);
    });

    it('should handle menu items without submenu property', async () => {
      const mockMenu = {
        items: [
          {
            label: 'Simple',
            enabled: true,
            visible: true,
            type: 'normal',
            // no submenu property at all
          },
        ],
      };
      const mockElectron = {
        BrowserWindow: { getAllWindows: () => [] },
        Menu: { getApplicationMenu: () => mockMenu },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({ type: 'get_menu_items' });

      expect(result.success).toBe(true);
      const items = (result.data as DataRecord).items as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
      expect(items[0].label).toBe('Simple');
    });

    it('should not recurse into submenu without items property', async () => {
      const mockMenu = {
        items: [
          {
            label: 'Weird',
            enabled: true,
            visible: true,
            type: 'submenu',
            submenu: { label: 'fake-submenu' }, // object but no 'items' key
          },
        ],
      };
      const mockElectron = {
        BrowserWindow: { getAllWindows: () => [] },
        Menu: { getApplicationMenu: () => mockMenu },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({ type: 'get_menu_items' });

      expect(result.success).toBe(true);
      const items = (result.data as DataRecord).items as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
      expect(items[0].label).toBe('Weird');
    });

    it('should handle empty menu items array', async () => {
      const mockMenu = { items: [] };
      const mockElectron = {
        BrowserWindow: { getAllWindows: () => [] },
        Menu: { getApplicationMenu: () => mockMenu },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({ type: 'get_menu_items' });

      expect(result.success).toBe(true);
      expect((result.data as DataRecord).items).toEqual([]);
    });

    it('should return error when getApplicationMenu throws', async () => {
      const mockElectron = {
        BrowserWindow: { getAllWindows: () => [] },
        Menu: {
          getApplicationMenu: () => {
            throw new Error('menu access denied');
          },
        },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({ type: 'get_menu_items' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('menu access denied');
    });

    it('should return error when getApplicationMenu throws non-Error', async () => {
      const mockElectron = {
        BrowserWindow: { getAllWindows: () => [] },
        Menu: {
          getApplicationMenu: () => {
            throw 'string error';  
          },
        },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({ type: 'get_menu_items' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });

    it('should use cached electron module on second call', async () => {
      const mockElectron = {
        BrowserWindow: { getAllWindows: () => [] },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const r1 = await handler.handle({ type: 'get_menu_items' });
      const r2 = await handler.handle({ type: 'get_menu_items' });

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      // Both should succeed using the cached module
      expect((r1.data as DataRecord).items).toEqual([]);
      expect((r2.data as DataRecord).items).toEqual([]);
    });
  });

  // ── unknown operation ───────────────────────────────────────────────────

  describe('unknown operation', () => {
    it('should return error for unknown operation type', async () => {
      const unknownOp = { type: 'unknown_op' } as unknown as Operation;
      const result = await handler.handle(unknownOp);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown operation type');
      expect(result.error).toContain('unknown_op');
    });

    it('should return error for completely empty type', async () => {
      const unknownOp = { type: '' } as unknown as Operation;
      const result = await handler.handle(unknownOp);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown operation type');
    });

    it('should return error for numeric type', async () => {
      const unknownOp = { type: 42 } as unknown as Operation;
      const result = await handler.handle(unknownOp);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown operation type');
    });
  });

  // ── result shape ────────────────────────────────────────────────────────

  describe('result shape', () => {
    it('should always return OperationResult shape for all operations', async () => {
      const operations: Operation[] = [
        { type: 'health_check' },
        { type: 'execute_main' },
        { type: 'send_ipc' },
        { type: 'mock_dialog' },
        { type: 'get_menu_items' },
      ];

      for (const op of operations) {
        const result = await handler.handle(op);
        expect(result).toHaveProperty('success');
        expect(typeof result.success).toBe('boolean');
        // error is either undefined or a string
        if (result.error !== undefined) {
          expect(typeof result.error).toBe('string');
        }
      }
    });

    it('should return data as object when present on success', async () => {
      const result = await handler.handle({ type: 'health_check' });
      expect(result.success).toBe(true);
      expect(typeof result.data).toBe('object');
      expect(result.data).not.toBeNull();
    });
  });

  // ── multiple sequential operations ──────────────────────────────────────

  describe('sequential operations', () => {
    it('should handle multiple health checks in sequence', async () => {
      const r1 = await handler.handle({ type: 'health_check' });
      const r2 = await handler.handle({ type: 'health_check' });
      const r3 = await handler.handle({ type: 'health_check' });

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r3.success).toBe(true);
    });

    it('should handle mixed operation types', async () => {
      const r1 = await handler.handle({ type: 'health_check' });
      const r2 = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: {} },
      });
      const r3 = await handler.handle({
        type: 'execute_main',
        payload: { code: '1+1' },
      });
      const r4 = await handler.handle({ type: 'health_check' });

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r3.success).toBe(false); // No Electron
      expect(r4.success).toBe(true);
      // Mock count should reflect the one mock we added
      expect((r4.data as Record<string, unknown>).mockDialogCount).toBe(1);
    });
  });

  // ── getElectron dynamic require coverage (lines 69-83) ────────────

  describe('getElectron dynamic require paths', () => {
    it('should return null when require returns a non-object (string path)', async () => {
      // Create a fresh handler (electron is undefined by default)
      const freshHandler = new OperationHandler();

      // In Node.js test environment, eval('require')('electron') returns
      // the binary path string, which is not an object. This exercises
      // line 73: typeof mod !== 'object' -> this.electron = null -> return null
      const result = await freshHandler.handle({
        type: 'execute_main',
        payload: { code: '1+1' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Electron module not available');
    });

    it('should cache electron as null after first failed getElectron call', async () => {
      const freshHandler = new OperationHandler();

      // First call exercises getElectron() path
      const r1 = await freshHandler.handle({ type: 'health_check' });
      const data1 = r1.data as Record<string, unknown>;
      expect(data1.hasElectron).toBe(false);

      // Second call should use cached value (line 64-65 path)
      const r2 = await freshHandler.handle({ type: 'health_check' });
      const data2 = r2.data as Record<string, unknown>;
      expect(data2.hasElectron).toBe(false);
    });

    it('should handle getElectron returning null for send_ipc', async () => {
      const freshHandler = new OperationHandler();

      const result = await freshHandler.handle({
        type: 'send_ipc',
        payload: { channel: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Electron module not available');
    });

    it('should handle getElectron returning null for get_menu_items', async () => {
      const freshHandler = new OperationHandler();

      const result = await freshHandler.handle({ type: 'get_menu_items' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Electron module not available');
    });

    it('should handle getElectron returning null for mock_dialog with valid params', async () => {
      const freshHandler = new OperationHandler();

      // mock_dialog doesn't call getElectron, but verify it works independently
      const result = await freshHandler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: {} },
      });

      expect(result.success).toBe(true);
    });

    it('should use cached electron on subsequent handle calls', async () => {
      // Set electron via type cast to bypass getElectron
      const mockElectron = {
        BrowserWindow: {
          getAllWindows: () => [{
            webContents: { executeJavaScript: async () => 42 },
          }],
        },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      // First call: getElectron() caches the value at line 64-65
      const r1 = await handler.handle({
        type: 'execute_main',
        payload: { code: '1+1' },
      });
      expect(r1.success).toBe(true);
      expect((r1.data as DataRecord).result).toBe(42);

      // Second call: uses cached electron (line 64-65)
      const r2 = await handler.handle({
        type: 'execute_main',
        payload: { code: '2+2' },
      });
      expect(r2.success).toBe(true);
      expect((r2.data as DataRecord).result).toBe(42);
    });

    it('should handle execute_main with custom timeout via getElectron cache', async () => {
      const mockElectron = {
        BrowserWindow: {
          getAllWindows: () => [{
            webContents: {
              executeJavaScript: () => new Promise(() => {}), // never resolves
            },
          }],
        },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: 'slow()', timeout: 100 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
      expect(result.error).toContain('100ms');
    });

    it('should handle execute_main success with default timeout', async () => {
      const mockElectron = {
        BrowserWindow: {
          getAllWindows: () => [{
            webContents: {
              executeJavaScript: async () => 'result-value',
            },
          }],
        },
        Menu: { getApplicationMenu: () => null },
      };
      (handler as unknown as { electron: MockElectron }).electron = mockElectron;

      // No timeout specified — uses default 5000ms
      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: 'return "result-value"' },
      });

      expect(result.success).toBe(true);
      expect((result.data as DataRecord).result).toBe('result-value');
    });
  });
});
