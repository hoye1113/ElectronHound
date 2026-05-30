/**
 * AXTree Compressor
 *
 * Reduces token consumption by compressing the accessibility tree (AXTree)
 * before sending it to the LLM during the Observe phase.
 *
 * Compression strategies:
 * 1. Goal-based filtering: Keep only nodes relevant to the goal + their ancestor paths
 * 2. Sample repeated structures: If >10 siblings with same role, keep first 3 + last 1
 * 3. Prune irrelevant branches: Remove subtrees that don't match goal keywords
 *
 * Target: 60-80% token reduction for large trees with specific goals.
 */

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Represents a node in the accessibility tree.
 * Matches the structure from Playwright's accessibility snapshot.
 */
export interface AXNode {
  /** ARIA role of the node (e.g., 'button', 'textbox', 'heading') */
  role: string;
  /** Accessible name of the node */
  name?: string;
  /** Optional value of the node */
  value?: string;
  /** Optional description */
  description?: string;
  /** Child nodes */
  children?: AXNode[];
  /** Whether the node is focused */
  focused?: boolean;
  /** Whether the node is disabled */
  disabled?: boolean;
  /** Whether the node is checked */
  checked?: boolean;
  /** Other properties from the accessibility tree */
  [key: string]: unknown;
}

/**
 * Result of compressing an AXTree.
 */
export interface CompressedResult {
  /** The compressed accessibility tree */
  compressed: AXNode | null;
  /** Ratio of compressed nodes to original nodes (0-1, lower = more compression) */
  compressionRatio: number;
  /** Original node count before compression */
  originalNodeCount: number;
  /** Compressed node count after compression */
  compressedNodeCount: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Maximum number of siblings with the same role before sampling kicks in */
const SAMPLE_THRESHOLD = 10;
/** Number of items to keep from the start when sampling */
const SAMPLE_KEEP_START = 3;
/** Number of items to keep from the end when sampling */
const SAMPLE_KEEP_END = 1;
/** Minimum tree size (node count) to trigger compression */
const MIN_COMPRESSION_SIZE = 15;
/** Characters used to split goal into keywords */
const GOAL_DELIMITERS = /[\s\-_.,;:!?()[\]{}'"\\/\\]+/;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Extract keywords from a goal string for matching against AXTree nodes.
 *
 * @param goal - The natural language goal/prompt
 * @returns Array of lowercase keywords
 */
export function extractGoalKeywords(goal: string): string[] {
  return goal
    .toLowerCase()
    .split(GOAL_DELIMITERS)
    .filter((k) => k.length > 0);
}

/**
 * Count the total number of nodes in an AXTree (including the root).
 *
 * @param node - Root node of the tree
 * @returns Total node count
 */
export function countNodes(node: AXNode | null): number {
  if (!node) return 0;

  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

/**
 * Compress an accessibility tree based on goal keywords.
 *
 * @param axtree - The root node of the accessibility tree
 * @param goal - The natural language goal to filter by
 * @returns Compressed tree with compression ratio
 */
export function compressAXTree(
  axtree: AXNode | null,
  goal: string,
): CompressedResult {
  // Handle null/undefined input
  if (!axtree) {
    return {
      compressed: null,
      compressionRatio: 1.0,
      originalNodeCount: 0,
      compressedNodeCount: 0,
    };
  }

  const originalNodeCount = countNodes(axtree);

  // Skip compression for small trees
  if (originalNodeCount <= MIN_COMPRESSION_SIZE) {
    return {
      compressed: axtree,
      compressionRatio: 1.0,
      originalNodeCount,
      compressedNodeCount: originalNodeCount,
    };
  }

  const keywords = extractGoalKeywords(goal);

  // Step 1: Deep clone the tree to avoid mutating the original
  const cloned = deepClone(axtree);

  // Step 2: Apply goal-based filtering (keep matching nodes + ancestors)
  const filtered = filterByGoal(cloned, keywords);

  // Step 3: Sample repeated structures
  const sampled = sampleRepeatedStructures(filtered);

  const compressedNodeCount = countNodes(sampled);
  const compressionRatio =
    originalNodeCount > 0 ? compressedNodeCount / originalNodeCount : 1.0;

  return {
    compressed: sampled,
    compressionRatio,
    originalNodeCount,
    compressedNodeCount,
  };
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Deep clone an AXNode tree.
 */
function deepClone(node: AXNode): AXNode {
  const clone: AXNode = { ...node };
  if (node.children) {
    clone.children = node.children.map((child) => deepClone(child));
  }
  return clone;
}

/**
 * Check if a node matches any of the goal keywords.
 * Matches against role and name (case-insensitive).
 */
function nodeMatchesKeywords(node: AXNode, keywords: string[]): boolean {
  if (keywords.length === 0) return true; // No keywords = keep everything

  const role = (node.role || '').toLowerCase();
  const name = (node.name || '').toLowerCase();
  const value = (node.value || '').toLowerCase();

  return keywords.some(
    (kw) => role.includes(kw) || name.includes(kw) || value.includes(kw),
  );
}

/**
 * Recursively check if a node or any descendant matches the keywords.
 */
function _subtreeContainsMatch(node: AXNode, keywords: string[]): boolean {
  if (nodeMatchesKeywords(node, keywords)) return true;

  if (node.children) {
    return node.children.some((child) =>
      _subtreeContainsMatch(child, keywords),
    );
  }

  return false;
}

/**
 * Filter tree to keep only nodes relevant to the goal and their ancestor paths.
 *
 * Strategy:
 * - If a node matches the goal keywords, keep it and all its descendants
 * - If a node has a descendant that matches, keep the node (ancestor path) but filter its children
 * - Otherwise, mark for removal
 *
 * Returns null if the entire subtree should be removed.
 */
function filterByGoal(
  node: AXNode,
  keywords: string[],
): AXNode | null {
  // No keywords = keep everything
  if (keywords.length === 0) return node;

  // If this node matches, keep it and all descendants
  if (nodeMatchesKeywords(node, keywords)) {
    return node;
  }

  // If no children, this leaf node doesn't match
  if (!node.children || node.children.length === 0) {
    return null;
  }

  // Filter children recursively
  const filteredChildren: AXNode[] = [];
  for (const child of node.children) {
    const filtered = filterByGoal(child, keywords);
    if (filtered !== null) {
      filteredChildren.push(filtered);
    }
  }

  // If any children survived, keep this node as ancestor
  if (filteredChildren.length > 0) {
    return { ...node, children: filteredChildren };
  }

  // No matches in this subtree
  return null;
}

/**
 * Sample repeated structures: if >SAMPLE_THRESHOLD siblings with same role,
 * keep first SAMPLE_KEEP_START + last SAMPLE_KEEP_END + a separator marker.
 */
function sampleRepeatedStructures(node: AXNode): AXNode {
  if (!node.children || node.children.length === 0) {
    return node;
  }

  // Group children by role
  const roleGroups = new Map<string, number[]>();
  node.children.forEach((child, index) => {
    const role = child.role || 'unknown';
    const indices = roleGroups.get(role) || [];
    indices.push(index);
    roleGroups.set(role, indices);
  });

  // Check if any group exceeds the threshold
  let needsSampling = false;
  for (const indices of roleGroups.values()) {
    if (indices.length > SAMPLE_THRESHOLD) {
      needsSampling = true;
      break;
    }
  }

  if (!needsSampling) {
    // Just recurse into children
    return {
      ...node,
      children: node.children.map((child) =>
        sampleRepeatedStructures(child),
      ),
    };
  }

  // Build new children array with sampling
  const newChildren: AXNode[] = [];
  const processedRoles = new Set<string>();

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const role = child.role || 'unknown';
    const groupIndices = roleGroups.get(role)!;

    if (groupIndices.length <= SAMPLE_THRESHOLD) {
      // Not enough to sample, keep as-is
      newChildren.push(sampleRepeatedStructures(child));
    } else if (!processedRoles.has(role)) {
      // First time seeing this role group that needs sampling
      processedRoles.add(role);

      // Keep first N items
      const keepStart = groupIndices.slice(0, SAMPLE_KEEP_START);
      // Keep last M items
      const keepEnd = groupIndices.slice(-SAMPLE_KEEP_END);

      // Add kept items from start
      for (const idx of keepStart) {
        newChildren.push(sampleRepeatedStructures(node.children[idx]));
      }

      // Add separator/marker
      const omittedCount =
        groupIndices.length - SAMPLE_KEEP_START - SAMPLE_KEEP_END;
      newChildren.push({
        role: 'separator',
        name: `... ${omittedCount} more ${role} items ...`,
      });

      // Add kept items from end
      for (const idx of keepEnd) {
        newChildren.push(sampleRepeatedStructures(node.children[idx]));
      }
    }
    // Skip indices that belong to already-processed groups (except those kept)
  }

  return { ...node, children: newChildren };
}
