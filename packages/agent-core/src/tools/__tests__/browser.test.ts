/**
 * Browser tools tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserContext } from '../types.js';
import {
  createBrowserTools,
  SnapshotTool,
  ClickTool,
  TypeTool,
  NavigateTool,
  PressKeyTool,
  HoverTool,
  DragTool,
} from '../browser.js';

// ─── Mock context ───────────────────────────────────────────────────────

function createMockBrowserContext(): BrowserContext {
  return {
    snapshot: vi.fn().mockResolvedValue({ tree: '<div>page</div>' }),
    click: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    navigate: vi.fn().mockResolvedValue(undefined),
    pressKey: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
    drag: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('Browser tools', () => {
  let ctx: BrowserContext;

  beforeEach(() => {
    ctx = createMockBrowserContext();
    vi.clearAllMocks();
  });

  describe('createBrowserTools', () => {
    it('creates all 7 browser tools', () => {
      const tools = createBrowserTools(ctx);
      expect(tools).toHaveLength(7);

      const names = tools.map((t) => t.name);
      expect(names).toContain('snapshot');
      expect(names).toContain('click');
      expect(names).toContain('type');
      expect(names).toContain('navigate');
      expect(names).toContain('press_key');
      expect(names).toContain('hover');
      expect(names).toContain('drag');
    });
  });

  // ── snapshot ──────────────────────────────────────────────────────────

  describe('snapshot', () => {
    const tool = () => new SnapshotTool(createMockBrowserContext());

    it('returns success with snapshot data', async () => {
      const t = new SnapshotTool(ctx);
      const result = await t.invoke({ format: 'aria' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ tree: '<div>page</div>' });
      expect(ctx.snapshot).toHaveBeenCalledWith('aria');
    });

    it('handles context error', async () => {
      (ctx.snapshot as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('CDP fail'));
      const t = new SnapshotTool(ctx);
      const result = await t.invoke({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('CDP fail');
    });
  });

  // ── click ─────────────────────────────────────────────────────────────

  describe('click', () => {
    it('clicks an element', async () => {
      const t = new ClickTool(ctx);
      const result = await t.invoke({ selector: '#btn', button: 'left', clickCount: 1 });

      expect(result.success).toBe(true);
      expect(ctx.click).toHaveBeenCalledWith('#btn', { button: 'left', clickCount: 1, timeout: undefined });
    });

    it('handles click error', async () => {
      (ctx.click as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Timeout'));
      const t = new ClickTool(ctx);
      const result = await t.invoke({ selector: '#btn' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Timeout');
    });
  });

  // ── type ──────────────────────────────────────────────────────────────

  describe('type', () => {
    it('types text into an element', async () => {
      const t = new TypeTool(ctx);
      const result = await t.invoke({ selector: '#input', text: 'hello', clear: true });

      expect(result.success).toBe(true);
      expect(ctx.type).toHaveBeenCalledWith('#input', 'hello', { clear: true, delay: undefined });
    });
  });

  // ── navigate ──────────────────────────────────────────────────────────

  describe('navigate', () => {
    it('navigates to a URL', async () => {
      const t = new NavigateTool(ctx);
      const result = await t.invoke({ url: 'https://example.com' });

      expect(result.success).toBe(true);
      expect(ctx.navigate).toHaveBeenCalledWith('https://example.com', {
        waitUntil: undefined,
        timeout: undefined,
      });
    });

    it('handles navigation error', async () => {
      (ctx.navigate as ReturnType<typeof vi.fn>).mockRejectedValue('DNS error');
      const t = new NavigateTool(ctx);
      const result = await t.invoke({ url: 'https://bad.url' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('DNS error');
    });
  });

  // ── press_key ─────────────────────────────────────────────────────────

  describe('press_key', () => {
    it('presses a key', async () => {
      const t = new PressKeyTool(ctx);
      const result = await t.invoke({ key: 'Enter' });

      expect(result.success).toBe(true);
      expect(ctx.pressKey).toHaveBeenCalledWith('Enter', undefined);
    });

    it('presses a key on a specific selector', async () => {
      const t = new PressKeyTool(ctx);
      const result = await t.invoke({ key: 'Tab', selector: '#field' });

      expect(result.success).toBe(true);
      expect(ctx.pressKey).toHaveBeenCalledWith('Tab', '#field');
    });
  });

  // ── hover ─────────────────────────────────────────────────────────────

  describe('hover', () => {
    it('hovers over an element', async () => {
      const t = new HoverTool(ctx);
      const result = await t.invoke({ selector: '#menu' });

      expect(result.success).toBe(true);
      expect(ctx.hover).toHaveBeenCalledWith('#menu', { timeout: undefined });
    });
  });

  // ── drag ──────────────────────────────────────────────────────────────

  describe('drag', () => {
    it('drags from source to target', async () => {
      const t = new DragTool(ctx);
      const result = await t.invoke({ sourceSelector: '#src', targetSelector: '#tgt' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ dragged: true, from: '#src', to: '#tgt' });
      expect(ctx.drag).toHaveBeenCalledWith('#src', '#tgt', { timeout: undefined });
    });

    it('handles drag error', async () => {
      (ctx.drag as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'));
      const t = new DragTool(ctx);
      const result = await t.invoke({ sourceSelector: '#a', targetSelector: '#b' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not found');
    });
  });
});
