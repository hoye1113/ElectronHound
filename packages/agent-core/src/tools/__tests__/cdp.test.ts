/**
 * CDP (Chrome DevTools Protocol) integration tests
 *
 * Covers:
 * - CDPClient: connect, disconnect, sessions, sendCommand
 * - CDPSession: id, type, sendCommand
 * - All 12 CDP tools
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CDPClient,
  CDPSession,
  createCDPTools,
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
} from '../cdp.js';

// ─── CDPClient ──────────────────────────────────────────────────────────

describe('CDPClient', () => {
  let client: CDPClient;

  beforeEach(() => {
    client = new CDPClient();
  });

  describe('connect', () => {
    it('establishes a connection with endpoint', async () => {
      const sessionInfo = await client.connect({
        endpoint: 'ws://127.0.0.1:9222/devtools/browser/abc',
      });

      expect(client.isConnected()).toBe(true);
      expect(sessionInfo.sessionId).toBeTruthy();
      expect(sessionInfo.type).toBe('browser');
    });

    it('connects to an electron target', async () => {
      const sessionInfo = await client.connect({
        port: 9222,
        targetType: 'electron',
      });

      expect(client.isConnected()).toBe(true);
      expect(sessionInfo.type).toBe('electron-main');
    });

    it('builds endpoint from host and port', async () => {
      const sessionInfo = await client.connect({
        host: '192.168.1.1',
        port: 9333,
      });

      expect(client.isConnected()).toBe(true);
      expect(sessionInfo.sessionId).toBeTruthy();
    });

    it('throws if already connected', async () => {
      await client.connect({ port: 9222 });
      await expect(client.connect({ port: 9222 })).rejects.toThrow('already connected');
    });
  });

  describe('disconnect', () => {
    it('disconnects cleanly', async () => {
      await client.connect({ port: 9222 });
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it('is safe to call when not connected', async () => {
      await expect(client.disconnect()).resolves.not.toThrow();
    });

    it('closes all sessions on disconnect', async () => {
      await client.connect({ port: 9222 });
      await client.createSession('target-1', 'page');
      await client.createSession('target-2', 'page');

      expect(client.listSessions()).toHaveLength(3); // 1 from connect + 2 created

      await client.disconnect();
      expect(client.listSessions()).toHaveLength(0);
    });
  });

  describe('sessions', () => {
    beforeEach(async () => {
      await client.connect({ port: 9222 });
    });

    it('creates a session with a target id', async () => {
      const info = await client.createSession('target-abc', 'page');

      expect(info.sessionId).toBeTruthy();
      expect(info.targetId).toBe('target-abc');
      expect(info.type).toBe('page');
    });

    it('creates a session with default type', async () => {
      const info = await client.createSession();

      expect(info.type).toBe('page');
    });

    it('lists active sessions', async () => {
      await client.createSession('t1');
      await client.createSession('t2');

      const sessions = client.listSessions();
      // Initial connection session + 2 created
      expect(sessions.length).toBeGreaterThanOrEqual(3);
    });

    it('closes a specific session', async () => {
      const s = await client.createSession('t1');
      expect(client.getSession(s.sessionId)).toBeDefined();

      await client.closeSession(s.sessionId);
      expect(client.getSession(s.sessionId)).toBeUndefined();
    });

    it('getSession returns undefined for unknown id', () => {
      expect(client.getSession('nonexistent')).toBeUndefined();
    });
  });

  describe('sendCommand', () => {
    beforeEach(async () => {
      await client.connect({ port: 9222 });
    });

    it('sends a command on the default connection', async () => {
      const result = await client.sendCommand('Runtime.evaluate', { expression: '1+1' });

      expect(result.result).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('sends a command to a specific session', async () => {
      const s = await client.createSession('t1', 'page');
      const result = await client.sendCommand('Page.navigate', { url: 'test' }, s.sessionId);

      expect(result.result).toBeDefined();
    });

    it('returns error when not connected', async () => {
      const disconnected = new CDPClient();
      const result = await disconnected.sendCommand('Runtime.evaluate');

      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('not connected');
    });

    it('returns error for unknown session id', async () => {
      const result = await client.sendCommand('test', {}, 'fake-id');

      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('not found');
    });
  });
});

// ─── CDPSession ─────────────────────────────────────────────────────────

describe('CDPSession', () => {
  it('exposes id and type', async () => {
    const client = new CDPClient();
    await client.connect({ port: 9222 });
    const s = await client.createSession('t1', 'electron-renderer');

    const session = client.getSession(s.sessionId)!;
    expect(session).toBeInstanceOf(CDPSession);
    expect(session.id).toBe(s.sessionId);
    expect(session.type).toBe('electron-renderer');
  });

  it('sends commands via sendCommand', async () => {
    const client = new CDPClient();
    await client.connect({ port: 9222 });
    const s = await client.createSession('t1', 'page');

    const session = client.getSession(s.sessionId)!;
    const result = await session.sendCommand('Runtime.evaluate', { expression: '42' });

    expect(result.result).toBeDefined();
  });
});

// ─── CDPBrowser tools ───────────────────────────────────────────────────

describe('CDP Browser tools', () => {
  let client: CDPClient;

  beforeEach(async () => {
    client = new CDPClient();
    await client.connect({ port: 9222 });
  });

  describe('createCDPTools', () => {
    it('creates all 12 CDP tools', () => {
      const tools = createCDPTools(client);
      expect(tools).toHaveLength(12);

      const names = tools.map((t) => t.name);
      expect(names).toContain('browser_snapshot');
      expect(names).toContain('browser_click');
      expect(names).toContain('browser_type');
      expect(names).toContain('browser_navigate');
      expect(names).toContain('browser_press_key');
      expect(names).toContain('browser_hover');
      expect(names).toContain('browser_drag');
      expect(names).toContain('cdp_launch');
      expect(names).toContain('cdp_close');
      expect(names).toContain('cdp_execute_main');
      expect(names).toContain('cdp_trigger_ipc');
      expect(names).toContain('cdp_mock_dialog');
    });
  });

  // ── browser_snapshot ───────────────────────────────────────────────────

  describe('browser_snapshot', () => {
    it('captures aria snapshot by default', async () => {
      const t = new BrowserSnapshotTool(client);
      const result = await t.invoke({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('uses Page.captureSnapshot for screenshot format', async () => {
      const t = new BrowserSnapshotTool(client);
      const result = await t.invoke({ format: 'screenshot' });

      expect(result.success).toBe(true);
    });
  });

  // ── browser_click ──────────────────────────────────────────────────────

  describe('browser_click', () => {
    it('clicks an element via CDP', async () => {
      const t = new BrowserClickTool(client);
      const result = await t.invoke({ selector: '#btn' });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ clicked: true, selector: '#btn' });
    });

    it('passes button and clickCount', async () => {
      const t = new BrowserClickTool(client);
      const result = await t.invoke({ selector: '#ctx', button: 'right', clickCount: 2 });

      expect(result.success).toBe(true);
    });
  });

  // ── browser_type ───────────────────────────────────────────────────────

  describe('browser_type', () => {
    it('types text via CDP', async () => {
      const t = new BrowserTypeTool(client);
      const result = await t.invoke({ selector: '#input', text: 'hello' });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ typed: true, text: 'hello' });
    });

    it('supports clear option', async () => {
      const t = new BrowserTypeTool(client);
      const result = await t.invoke({ selector: '#input', text: 'replaced', clear: true });

      expect(result.success).toBe(true);
    });
  });

  // ── browser_navigate ───────────────────────────────────────────────────

  describe('browser_navigate', () => {
    it('navigates to a URL via CDP', async () => {
      const t = new BrowserNavigateTool(client);
      const result = await t.invoke({ url: 'https://example.com' });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ navigated: true, url: 'https://example.com' });
    });
  });

  // ── browser_press_key ──────────────────────────────────────────────────

  describe('browser_press_key', () => {
    it('presses a key via CDP', async () => {
      const t = new BrowserPressKeyTool(client);
      const result = await t.invoke({ key: 'Enter' });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ keyPressed: 'Enter' });
    });
  });

  // ── browser_hover ──────────────────────────────────────────────────────

  describe('browser_hover', () => {
    it('hovers via CDP', async () => {
      const t = new BrowserHoverTool(client);
      const result = await t.invoke({ selector: '#menu' });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ hovered: true, selector: '#menu' });
    });
  });

  // ── browser_drag ───────────────────────────────────────────────────────

  describe('browser_drag', () => {
    it('drags from source to target via CDP', async () => {
      const t = new BrowserDragTool(client);
      const result = await t.invoke({ sourceSelector: '#src', targetSelector: '#tgt' });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ dragged: true, from: '#src', to: '#tgt' });
    });
  });
});

// ─── CDP Electon tools ──────────────────────────────────────────────────

describe('CDP Electron tools', () => {
  let client: CDPClient;

  beforeEach(() => {
    client = new CDPClient();
  });

  // ── cdp_launch ─────────────────────────────────────────────────────────

  describe('cdp_launch', () => {
    it('launches an Electron app and connects CDP', async () => {
      const t = new CDPLaunchTool(client);
      const result = await t.invoke({ appPath: '/path/to/app' });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ launched: true, appPath: '/path/to/app' });
      expect((result.data as { sessionId: string }).sessionId).toBeTruthy();
      expect(client.isConnected()).toBe(true);
    });

    it('passes cdpPort option', async () => {
      const t = new CDPLaunchTool(client);
      const result = await t.invoke({ appPath: '/app', cdpPort: 9333 });

      expect(result.success).toBe(true);
    });
  });

  // ── cdp_close ──────────────────────────────────────────────────────────

  describe('cdp_close', () => {
    it('disconnects CDP connection', async () => {
      const t = new CDPLaunchTool(client);
      await t.invoke({ appPath: '/app' });
      expect(client.isConnected()).toBe(true);

      const ct = new CDPCloseTool(client);
      const result = await ct.invoke({});

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ closed: true });
      expect(client.isConnected()).toBe(false);
    });
  });

  // ── cdp_execute_main ───────────────────────────────────────────────────

  describe('cdp_execute_main', () => {
    it('executes code via Runtime.evaluate', async () => {
      await client.connect({ targetType: 'electron' });
      const t = new CDPExecuteMainTool(client);
      const result = await t.invoke({ code: 'app.getVersion()' });

      expect(result.success).toBe(true);
    });
  });

  // ── cdp_trigger_ipc ────────────────────────────────────────────────────

  describe('cdp_trigger_ipc', () => {
    it('triggers IPC via Runtime.evaluate', async () => {
      await client.connect({ targetType: 'electron' });
      const t = new CDPTriggerIpcTool(client);
      const result = await t.invoke({
        channel: 'test-channel',
        payload: { key: 'value' },
      });

      expect(result.success).toBe(true);
      expect((result.data as { channel: string }).channel).toBe('test-channel');
    });

    it('sends without response by default', async () => {
      await client.connect({ targetType: 'electron' });
      const t = new CDPTriggerIpcTool(client);
      const result = await t.invoke({ channel: 'fire-and-forget' });

      expect(result.success).toBe(true);
    });

    it('returns error when CDP command fails', async () => {
      // Use a disconnected client to trigger error
      const disconnectedClient = new CDPClient();
      const t = new CDPTriggerIpcTool(disconnectedClient);
      const result = await t.invoke({ channel: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ── cdp_mock_dialog ────────────────────────────────────────────────────

  describe('cdp_mock_dialog', () => {
    it('mocks an alert dialog', async () => {
      await client.connect({ targetType: 'electron' });
      const t = new CDPMockDialogTool(client);
      const result = await t.invoke({ type: 'alert' });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ mocked: true, type: 'alert' });
    });

    it('mocks a prompt dialog with text response', async () => {
      await client.connect({ targetType: 'electron' });
      const t = new CDPMockDialogTool(client);
      const result = await t.invoke({ type: 'prompt', response: 'my answer' });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ mocked: true, type: 'prompt', response: 'my answer' });
    });

    it('mocks a dismiss for confirm dialog', async () => {
      await client.connect({ targetType: 'electron' });
      const t = new CDPMockDialogTool(client);
      const result = await t.invoke({ type: 'confirm', dismiss: true });

      expect(result.success).toBe(true);
      expect((result.data as { type: string }).type).toBe('confirm');
    });

    it('returns error when CDP command fails', async () => {
      // Use a disconnected client to trigger error
      const disconnectedClient = new CDPClient();
      const t = new CDPMockDialogTool(disconnectedClient);
      const result = await t.invoke({ type: 'alert' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
