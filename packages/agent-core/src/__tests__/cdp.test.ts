import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CDPClient,
  CDPSession,
  BrowserSnapshotTool,
  BrowserClickTool,
  BrowserTypeTool,
  BrowserNavigateTool,
  BrowserPressKeyTool,
  BrowserHoverTool,
  BrowserDragTool,
  CDPLaunchTool,
  CDPCloseTool,
  CDPExecuteMainTool,
  CDPTriggerIpcTool,
  CDPMockDialogTool,
  createCDPTools,
} from '../tools/cdp.js';
import type { CDPContext, CDPConfig } from '../tools/types.js';

function mockCDPCtx(overrides?: Partial<CDPContext>): CDPContext {
  return {
    connect: vi.fn().mockResolvedValue({ sessionId: 'test-sess', type: 'browser' }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    sendCommand: vi.fn().mockResolvedValue({ result: { ok: true } }),
    createSession: vi.fn().mockResolvedValue({ sessionId: 'new-sess', type: 'page' }),
    closeSession: vi.fn().mockResolvedValue(undefined),
    listSessions: vi.fn().mockReturnValue([]),
    ...overrides,
  };
}

describe('CDPClient', () => {
  it('constructs without error', () => {
    const client = new CDPClient();
    expect(client).toBeDefined();
  });

  it('isConnected returns false initially', () => {
    const client = new CDPClient();
    expect(client.isConnected()).toBe(false);
  });

  it('connect establishes connection', async () => {
    const client = new CDPClient();
    const info = await client.connect({ port: 9222 });
    expect(info.sessionId).toBeDefined();
    expect(client.isConnected()).toBe(true);
  });

  it('disconnect closes connection', async () => {
    const client = new CDPClient();
    await client.connect({});
    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('connect throws when already connected', async () => {
    const client = new CDPClient();
    await client.connect({});
    await expect(client.connect({})).rejects.toThrow('already connected');
  });

  it('disconnect no-op when not connected', async () => {
    const client = new CDPClient();
    await client.disconnect(); // should not throw
  });

  it('sendCommand returns error when not connected', async () => {
    const client = new CDPClient();
    const r = await client.sendCommand('Page.navigate');
    expect(r.error).toBeDefined();
    expect(r.error?.message).toContain('not connected');
  });

  it('sendCommand sends on default connection', async () => {
    const client = new CDPClient();
    await client.connect({});
    const r = await client.sendCommand('DOM.getDocument');
    expect(r.result).toBeDefined();
  });

  it('createSession creates a new session', async () => {
    const client = new CDPClient();
    await client.connect({});
    const info = await client.createSession('target1', 'page');
    expect(info.sessionId).toBeDefined();
    expect(info.type).toBe('page');
  });

  it('createSession throws when not connected', async () => {
    const client = new CDPClient();
    await expect(client.createSession()).rejects.toThrow('not connected');
  });

  it('listSessions returns session list', async () => {
    const client = new CDPClient();
    await client.connect({});
    const sessions = client.listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(1);
  });

  it('closeSession removes session', async () => {
    const client = new CDPClient();
    await client.connect({});
    const sessions = client.listSessions();
    const id = sessions[0].sessionId;
    await client.closeSession(id);
    expect(client.listSessions().some(s => s.sessionId === id)).toBe(false);
  });

  it('sendCommand routes to specific session', async () => {
    const client = new CDPClient();
    await client.connect({});
    const sessions = client.listSessions();
    const id = sessions[0].sessionId;
    const r = await client.sendCommand('DOM.getDocument', {}, id);
    expect(r.result).toBeDefined();
  });

  it('sendCommand returns error for unknown session', async () => {
    const client = new CDPClient();
    await client.connect({});
    const r = await client.sendCommand('DOM.getDocument', {}, 'nonexistent');
    expect(r.error).toBeDefined();
  });

  it('connect with custom endpoint', async () => {
    const client = new CDPClient();
    const info = await client.connect({ endpoint: 'ws://custom:9222/devtools/browser/' });
    expect(info.sessionId).toBeDefined();
  });

  it('connect with electron target type', async () => {
    const client = new CDPClient();
    const info = await client.connect({ targetType: 'electron' });
    expect(info.type).toBe('electron-main');
  });
});

describe('CDPSession', () => {
  it('stores info', () => {
    const info = { sessionId: 's1', type: 'browser' as const };
    const session = new CDPSession(info, vi.fn());
    expect(session.id).toBe('s1');
    expect(session.type).toBe('browser');
  });

  it('sendCommand calls sendRaw', async () => {
    const sendRaw = vi.fn().mockResolvedValue({ result: { ok: true } });
    const session = new CDPSession({ sessionId: 's2', type: 'page' }, sendRaw);
    const r = await session.sendCommand('Page.navigate', { url: '/' });
    expect(sendRaw).toHaveBeenCalled();
  });
});

describe('CDP Browser Tools', () => {
  let ctx: CDPContext;
  beforeEach(() => { ctx = mockCDPCtx(); });

  it('createCDPTools returns 12 tools', () => {
    expect(createCDPTools(ctx)).toHaveLength(12);
  });

  it('BrowserSnapshotTool invokes correct CDP method', async () => {
    const t = new BrowserSnapshotTool(ctx);
    const r = await t.invoke({});
    expect(r.success).toBe(true);
    expect(ctx.sendCommand).toHaveBeenCalledWith('Accessibility.getFullAXTree', expect.anything(), undefined);
  });

  it('BrowserSnapshotTool uses Page.captureSnapshot for screenshot', async () => {
    const t = new BrowserSnapshotTool(ctx);
    await t.invoke({ format: 'screenshot' });
    expect(ctx.sendCommand).toHaveBeenCalledWith('Page.captureSnapshot', expect.anything(), undefined);
  });

  it('BrowserClickTool sends Input.dispatchMouseEvent', async () => {
    const t = new BrowserClickTool(ctx);
    const r = await t.invoke({ selector: '#btn' });
    expect(r.success).toBe(true);
    expect(ctx.sendCommand).toHaveBeenCalledWith('Input.dispatchMouseEvent', expect.objectContaining({ selector: '#btn' }), undefined);
  });

  it('BrowserTypeTool sends Input.insertText', async () => {
    const t = new BrowserTypeTool(ctx);
    const r = await t.invoke({ selector: '#input', text: 'hello' });
    expect(r.success).toBe(true);
  });

  it('BrowserNavigateTool sends Page.navigate', async () => {
    const t = new BrowserNavigateTool(ctx);
    const r = await t.invoke({ url: 'http://test.com' });
    expect(r.success).toBe(true);
    expect(ctx.sendCommand).toHaveBeenCalledWith('Page.navigate', expect.objectContaining({ url: 'http://test.com' }), undefined);
  });

  it('BrowserPressKeyTool sends Input.dispatchKeyEvent', async () => {
    const t = new BrowserPressKeyTool(ctx);
    const r = await t.invoke({ key: 'Enter' });
    expect(r.success).toBe(true);
  });

  it('BrowserHoverTool sends mouseMoved', async () => {
    const t = new BrowserHoverTool(ctx);
    const r = await t.invoke({ selector: '#el' });
    expect(r.success).toBe(true);
  });

  it('BrowserDragTool sends drag action', async () => {
    const t = new BrowserDragTool(ctx);
    const r = await t.invoke({ sourceSelector: '#src', targetSelector: '#tgt' });
    expect(r.success).toBe(true);
  });
});

describe('CDP Electron Tools', () => {
  let ctx: CDPContext;
  beforeEach(() => { ctx = mockCDPCtx(); });

  it('CDPLaunchTool connects to electron', async () => {
    const t = new CDPLaunchTool(ctx);
    const r = await t.invoke({ appPath: '/app' });
    expect(r.success).toBe(true);
    expect(ctx.connect).toHaveBeenCalled();
  });

  it('CDPCloseTool disconnects', async () => {
    const t = new CDPCloseTool(ctx);
    const r = await t.invoke({});
    expect(r.success).toBe(true);
    expect(ctx.disconnect).toHaveBeenCalled();
  });

  it('CDPExecuteMainTool sends Runtime.evaluate', async () => {
    const t = new CDPExecuteMainTool(ctx);
    const r = await t.invoke({ code: 'app.getVersion()' });
    expect(r.success).toBe(true);
    expect(ctx.sendCommand).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({ expression: 'app.getVersion()' }), undefined);
  });

  it('CDPTriggerIpcTool sends IPC expression', async () => {
    const t = new CDPTriggerIpcTool(ctx);
    const r = await t.invoke({ channel: 'test-ch' });
    expect(r.success).toBe(true);
    expect(ctx.sendCommand).toHaveBeenCalledWith('Runtime.evaluate', expect.anything(), undefined);
  });

  it('CDPTriggerIpcTool with expectResponse uses invoke syntax', async () => {
    const t = new CDPTriggerIpcTool(ctx);
    await t.invoke({ channel: 'ch', expectResponse: true });
    const callArgs = (ctx.sendCommand as any).mock.calls[0][1];
    expect(callArgs.expression).toContain('invoke');
  });

  it('CDPMockDialogTool sends handleJavaScriptDialog', async () => {
    const t = new CDPMockDialogTool(ctx);
    const r = await t.invoke({ type: 'alert' });
    expect(r.success).toBe(true);
    expect(ctx.sendCommand).toHaveBeenCalledWith('Page.handleJavaScriptDialog', expect.anything(), undefined);
  });

  it('CDP tool failure on sendCommand error', async () => {
    const failCtx = mockCDPCtx({
      sendCommand: vi.fn().mockResolvedValue({ error: { code: -1, message: 'fail' } }),
    });
    const t = new BrowserSnapshotTool(failCtx);
    const r = await t.invoke({});
    expect(r.success).toBe(false);
    expect(r.error).toContain('failed');
  });
});
