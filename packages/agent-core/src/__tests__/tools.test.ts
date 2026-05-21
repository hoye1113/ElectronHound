import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  ToolRegistry,
  SnapshotTool,
  ClickTool,
  TypeTool,
  NavigateTool,
  PressKeyTool,
  HoverTool,
  DragTool,
  createBrowserTools,
  LaunchElectronTool,
  CloseElectronTool,
  ExecuteMainTool,
  TriggerIpcTool,
  MockDialogTool,
  createElectronTools,
  ExecuteCodeTool,
  createExecutionTools,
} from '../tools/index.js';
import type { Tool, BrowserContext, ElectronContext, ExecutionContext } from '../tools/types.js';

function mockBrowserCtx(): BrowserContext {
  return {
    snapshot: vi.fn().mockResolvedValue({ aria: '<div>root</div>' }),
    click: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    navigate: vi.fn().mockResolvedValue(undefined),
    pressKey: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
    drag: vi.fn().mockResolvedValue(undefined),
  };
}

function mockElectronCtx(): ElectronContext {
  return {
    launch: vi.fn().mockResolvedValue({ pid: 1234 }),
    close: vi.fn().mockResolvedValue(undefined),
    executeMain: vi.fn().mockResolvedValue({ result: 'ok' }),
    triggerIpc: vi.fn().mockResolvedValue({ channel: 'test' }),
    mockDialog: vi.fn().mockResolvedValue(undefined),
  };
}

function mockExecutionCtx(): ExecutionContext {
  return { execute: vi.fn().mockResolvedValue({ stdout: 'hello' }) };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  beforeEach(() => { registry = new ToolRegistry(); });

  it('register and get tool', () => {
    const tool: Tool = { name: 't1', description: 'test', schema: z.object({}), invoke: vi.fn() };
    registry.register(tool);
    expect(registry.get('t1')).toBe(tool);
  });

  it('has checks existence', () => {
    expect(registry.has('x')).toBe(false);
    registry.register({ name: 'x', description: '', schema: z.object({}), invoke: vi.fn() });
    expect(registry.has('x')).toBe(true);
  });

  it('list returns all tool names', () => {
    registry.register({ name: 'a', description: '', schema: z.object({}), invoke: vi.fn() });
    registry.register({ name: 'b', description: '', schema: z.object({}), invoke: vi.fn() });
    expect(registry.list().sort()).toEqual(['a', 'b']);
  });

  it('unregister removes tool', () => {
    registry.register({ name: 'r', description: '', schema: z.object({}), invoke: vi.fn() });
    expect(registry.unregister('r')).toBe(true);
    expect(registry.has('r')).toBe(false);
  });

  it('unregister returns false for missing', () => {
    expect(registry.unregister('nope')).toBe(false);
  });

  it('register throws on duplicate', () => {
    registry.register({ name: 'd', description: '', schema: z.object({}), invoke: vi.fn() });
    expect(() => registry.register({ name: 'd', description: '', schema: z.object({}), invoke: vi.fn() })).toThrow('already registered');
  });

  it('invoke returns error for missing tool', async () => {
    const r = await registry.invoke('missing', {});
    expect(r.success).toBe(false);
    expect(r.error).toContain('not found');
  });

  it('invoke calls tool with validated params', async () => {
    const invokeFn = vi.fn().mockResolvedValue({ success: true, data: 'ok' });
    registry.register({ name: 'v', description: '', schema: z.object({ x: z.string() }), invoke: invokeFn });
    const r = await registry.invoke('v', { x: 'hello' });
    expect(r.success).toBe(true);
    expect(invokeFn).toHaveBeenCalledWith({ x: 'hello' });
  });

  it('invoke returns error on schema validation failure', async () => {
    registry.register({ name: 's', description: '', schema: z.object({ x: z.number() }), invoke: vi.fn() });
    const r = await registry.invoke('s', { x: 'not a number' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('Invalid params');
  });

  it('invoke catches thrown errors', async () => {
    registry.register({ name: 'e', description: '', schema: z.object({}), invoke: vi.fn().mockRejectedValue(new Error('boom')) });
    const r = await registry.invoke('e', {});
    expect(r.success).toBe(false);
    expect(r.error).toContain('boom');
  });

  it('registerAll registers multiple tools', () => {
    registry.registerAll([
      { name: 'a', description: '', schema: z.object({}), invoke: vi.fn() },
      { name: 'b', description: '', schema: z.object({}), invoke: vi.fn() },
    ]);
    expect(registry.list()).toHaveLength(2);
  });

  it('clear removes all tools', () => {
    registry.register({ name: 'c', description: '', schema: z.object({}), invoke: vi.fn() });
    registry.clear();
    expect(registry.list()).toHaveLength(0);
  });

  it('streamInvoke yields progress and done for non-streaming tools', async () => {
    registry.register({ name: 'ns', description: '', schema: z.object({}), invoke: vi.fn().mockResolvedValue({ success: true, data: 'ok' }) });
    const chunks = [];
    for await (const chunk of registry.streamInvoke('ns', {})) { chunks.push(chunk); }
    expect(chunks.some(c => c.type === 'progress')).toBe(true);
    expect(chunks.some(c => c.type === 'done')).toBe(true);
  });

  it('streamInvoke yields error for missing tool', async () => {
    const chunks = [];
    for await (const chunk of registry.streamInvoke('nope', {})) { chunks.push(chunk); }
    expect(chunks.some(c => c.type === 'error')).toBe(true);
  });

  it('withCDP factory creates registry with CDP tools', () => {
    const mockCDP = {
      connect: vi.fn(), disconnect: vi.fn(), isConnected: () => true,
      sendCommand: vi.fn(), createSession: vi.fn(), closeSession: vi.fn(),
      listSessions: () => [],
    };
    const reg = ToolRegistry.withCDP(mockCDP as any);
    expect(reg.list().length).toBeGreaterThanOrEqual(12);
  });
});

describe('Browser tools', () => {
  let ctx: BrowserContext;
  beforeEach(() => { ctx = mockBrowserCtx(); });

  it('createBrowserTools returns 7 tools', () => {
    expect(createBrowserTools(ctx)).toHaveLength(7);
  });

  it('SnapshotTool invokes context.snapshot', async () => {
    const t = new SnapshotTool(ctx);
    const r = await t.invoke({});
    expect(r.success).toBe(true);
    expect(ctx.snapshot).toHaveBeenCalled();
  });

  it('ClickTool invokes context.click', async () => {
    const t = new ClickTool(ctx);
    const r = await t.invoke({ selector: '#btn' });
    expect(r.success).toBe(true);
    expect(ctx.click).toHaveBeenCalledWith('#btn', expect.anything());
  });

  it('TypeTool invokes context.type', async () => {
    const t = new TypeTool(ctx);
    const r = await t.invoke({ selector: '#input', text: 'hello' });
    expect(r.success).toBe(true);
  });

  it('NavigateTool invokes context.navigate', async () => {
    const t = new NavigateTool(ctx);
    const r = await t.invoke({ url: 'http://test.com' });
    expect(r.success).toBe(true);
  });

  it('PressKeyTool invokes context.pressKey', async () => {
    const t = new PressKeyTool(ctx);
    const r = await t.invoke({ key: 'Enter' });
    expect(r.success).toBe(true);
  });

  it('HoverTool invokes context.hover', async () => {
    const t = new HoverTool(ctx);
    const r = await t.invoke({ selector: '#el' });
    expect(r.success).toBe(true);
  });

  it('DragTool invokes context.drag', async () => {
    const t = new DragTool(ctx);
    const r = await t.invoke({ sourceSelector: '#src', targetSelector: '#tgt' });
    expect(r.success).toBe(true);
  });

  it('tool failure returns success:false', async () => {
    const failCtx = { ...ctx, click: vi.fn().mockRejectedValue(new Error('not found')) };
    const t = new ClickTool(failCtx);
    const r = await t.invoke({ selector: '#missing' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('not found');
  });
});

describe('Electron tools', () => {
  let ctx: ElectronContext;
  beforeEach(() => { ctx = mockElectronCtx(); });

  it('createElectronTools returns 5 tools', () => {
    expect(createElectronTools(ctx)).toHaveLength(5);
  });

  it('LaunchElectronTool invokes context.launch', async () => {
    const t = new LaunchElectronTool(ctx);
    const r = await t.invoke({ appPath: '/app' });
    expect(r.success).toBe(true);
    expect(ctx.launch).toHaveBeenCalled();
  });

  it('CloseElectronTool invokes context.close', async () => {
    const t = new CloseElectronTool(ctx);
    const r = await t.invoke({});
    expect(r.success).toBe(true);
  });

  it('ExecuteMainTool invokes context.executeMain', async () => {
    const t = new ExecuteMainTool(ctx);
    const r = await t.invoke({ code: 'app.getVersion()' });
    expect(r.success).toBe(true);
  });

  it('TriggerIpcTool invokes context.triggerIpc', async () => {
    const t = new TriggerIpcTool(ctx);
    const r = await t.invoke({ channel: 'test-ch' });
    expect(r.success).toBe(true);
  });

  it('MockDialogTool invokes context.mockDialog', async () => {
    const t = new MockDialogTool(ctx);
    const r = await t.invoke({ type: 'alert' });
    expect(r.success).toBe(true);
  });
});

describe('Execution tools', () => {
  it('createExecutionTools returns 1 tool', () => {
    expect(createExecutionTools(mockExecutionCtx())).toHaveLength(1);
  });

  it('ExecuteCodeTool invokes context.execute', async () => {
    const ctx = mockExecutionCtx();
    const t = new ExecuteCodeTool(ctx);
    const r = await t.invoke({ code: 'console.log(1)' });
    expect(r.success).toBe(true);
    expect(ctx.execute).toHaveBeenCalledWith('console.log(1)', expect.anything());
  });
});
