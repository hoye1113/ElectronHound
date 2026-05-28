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
 * @template P - The parameter type for this tool (defaults to ToolParams).
 */
export abstract class BrowserTool<P = ToolParams> implements Tool<P> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly schema: z.ZodSchema<unknown>;

  constructor(protected readonly context: BrowserContext) {}

  abstract invoke(params: P): Promise<ToolResult>;
}

// ─── Concrete tools ─────────────────────────────────────────────────────

export class SnapshotTool extends BrowserTool<SnapshotParams> {
  readonly name = 'snapshot';
  readonly description =
    'Take an accessibility snapshot or screenshot of the current page';
  readonly schema = snapshotSchema;

  async invoke(params: SnapshotParams): Promise<ToolResult> {
    try {
      const data = await this.context.snapshot(params.format);
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: `Snapshot failed: ${errMsg(err)}` };
    }
  }
}

export class ClickTool extends BrowserTool<ClickParams> {
  readonly name = 'click';
  readonly description = 'Click an element on the page';
  readonly schema = clickSchema;

  async invoke(params: ClickParams): Promise<ToolResult> {
    try {
      await this.context.click(params.selector, {
        button: params.button,
        clickCount: params.clickCount,
        timeout: params.timeout,
      });
      return { success: true, data: { clicked: true, selector: params.selector } };
    } catch (err: unknown) {
      return { success: false, error: `Click failed: ${errMsg(err)}` };
    }
  }
}

export class TypeTool extends BrowserTool<TypeParams> {
  readonly name = 'type';
  readonly description = 'Type text into an input element';
  readonly schema = typeSchema;

  async invoke(params: TypeParams): Promise<ToolResult> {
    try {
      await this.context.type(params.selector, params.text, {
        clear: params.clear,
        delay: params.delay,
      });
      return { success: true, data: { typed: true, selector: params.selector, text: params.text } };
    } catch (err: unknown) {
      return { success: false, error: `Type failed: ${errMsg(err)}` };
    }
  }
}

export class NavigateTool extends BrowserTool<NavigateParams> {
  readonly name = 'navigate';
  readonly description = 'Navigate to a URL';
  readonly schema = navigateSchema;

  async invoke(params: NavigateParams): Promise<ToolResult> {
    try {
      await this.context.navigate(params.url, {
        waitUntil: params.waitUntil,
        timeout: params.timeout,
      });
      return { success: true, data: { navigated: true, url: params.url } };
    } catch (err: unknown) {
      return { success: false, error: `Navigate failed: ${errMsg(err)}` };
    }
  }
}

export class PressKeyTool extends BrowserTool<PressKeyParams> {
  readonly name = 'press_key';
  readonly description = 'Press a keyboard key, optionally on a focused element';
  readonly schema = pressKeySchema;

  async invoke(params: PressKeyParams): Promise<ToolResult> {
    try {
      await this.context.pressKey(params.key, params.selector);
      return { success: true, data: { keyPressed: params.key } };
    } catch (err: unknown) {
      return { success: false, error: `PressKey failed: ${errMsg(err)}` };
    }
  }
}

export class HoverTool extends BrowserTool<HoverParams> {
  readonly name = 'hover';
  readonly description = 'Hover over an element on the page';
  readonly schema = hoverSchema;

  async invoke(params: HoverParams): Promise<ToolResult> {
    try {
      await this.context.hover(params.selector, { timeout: params.timeout });
      return { success: true, data: { hovered: true, selector: params.selector } };
    } catch (err: unknown) {
      return { success: false, error: `Hover failed: ${errMsg(err)}` };
    }
  }
}

export class DragTool extends BrowserTool<DragParams> {
  readonly name = 'drag';
  readonly description = 'Drag an element from source to target';
  readonly schema = dragSchema;

  async invoke(params: DragParams): Promise<ToolResult> {
    try {
      await this.context.drag(params.sourceSelector, params.targetSelector, {
        timeout: params.timeout,
      });
      return {
        success: true,
        data: { dragged: true, from: params.sourceSelector, to: params.targetSelector },
      };
    } catch (err: unknown) {
      return { success: false, error: `Drag failed: ${errMsg(err)}` };
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

/**
 * Create all 7 browser tools for the given browser context.
 */
export function createBrowserTools(context: BrowserContext): Tool[] {
  return [
    new SnapshotTool(context),
    new ClickTool(context),
    new TypeTool(context),
    new NavigateTool(context),
    new PressKeyTool(context),
    new HoverTool(context),
    new DragTool(context),
  ] as Tool[];
}

// ─── Helpers ────────────────────────────────────────────────────────────

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
