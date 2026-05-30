/**
 * VLM Fallback Tests
 *
 * Tests for the Vision Language Model fallback that activates when
 * the AXTree is insufficient (e.g., Canvas/WebGL apps with minimal
 * accessibility nodes).
 */

import { describe, it, expect } from 'vitest';
import {
  isAXTreeSufficient,
  convertVLMResponseToReport,
  type VLMElement,
} from '../observe/vlmFallback.js';
import type { AXNode } from '../observe/axtreeCompressor.js';

// ── Test fixtures ──────────────────────────────────────────────────────────

function createAXNode(role: string, name?: string, children?: AXNode[]): AXNode {
  return { role, name, children };
}

// ── isAXTreeSufficient ─────────────────────────────────────────────────────

describe('isAXTreeSufficient', () => {
  it('should return false for null tree', () => {
    expect(isAXTreeSufficient(null)).toBe(false);
  });

  it('should return false for single node tree', () => {
    const tree = createAXNode('application', 'App');
    expect(isAXTreeSufficient(tree)).toBe(false);
  });

  it('should return false for two node tree', () => {
    const tree = createAXNode('application', 'App', [
      createAXNode('button', 'Click'),
    ]);
    expect(isAXTreeSufficient(tree)).toBe(false);
  });

  it('should return true for three node tree', () => {
    const tree = createAXNode('application', 'App', [
      createAXNode('button', 'Click'),
      createAXNode('text', 'Label'),
    ]);
    expect(isAXTreeSufficient(tree)).toBe(true);
  });

  it('should return true for large tree', () => {
    const tree = createAXNode('application', 'App', [
      createAXNode('menubar', 'Menu', [
        createAXNode('menuitem', 'File'),
        createAXNode('menuitem', 'Edit'),
      ]),
      createAXNode('main', 'Content', [
        createAXNode('button', 'Submit'),
        createAXNode('textbox', 'Name'),
      ]),
    ]);
    expect(isAXTreeSufficient(tree)).toBe(true);
  });

  it('should use custom threshold', () => {
    const tree = createAXNode('application', 'App', [
      createAXNode('button', 'Click'),
      createAXNode('text', 'Label'),
    ]);
    // With threshold 5, tree with 3 nodes should be insufficient
    expect(isAXTreeSufficient(tree, 5)).toBe(false);
    // With threshold 2, tree with 3 nodes should be sufficient
    expect(isAXTreeSufficient(tree, 2)).toBe(true);
  });
});

// ── convertVLMResponseToReport ─────────────────────────────────────────────

describe('convertVLMResponseToReport', () => {
  it('should convert empty array to empty report', () => {
    const elements: VLMElement[] = [];
    const report = convertVLMResponseToReport(elements);

    expect(report.elements).toEqual([]);
    expect(report.summary).toBe('No UI elements detected');
    expect(report.source).toBe('vlm');
  });

  it('should convert single element', () => {
    const elements: VLMElement[] = [
      { role: 'button', name: 'Submit', description: 'A blue submit button', bounds: { x: 100, y: 200, width: 120, height: 40 } },
    ];
    const report = convertVLMResponseToReport(elements);

    expect(report.elements).toHaveLength(1);
    expect(report.elements[0].role).toBe('button');
    expect(report.elements[0].name).toBe('Submit');
    expect(report.elements[0].description).toBe('A blue submit button');
    expect(report.elements[0].bounds).toEqual({ x: 100, y: 200, width: 120, height: 40 });
    expect(report.source).toBe('vlm');
  });

  it('should convert multiple elements', () => {
    const elements: VLMElement[] = [
      { role: 'button', name: 'Login', description: 'Login button', bounds: { x: 0, y: 0, width: 100, height: 50 } },
      { role: 'textbox', name: 'Username', description: 'Username input field', bounds: { x: 0, y: 60, width: 200, height: 30 } },
      { role: 'textbox', name: 'Password', description: 'Password input field', bounds: { x: 0, y: 100, width: 200, height: 30 } },
    ];
    const report = convertVLMResponseToReport(elements);

    expect(report.elements).toHaveLength(3);
    expect(report.summary).toContain('3 UI elements');
    expect(report.source).toBe('vlm');
  });

  it('should generate summary with role breakdown', () => {
    const elements: VLMElement[] = [
      { role: 'button', name: 'A', description: '', bounds: { x: 0, y: 0, width: 10, height: 10 } },
      { role: 'button', name: 'B', description: '', bounds: { x: 0, y: 0, width: 10, height: 10 } },
      { role: 'textbox', name: 'C', description: '', bounds: { x: 0, y: 0, width: 10, height: 10 } },
    ];
    const report = convertVLMResponseToReport(elements);

    expect(report.summary).toContain('2 button');
    expect(report.summary).toContain('1 textbox');
  });

  it('should handle elements with missing optional fields', () => {
    const elements: VLMElement[] = [
      { role: 'button', name: '', description: '', bounds: { x: 0, y: 0, width: 0, height: 0 } },
    ];
    const report = convertVLMResponseToReport(elements);

    expect(report.elements).toHaveLength(1);
    expect(report.elements[0].role).toBe('button');
  });
});

// ── VLMResponse parsing ────────────────────────────────────────────────────

describe('VLM response parsing', () => {
  it('should parse valid JSON array response', async () => {
    const { parseVLMResponse } = await import('../observe/vlmFallback.js');

    const response = JSON.stringify([
      { role: 'button', name: 'OK', description: 'OK button', bounds: { x: 10, y: 20, width: 100, height: 40 } },
    ]);

    const elements = parseVLMResponse(response);
    expect(elements).toHaveLength(1);
    expect(elements[0].role).toBe('button');
  });

  it('should parse JSON wrapped in markdown code block', async () => {
    const { parseVLMResponse } = await import('../observe/vlmFallback.js');

    const response = '```json\n[\n  { "role": "button", "name": "OK", "description": "OK button", "bounds": { "x": 10, "y": 20, "width": 100, "height": 40 } }\n]\n```';

    const elements = parseVLMResponse(response);
    expect(elements).toHaveLength(1);
    expect(elements[0].name).toBe('OK');
  });

  it('should return empty array for unparseable response', async () => {
    const { parseVLMResponse } = await import('../observe/vlmFallback.js');

    const elements = parseVLMResponse('This is not JSON at all');
    expect(elements).toEqual([]);
  });

  it('should filter out invalid elements', async () => {
    const { parseVLMResponse } = await import('../observe/vlmFallback.js');

    const response = JSON.stringify([
      { role: 'button', name: 'Valid', description: 'Valid button', bounds: { x: 0, y: 0, width: 10, height: 10 } },
      { invalid: true },
      { role: 'textbox', name: 'Also Valid', description: 'Input', bounds: { x: 0, y: 0, width: 10, height: 10 } },
    ]);

    const elements = parseVLMResponse(response);
    expect(elements).toHaveLength(2);
  });
});

// ── VLM prompt generation ──────────────────────────────────────────────────

describe('VLM prompt generation', () => {
  it('should generate default prompt when no goal provided', async () => {
    const { buildVLMPrompt } = await import('../observe/vlmFallback.js');

    const prompt = buildVLMPrompt();
    expect(prompt).toContain('Analyze this screenshot and describe all UI elements visible');
    expect(prompt).toContain('role');
    expect(prompt).toContain('bounds');
  });

  it('should include goal in prompt when provided', async () => {
    const { buildVLMPrompt } = await import('../observe/vlmFallback.js');

    const prompt = buildVLMPrompt('click the login button');
    expect(prompt).toContain('click the login button');
    expect(prompt).toContain('Analyze this screenshot and describe all UI elements visible');
  });
});
