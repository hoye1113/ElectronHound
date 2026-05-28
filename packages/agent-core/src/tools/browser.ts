/**
 * EATA Browser Tools
 *
 * 7 browser tools for Playwright CDP integration:
 * snapshot, click, type, navigate, press_key, hover, drag
 *
 * All tools extend BrowserTool base class and implement Tool.invoke().
 */

import { z } from 'zod';
import type {
  Tool,
  ToolResult,
  ToolParams,
  BrowserContext,
  SnapshotParams,
  ClickParams,
  TypeParams,
  NavigateParams,
  PressKeyParams,
  HoverParams,
  DragParams,
} from './types.js';

// ─── Zod schemas ────────────────────────────────────────────────────────

const snapshotSchema = z.object({
  format: z.enum(['aria', 'screenshot']).optional(),
});

const clickSchema = z.object({
  selector: z.string().min(1),
  button: z.enum(['left', 'right', 'middle']).optional().default('left'),
  clickCount: z.number().int().min(1).max(3).optional().default(1),
  timeout: z.number().int().positive().optional(),
});

const typeSchema = z.object({
  selector: z.string().min(1),
  text: z.string(),
  clear: z.boolean().optional().default(false),
  delay: z.number().nonnegative().optional(),
});

const navigateSchema = z.object({
  url: z.string().url(),
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).optional().default('load'),
  timeout: z.number().int().positive().optional(),
});

const pressKeySchema = z.object({
  key: z.string().min(1),
  selector: z.string().optional(),
});

const hoverSchema = z.object({
  selector: z.string().min(1),
  timeout: z.number().int().positive().optional(),
});

const dragSchema = z.object({
  sourceSelector: z.string().min(1),
  targetSelector: z.string().min(1),
  timeout: z.number().int().positive().optional(),
});

// ─── Base class ─────────────────────────────────────────────────────────

/**
 * Base class for browser tools.
 * Holds a reference to the injected BrowserContext for Playwright CDP.
 */
export abstract class BrowserTool implements Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly schema: z.ZodSchema<unknown>;

  constructor(protected readonly context: BrowserContext) {}

  abstract invoke(params: ToolParams): Promise<ToolResult>;
}

// ─── Concrete tools ─────────────────────────────────────────────────────

export class SnapshotTool extends BrowserTool {
  readonly name = 'snapshot';
  readonly description =
    'Take an accessibility snapshot or screenshot of the current page';
  readonly schema = snapshotSchema;

  async invoke(params: ToolParams): Promise<ToolResult> {
    const { format } = params as unknown as SnapshotParams;
    try {
      const data = await this.context.snapshot(format);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: `Snapshot failed: ${errMsg(err)}` };
    }
  }
}

export class ClickTool extends BrowserTool {
  readonly name = 'click';
  readonly description = 'Click an element on the page';
  readonly schema = clickSchema;

  async invoke(params: ToolParams): Promise<ToolResult> {
    const { selector, button, clickCount, timeout } = params as unknown as ClickParams;
    try {
      await this.context.click(selector, {
        button,
        clickCount,
        timeout,
      });
      return { success: true, data: { clicked: true, selector } };
    } catch (err) {
      return { success: false, error: `Click failed: ${errMsg(err)}` };
    }
  }
}

export class TypeTool extends BrowserTool {
  readonly name = 'type';
  readonly description = 'Type text into an input element';
  readonly schema = typeSchema;

  async invoke(params: ToolParams): Promise<ToolResult> {
    const { selector, text, clear, delay } = params as unknown as TypeParams;
    try {
      await this.context.type(selector, text, {
        clear,
        delay,
      });
      return { success: true, data: { typed: true, selector, text } };
    } catch (err) {
      return { success: false, error: `Type failed: ${errMsg(err)}` };
    }
  }
}

export class NavigateTool extends BrowserTool {
  readonly name = 'navigate';
  readonly description = 'Navigate to a URL';
  readonly schema = navigateSchema;

  async invoke(params: ToolParams): Promise<ToolResult> {
    const { url, waitUntil, timeout } = params as unknown as NavigateParams;
    try {
      await this.context.navigate(url, {
        waitUntil,
        timeout,
      });
      return { success: true, data: { navigated: true, url } };
    } catch (err) {
      return { success: false, error: `Navigate failed: ${errMsg(err)}` };
    }
  }
}

export class PressKeyTool extends BrowserTool {
  readonly name = 'press_key';
  readonly description = 'Press a keyboard key, optionally on a focused element';
  readonly schema = pressKeySchema;

  async invoke(params: ToolParams): Promise<ToolResult> {
    const { key, selector } = params as unknown as PressKeyParams;
    try {
      await this.context.pressKey(key, selector);
      return { success: true, data: { keyPressed: key } };
    } catch (err) {
      return { success: false, error: `PressKey failed: ${errMsg(err)}` };
    }
  }
}

export class HoverTool extends BrowserTool {
  readonly name = 'hover';
  readonly description = 'Hover over an element on the page';
  readonly schema = hoverSchema;

  async invoke(params: ToolParams): Promise<ToolResult> {
    const { selector, timeout } = params as unknown as HoverParams;
    try {
      await this.context.hover(selector, { timeout });
      return { success: true, data: { hovered: true, selector } };
    } catch (err) {
      return { success: false, error: `Hover failed: ${errMsg(err)}` };
    }
  }
}

export class DragTool extends BrowserTool {
  readonly name = 'drag';
  readonly description = 'Drag an element from source to target';
  readonly schema = dragSchema;

  async invoke(params: ToolParams): Promise<ToolResult> {
    const { sourceSelector, targetSelector, timeout } = params as unknown as DragParams;
    try {
      await this.context.drag(sourceSelector, targetSelector, {
        timeout,
      });
      return {
        success: true,
        data: { dragged: true, from: sourceSelector, to: targetSelector },
      };
    } catch (err) {
      return { success: false, error: `Drag failed: ${errMsg(err)}` };
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

/**
 * Create all 7 browser tools for the given browser context.
 */
export function createBrowserTools(context: BrowserContext): BrowserTool[] {
  return [
    new SnapshotTool(context),
    new ClickTool(context),
    new TypeTool(context),
    new NavigateTool(context),
    new PressKeyTool(context),
    new HoverTool(context),
    new DragTool(context),
  ];
}

// ─── Helpers ────────────────────────────────────────────────────────────

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
