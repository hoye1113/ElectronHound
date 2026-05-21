/**
 * Electron tools tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ElectronContext } from '../types.js';
import {
  createElectronTools,
  LaunchElectronTool,
  CloseElectronTool,
  ExecuteMainTool,
  TriggerIpcTool,
  MockDialogTool,
} from '../electron.js';

// ─── Mock context ───────────────────────────────────────────────────────

function createMockElectronContext(): ElectronContext {
  return {
    launch: vi.fn().mockResolvedValue({ pid: 1234 }),
    close: vi.fn().mockResolvedValue(undefined),
    executeMain: vi.fn().mockResolvedValue({ result: 42 }),
    triggerIpc: vi.fn().mockResolvedValue({ response: 'ok' }),
    mockDialog: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('Electron tools', () => {
  let ctx: ElectronContext;

  beforeEach(() => {
    ctx = createMockElectronContext();
    vi.clearAllMocks();
  });

  describe('createElectronTools', () => {
    it('creates all 5 electron tools', () => {
      const tools = createElectronTools(ctx);
      expect(tools).toHaveLength(5);

      const names = tools.map((t) => t.name);
      expect(names).toContain('launch');
      expect(names).toContain('close');
      expect(names).toContain('execute_main');
      expect(names).toContain('trigger_ipc');
      expect(names).toContain('mock_dialog');
    });
  });

  // ── launch ────────────────────────────────────────────────────────────

  describe('launch', () => {
    it('launches an Electron app', async () => {
      const t = new LaunchElectronTool(ctx);
      const result = await t.invoke({ appPath: '/path/to/app', enableCdp: true });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ launched: true, appPath: '/path/to/app', pid: 1234 });
      expect(ctx.launch).toHaveBeenCalled();
    });

    it('handles launch error', async () => {
      (ctx.launch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));
      const t = new LaunchElectronTool(ctx);
      const result = await t.invoke({ appPath: '/bad/path' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('ENOENT');
    });
  });

  // ── close ─────────────────────────────────────────────────────────────

  describe('close', () => {
    it('closes an Electron app', async () => {
      const t = new CloseElectronTool(ctx);
      const result = await t.invoke({ force: false });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ closed: true });
      expect(ctx.close).toHaveBeenCalledWith({ force: false });
    });

    it('handles close error', async () => {
      (ctx.close as ReturnType<typeof vi.fn>).mockRejectedValue('Already closed');
      const t = new CloseElectronTool(ctx);
      const result = await t.invoke({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Already closed');
    });
  });

  // ── execute_main ──────────────────────────────────────────────────────

  describe('execute_main', () => {
    it('executes code in main process', async () => {
      const t = new ExecuteMainTool(ctx);
      const result = await t.invoke({ code: 'return 1+1' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 42 });
      expect(ctx.executeMain).toHaveBeenCalledWith('return 1+1', undefined);
    });

    it('passes timeout', async () => {
      const t = new ExecuteMainTool(ctx);
      await t.invoke({ code: 'longRunning()', timeout: 5000 });

      expect(ctx.executeMain).toHaveBeenCalledWith('longRunning()', 5000);
    });
  });

  // ── trigger_ipc ───────────────────────────────────────────────────────

  describe('trigger_ipc', () => {
    it('triggers an IPC event', async () => {
      const t = new TriggerIpcTool(ctx);
      const result = await t.invoke({
        channel: 'test-channel',
        payload: { data: 1 },
        expectResponse: true,
      });

      expect(result.success).toBe(true);
      expect(ctx.triggerIpc).toHaveBeenCalledWith('test-channel', { data: 1 }, {
        expectResponse: true,
        timeout: undefined,
      });
    });

    it('handles IPC error', async () => {
      (ctx.triggerIpc as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Channel busy'));
      const t = new TriggerIpcTool(ctx);
      const result = await t.invoke({ channel: 'busy' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Channel busy');
    });
  });

  // ── mock_dialog ───────────────────────────────────────────────────────

  describe('mock_dialog', () => {
    it('mocks an alert dialog', async () => {
      const t = new MockDialogTool(ctx);
      const result = await t.invoke({ type: 'alert' });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ mocked: true, type: 'alert' });
      expect(ctx.mockDialog).toHaveBeenCalledWith('alert', { response: undefined, dismiss: undefined });
    });

    it('mocks a confirm dialog with response', async () => {
      const t = new MockDialogTool(ctx);
      const result = await t.invoke({ type: 'confirm', response: true });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ mocked: true, type: 'confirm', response: true });
    });

    it('handles mock error', async () => {
      (ctx.mockDialog as ReturnType<typeof vi.fn>).mockRejectedValue('No dialog');
      const t = new MockDialogTool(ctx);
      const result = await t.invoke({ type: 'prompt' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No dialog');
    });
  });
});
