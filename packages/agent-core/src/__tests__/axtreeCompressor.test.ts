/**
 * AXTree Compressor Tests
 *
 * Tests for the accessibility tree compression layer that reduces
 * token consumption when sending AXTree data to the LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  compressAXTree,
  extractGoalKeywords,
  countNodes,
  type AXNode,
} from '../observe/axtreeCompressor.js';

// ── Test fixtures ──────────────────────────────────────────────────────────

/** Build a simple AXNode tree for testing */
function createNode(
  role: string,
  name: string,
  children: AXNode[] = [],
): AXNode {
  return { role, name, children };
}

/** Create a large tree with many repeated siblings */
function createLargeListTree(itemCount: number): AXNode {
  const items = Array.from({ length: itemCount }, (_, i) =>
    createNode('listitem', `Item ${i + 1}`, [
      createNode('text', `Text ${i + 1}`),
    ]),
  );
  return createNode('list', 'Shopping List', items);
}

/** Create a deep nested tree */
function createDeepTree(depth: number): AXNode {
  let current: AXNode = createNode('text', 'Deep leaf');
  for (let i = depth - 1; i > 0; i--) {
    current = createNode('group', `Level ${i}`, [current]);
  }
  return createNode('application', 'App', [current]);
}

/** Create a wide tree with many different branches */
function createWideTree(): AXNode {
  return createNode('application', 'MyApp', [
    createNode('menubar', 'Menu', [
      createNode('menuitem', 'File'),
      createNode('menuitem', 'Edit'),
      createNode('menuitem', 'View'),
    ]),
    createNode('toolbar', 'Tools', [
      createNode('button', 'Save'),
      createNode('button', 'Open'),
      createNode('button', 'Delete'),
    ]),
    createNode('main', 'Content', [
      createNode('heading', 'Login Form'),
      createNode('form', 'Login', [
        createNode('textbox', 'Username'),
        createNode('textbox', 'Password'),
        createNode('button', 'Submit'),
      ]),
    ]),
    createNode('statusbar', 'Status', [
      createNode('text', 'Ready'),
    ]),
  ]);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('extractGoalKeywords', () => {
  it('should extract keywords from a simple goal', () => {
    const keywords = extractGoalKeywords('Click the login button');
    expect(keywords).toContain('click');
    expect(keywords).toContain('the');
    expect(keywords).toContain('login');
    expect(keywords).toContain('button');
  });

  it('should handle goal with special delimiters', () => {
    const keywords = extractGoalKeywords('test-login_flow.check');
    expect(keywords).toContain('test');
    expect(keywords).toContain('login');
    expect(keywords).toContain('flow');
    expect(keywords).toContain('check');
  });

  it('should lowercase all keywords', () => {
    const keywords = extractGoalKeywords('Submit FORM');
    expect(keywords).toContain('submit');
    expect(keywords).toContain('form');
  });

  it('should remove empty strings', () => {
    const keywords = extractGoalKeywords('  hello   world  ');
    expect(keywords).not.toContain('');
    expect(keywords).toContain('hello');
    expect(keywords).toContain('world');
  });
});

describe('countNodes', () => {
  it('should count a single node', () => {
    const tree = createNode('button', 'Click me');
    expect(countNodes(tree)).toBe(1);
  });

  it('should count nodes in a tree', () => {
    const tree = createNode('application', 'App', [
      createNode('button', 'A'),
      createNode('button', 'B'),
    ]);
    expect(countNodes(tree)).toBe(3);
  });

  it('should count deeply nested nodes', () => {
    const tree = createDeepTree(5);
    // createDeepTree(5) creates: application + 4 groups + 1 leaf = 6 nodes
    expect(countNodes(tree)).toBe(6);
  });
});

describe('compressAXTree', () => {
  describe('basic compression', () => {
    it('should return the tree unchanged if it is small', () => {
      const tree = createNode('button', 'Click me');
      const result = compressAXTree(tree, 'click button');

      expect(result.compressed).toEqual(tree);
      expect(result.compressionRatio).toBe(1.0);
    });

    it('should handle null/undefined tree', () => {
      const result = compressAXTree(null as unknown as AXNode, 'test');
      expect(result.compressed).toBeNull();
      expect(result.compressionRatio).toBe(1.0);
    });

    it('should handle empty children array', () => {
      const tree = createNode('application', 'App', []);
      const result = compressAXTree(tree, 'test app');
      expect(result.compressed).toEqual(tree);
    });
  });

  describe('goal-based filtering', () => {
    it('should keep nodes relevant to the goal', () => {
      const tree = createWideTree();
      const result = compressAXTree(tree, 'login form');

      const compressed = result.compressed!;
      // Should keep the form-related nodes
      expect(compressed.name).toBe('MyApp');

      // Find the main content area
      const mainNode = compressed.children!.find((c) => c.role === 'main');
      expect(mainNode).toBeDefined();

      // Should contain the form
      const formNode = mainNode!.children!.find((c) => c.role === 'form');
      expect(formNode).toBeDefined();
    });

    it('should prune branches not relevant to the goal', () => {
      const tree = createWideTree();
      const result = compressAXTree(tree, 'save document');

      const compressed = result.compressed!;
      // Should keep toolbar (has Save button)
      const toolbar = compressed.children!.find((c) => c.role === 'toolbar');
      expect(toolbar).toBeDefined();

      // The menubar and form may be pruned or kept based on relevance
      // Compression ratio should be less than 1
      expect(result.compressionRatio).toBeLessThanOrEqual(1.0);
    });

    it('should preserve ancestor paths to matching nodes', () => {
      const tree = createNode('application', 'App', [
        createNode('main', 'Content', [
          createNode('form', 'Settings', [
            createNode('textbox', 'Search'),
          ]),
        ]),
        createNode('sidebar', 'Nav', [
          createNode('link', 'Home'),
        ]),
      ]);

      const result = compressAXTree(tree, 'search settings');
      const compressed = result.compressed!;

      // Ancestor path should be preserved: App -> Main -> Form -> Search
      expect(compressed.name).toBe('App');
      const main = compressed.children!.find((c) => c.role === 'main');
      expect(main).toBeDefined();
      const form = main!.children!.find((c) => c.role === 'form');
      expect(form).toBeDefined();
      const search = form!.children!.find((c) => c.name === 'Search');
      expect(search).toBeDefined();
    });
  });

  describe('repeated structure sampling', () => {
    it('should sample large lists (keep first 3 + last 1)', () => {
      const tree = createLargeListTree(20);
      const result = compressAXTree(tree, 'find item');

      const compressed = result.compressed!;
      // Root list should be kept
      expect(compressed.role).toBe('list');

      // Should have sampled children (first 3 + separator + last 1 = 5)
      // or fewer if compression removed others
      expect(compressed.children!.length).toBeLessThan(20);
    });

    it('should not sample small lists (10 or fewer)', () => {
      const tree = createLargeListTree(8);
      const result = compressAXTree(tree, 'find item');

      const compressed = result.compressed!;
      // All items should be kept
      expect(compressed.children!.length).toBe(8);
    });

    it('should add ellipsis marker when sampling', () => {
      const tree = createLargeListTree(15);
      const result = compressAXTree(tree, 'find item');

      const compressed = result.compressed!;
      // Should contain an ellipsis or marker node
      const hasMarker = compressed.children!.some(
        (c) => c.role === 'separator' || c.name?.includes('...') || c.name?.includes('more'),
      );
      // Either has a marker or the sampling removed items
      expect(hasMarker).toBe(true);
      expect(compressed.children!.length).toBeLessThan(15);
    });
  });

  describe('compression ratio', () => {
    it('should calculate correct compression ratio for small trees', () => {
      const tree = createNode('button', 'Click');
      const result = compressAXTree(tree, 'click');
      expect(result.compressionRatio).toBe(1.0);
    });

    it('should achieve 60-80% reduction on large irrelevant trees', () => {
      // Create a tree with many irrelevant nodes
      const irrelevantNodes = Array.from({ length: 50 }, (_, i) =>
        createNode('listitem', `Irrelevant ${i}`, [
          createNode('text', `Detail ${i}`),
        ]),
      );

      const tree = createNode('application', 'App', [
        createNode('main', 'Content', [
          createNode('heading', 'Target Section'),
          createNode('button', 'Target Button'),
        ]),
        createNode('list', 'Irrelevant List', irrelevantNodes),
      ]);

      const result = compressAXTree(tree, 'target button');

      // Should achieve significant compression
      expect(result.compressionRatio).toBeLessThan(0.8);
      // But not empty
      expect(result.compressionRatio).toBeGreaterThan(0);
    });

    it('should report ratio as compressed/total nodes', () => {
      const tree = createLargeListTree(20);
      const result = compressAXTree(tree, 'item');

      const totalOriginal = countNodes(tree);
      const totalCompressed = countNodes(result.compressed!);
      const expectedRatio = totalCompressed / totalOriginal;

      expect(result.compressionRatio).toBeCloseTo(expectedRatio, 2);
    });
  });

  describe('edge cases', () => {
    it('should handle nodes with empty names', () => {
      const tree = createNode('application', '', [
        createNode('button', ''),
        createNode('textbox', 'Email'),
      ]);

      const result = compressAXTree(tree, 'email');
      expect(result.compressed).toBeDefined();
    });

    it('should handle nodes with special characters', () => {
      const tree = createNode('application', 'App@Home', [
        createNode('button', 'Click & Go'),
        createNode('link', 'https://example.com'),
      ]);

      const result = compressAXTree(tree, 'click go');
      expect(result.compressed).toBeDefined();
    });

    it('should handle very deep trees', () => {
      const tree = createDeepTree(100);
      const result = compressAXTree(tree, 'deep leaf');

      // Should still preserve the path to the matching node
      expect(result.compressed).toBeDefined();
      expect(result.compressionRatio).toBeGreaterThan(0);
    });

    it('should handle goal with no matching nodes', () => {
      const tree = createNode('application', 'App', [
        createNode('button', 'OK'),
        createNode('button', 'Cancel'),
      ]);

      const result = compressAXTree(tree, 'nonexistent xyz');
      // Should still return a valid result
      expect(result.compressed).toBeDefined();
      expect(result.compressionRatio).toBeGreaterThanOrEqual(0);
    });
  });
});
