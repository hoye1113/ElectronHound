import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPClient, getMCPClient, setMCPClient } from '../mcp/client.js';

describe('MCPClient', () => {
  let client: MCPClient;

  beforeEach(() => {
    client = new MCPClient();
  });

  describe('connect', () => {
    it('enters mock mode with empty config', async () => {
      await client.connect({});
      expect(client.isConnected()).toBe(true);
      expect(client.isMockMode()).toBe(true);
    });

    it('enters mock mode with legacy config (no real servers)', async () => {
      await client.connect({ playwrightCdpUrl: 'ws://localhost:9222' });
      expect(client.isConnected()).toBe(true);
      expect(client.isMockMode()).toBe(true);
    });

    it('is not connected before connect is called', () => {
      expect(client.isConnected()).toBe(false);
      expect(client.isMockMode()).toBe(false);
    });
  });

  describe('callTool in mock mode', () => {
    beforeEach(async () => {
      await client.connect({});
    });

    it('returns mock result for playwright tools', async () => {
      const result = await client.callTool('playwright', 'browser_snapshot', {});
      expect(result.success).toBe(true);
      expect(typeof result.result).toBe('string');
      expect(result.result).toContain('mock-playwright-browser_snapshot');
    });

    it('returns mock result for electron tools', async () => {
      const result = await client.callTool('electron', 'electron_main', { code: 'app.getVersion()' });
      expect(result.success).toBe(true);
      expect(result.result).toContain('mock-electron-electron_main');
    });

    it('includes args in mock result', async () => {
      const result = await client.callTool('playwright', 'browser_click', { element: 'Settings' });
      expect(result.result).toContain('Settings');
    });
  });

  describe('callTool when not connected', () => {
    it('returns failure when not connected', async () => {
      const result = await client.callTool('playwright', 'browser_snapshot', {});
      expect(result.success).toBe(false);
      expect(result.result).toBe('MCP client not connected');
    });
  });

  describe('disconnect', () => {
    it('resets connected state', async () => {
      await client.connect({});
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
      expect(client.isMockMode()).toBe(false);
    });

    it('callTool returns failure after disconnect', async () => {
      await client.connect({});
      await client.disconnect();

      const result = await client.callTool('playwright', 'browser_snapshot', {});
      expect(result.success).toBe(false);
    });
  });

  describe('getClient', () => {
    it('returns undefined in mock mode', async () => {
      await client.connect({});
      expect(client.getClient('playwright')).toBeUndefined();
      expect(client.getClient('electron')).toBeUndefined();
    });

    it('returns undefined before connect', () => {
      expect(client.getClient('playwright')).toBeUndefined();
    });
  });
});

describe('getMCPClient / setMCPClient', () => {
  it('getMCPClient returns a singleton', () => {
    const c1 = getMCPClient();
    const c2 = getMCPClient();
    expect(c1).toBe(c2);
  });

  it('setMCPClient replaces the singleton', () => {
    const original = getMCPClient();
    const replacement = new MCPClient();
    setMCPClient(replacement);
    expect(getMCPClient()).toBe(replacement);
    expect(getMCPClient()).not.toBe(original);
    // Restore original
    setMCPClient(original);
  });
});
