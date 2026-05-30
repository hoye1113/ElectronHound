/**
 * VLM Fallback Service
 *
 * Provides vision-based UI analysis when the accessibility tree (AXTree)
 * is insufficient. This is common in Canvas/WebGL applications that render
 * UI elements without standard accessibility nodes.
 *
 * Flow:
 * 1. Check if AXTree has sufficient nodes (< 3 = insufficient)
 * 2. If insufficient, take screenshot via MCP
 * 3. Send screenshot to VLM (Vision Language Model) for analysis
 * 4. Convert VLM response to AccessibilityReport format
 *
 * @example
 * ```ts
 * const fallback = new VLMFallbackService(vlmProvider, mcpClient);
 * const report = await fallback.analyze(tree, goal);
 * if (report) {
 *   // VLM analysis was used
 *   console.log(report.elements);
 * }
 * ```
 */

import type { AXNode } from './axtreeCompressor.js';
import type { VLMProvider, ImageContent } from '../llm/vlm-provider.js';
import type { MCPClient } from '../mcp/client.js';
import { countNodes } from './axtreeCompressor.js';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Element detected by the VLM.
 */
export interface VLMElement {
  /** ARIA-like role (e.g., 'button', 'textbox', 'link') */
  role: string;
  /** Accessible name or label */
  name: string;
  /** Description of the element */
  description: string;
  /** Bounding box in screen coordinates */
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Accessibility report generated from VLM analysis.
 */
export interface AccessibilityReport {
  /** Detected UI elements */
  elements: VLMElement[];
  /** Human-readable summary */
  summary: string;
  /** Source of the report */
  source: 'vlm';
}

/**
 * Options for VLM fallback analysis.
 */
export interface VLMFallbackOptions {
  /** Minimum node count threshold (default: 3) */
  threshold?: number;
  /** Custom VLM prompt */
  prompt?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Default threshold for AXTree sufficiency */
const DEFAULT_THRESHOLD = 3;

/** Default VLM prompt for UI analysis */
const DEFAULT_VLM_PROMPT = `Analyze this screenshot and describe all UI elements visible.

Return a JSON array of objects with these fields:
- role: ARIA-like role (button, textbox, link, heading, label, image, etc.)
- name: The text label or accessible name of the element
- description: Brief description of the element's appearance or purpose
- bounds: Object with { x, y, width, height } in pixels

Example:
[
  { "role": "button", "name": "Submit", "description": "Blue submit button", "bounds": { "x": 100, "y": 200, "width": 120, "height": 40 } },
  { "role": "textbox", "name": "Email", "description": "Email input field", "bounds": { "x": 100, "y": 150, "width": 200, "height": 30 } }
]

Return ONLY the JSON array, no other text.`;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Check if an AXTree has sufficient nodes for meaningful analysis.
 *
 * @param tree - The accessibility tree to check
 * @param threshold - Minimum node count (default: 3)
 * @returns True if the tree has enough nodes
 */
export function isAXTreeSufficient(tree: AXNode | null, threshold: number = DEFAULT_THRESHOLD): boolean {
  if (!tree) return false;
  return countNodes(tree) >= threshold;
}

/**
 * Parse a VLM response string into an array of VLMElement objects.
 *
 * Handles various response formats:
 * - Direct JSON array
 * - JSON wrapped in markdown code blocks
 * - Mixed text with JSON embedded
 *
 * @param response - Raw VLM response string
 * @returns Parsed VLMElement array (empty if parsing fails)
 */
export function parseVLMResponse(response: string): VLMElement[] {
  // Try direct JSON parse
  try {
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) {
      return filterValidElements(parsed);
    }
  } catch {
    // continue
  }

  // Try markdown code block
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch?.[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (Array.isArray(parsed)) {
        return filterValidElements(parsed);
      }
    } catch {
      // continue
    }
  }

  // Try to find JSON array in the response
  const jsonArrayMatch = response.match(/\[[\s\S]*\]/);
  if (jsonArrayMatch) {
    try {
      const parsed = JSON.parse(jsonArrayMatch[0]);
      if (Array.isArray(parsed)) {
        return filterValidElements(parsed);
      }
    } catch {
      // continue
    }
  }

  return [];
}

/**
 * Convert an array of VLMElement to an AccessibilityReport.
 *
 * @param elements - VLM elements to convert
 * @returns AccessibilityReport with summary
 */
export function convertVLMResponseToReport(elements: VLMElement[]): AccessibilityReport {
  if (elements.length === 0) {
    return {
      elements: [],
      summary: 'No UI elements detected',
      source: 'vlm',
    };
  }

  // Count elements by role
  const roleCounts = new Map<string, number>();
  for (const element of elements) {
    const count = roleCounts.get(element.role) || 0;
    roleCounts.set(element.role, count + 1);
  }

  // Build summary with role breakdown
  const roleSummary = Array.from(roleCounts.entries())
    .map(([role, count]) => `${count} ${role}${count > 1 ? 's' : ''}`)
    .join(', ');

  return {
    elements,
    summary: `Detected ${elements.length} UI elements: ${roleSummary}`,
    source: 'vlm',
  };
}

/**
 * Build a VLM prompt for UI analysis.
 *
 * @param goal - Optional goal to include in the prompt
 * @returns Formatted prompt string
 */
export function buildVLMPrompt(goal?: string): string {
  if (!goal) {
    return DEFAULT_VLM_PROMPT;
  }

  return `Analyze this screenshot and describe all UI elements visible. Focus on elements relevant to: "${goal}"

Return a JSON array of objects with these fields:
- role: ARIA-like role (button, textbox, link, heading, label, image, etc.)
- name: The text label or accessible name of the element
- description: Brief description of the element's appearance or purpose
- bounds: Object with { x, y, width, height } in pixels

Return ONLY the JSON array, no other text.`;
}

// ── VLMFallbackService ─────────────────────────────────────────────────────

/**
 * Service that provides vision-based UI analysis when AXTree is insufficient.
 *
 * @example
 * ```ts
 * const service = new VLMFallbackService(vlmProvider, mcpClient);
 * const report = await service.analyze(axtree, 'click login button');
 * ```
 */
export class VLMFallbackService {
  private readonly vlmProvider: VLMProvider;
  private readonly mcpClient: MCPClient | undefined;

  constructor(vlmProvider: VLMProvider, mcpClient?: MCPClient) {
    this.vlmProvider = vlmProvider;
    this.mcpClient = mcpClient;
  }

  /**
   * Analyze the UI using VLM if AXTree is insufficient.
   *
   * @param tree - Current AXTree
   * @param goal - Task goal for context
   * @param options - Optional configuration
   * @returns AccessibilityReport if VLM was used, null if AXTree is sufficient
   */
  async analyze(
    tree: AXNode | null,
    goal: string,
    options?: VLMFallbackOptions,
  ): Promise<AccessibilityReport | null> {
    const threshold = options?.threshold ?? DEFAULT_THRESHOLD;

    // Check if AXTree is sufficient
    if (isAXTreeSufficient(tree, threshold)) {
      return null;
    }

    // Take screenshot via MCP
    const screenshot = await this.takeScreenshot();
    if (!screenshot) {
      return null;
    }

    // Build prompt
    const prompt = options?.prompt ?? buildVLMPrompt(goal);

    // Send to VLM for analysis
    const response = await this.vlmProvider.generateWithVision({
      prompt,
      images: [screenshot],
      maxTokens: 2000,
    });

    // Parse response
    const elements = parseVLMResponse(response.text);

    // Convert to report
    return convertVLMResponseToReport(elements);
  }

  /**
   * Take a screenshot via MCP client.
   *
   * @returns ImageContent or null if screenshot fails
   */
  private async takeScreenshot(): Promise<ImageContent | null> {
    if (!this.mcpClient) {
      return null;
    }

    try {
      const result = await this.mcpClient.callTool('playwright', 'browser_screenshot', {});

      if (result.success && result.result) {
        const screenshotData = result.result as { data?: string; mimeType?: string };

        if (screenshotData.data) {
          return {
            data: screenshotData.data,
            mimeType: (screenshotData.mimeType as ImageContent['mimeType']) || 'image/png',
          };
        }
      }
    } catch {
      // Screenshot failed, return null
    }

    return null;
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Filter and validate VLM elements.
 *
 * @param items - Raw parsed items
 * @returns Validated VLMElement array
 */
function filterValidElements(items: unknown[]): VLMElement[] {
  return items.filter(isValidVLMElement) as VLMElement[];
}

/**
 * Type guard for valid VLMElement.
 *
 * @param item - Item to validate
 * @returns True if item is a valid VLMElement
 */
function isValidVLMElement(item: unknown): item is VLMElement {
  if (!item || typeof item !== 'object') return false;

  const obj = item as Record<string, unknown>;

  return (
    typeof obj.role === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    isValidBounds(obj.bounds)
  );
}

/**
 * Type guard for valid bounds object.
 *
 * @param bounds - Bounds to validate
 * @returns True if bounds is valid
 */
function isValidBounds(bounds: unknown): bounds is VLMElement['bounds'] {
  if (!bounds || typeof bounds !== 'object') return false;

  const obj = bounds as Record<string, unknown>;

  return (
    typeof obj.x === 'number' &&
    typeof obj.y === 'number' &&
    typeof obj.width === 'number' &&
    typeof obj.height === 'number'
  );
}
