/**
 * ReplayVerifier - Compares expected vs actual observations during replay.
 *
 * Supports two comparison modes:
 * - strict: Exact string match (or structural JSON comparison)
 * - loose: Checks if action succeeded (no error keywords)
 */

export interface DiffResult {
  match: boolean;
  differences: DiffEntry[];
}

export interface DiffEntry {
  path: string;
  expected: unknown;
  actual: unknown;
  type: 'added' | 'removed' | 'changed';
}

// Error keywords that indicate failure in loose mode
const ERROR_KEYWORDS = [
  'error',
  'failed',
  'failure',
  'not found',
  'timeout',
  'exception',
  'crash',
  'invalid',
  'denied',
  'refused',
  'unavailable',
];

export class ReplayVerifier {
  /**
   * Compare expected and actual observations.
   *
   * @param expected - The expected observation from the steps table
   * @param actual - The actual observation from replay execution
   * @param mode - Comparison mode: 'strict' or 'loose'
   * @returns DiffResult with match status and differences
   */
  compare(expected: string, actual: string, mode: 'strict' | 'loose'): DiffResult {
    if (mode === 'loose') {
      return this.looseCompare(expected, actual);
    }
    return this.strictCompare(expected, actual);
  }

  /**
   * Strict comparison - exact match or structural JSON comparison.
   */
  private strictCompare(expected: string, actual: string): DiffResult {
    // Try JSON comparison first
    const jsonResult = this.tryJsonCompare(expected, actual);
    if (jsonResult) {
      return jsonResult;
    }

    // Fall back to string comparison
    if (expected === actual) {
      return { match: true, differences: [] };
    }

    // Generate diff for string comparison
    const differences = this.stringDiff(expected, actual);
    return { match: false, differences };
  }

  /**
   * Loose comparison - checks if action succeeded (no error indicators).
   */
  private looseCompare(expected: string, actual: string): DiffResult {
    // Both empty = match
    if (!expected && !actual) {
      return { match: true, differences: [] };
    }

    // Check if actual observation indicates failure
    const actualLower = actual.toLowerCase();
    const hasError = ERROR_KEYWORDS.some(keyword => actualLower.includes(keyword));

    if (hasError) {
      return {
        match: false,
        differences: [{
          path: 'observation',
          expected: 'success indicator',
          actual: actual,
          type: 'changed',
        }],
      };
    }

    // In loose mode, if no error keywords, consider it a pass
    return { match: true, differences: [] };
  }

  /**
   * Try to parse and compare as JSON objects.
   * Returns null if either input is not valid JSON.
   */
  private tryJsonCompare(expected: string, actual: string): DiffResult | null {
    try {
      const expectedObj = JSON.parse(expected);
      const actualObj = JSON.parse(actual);

      // Both are valid JSON - do structural comparison
      const differences = this.jsonDiff(expectedObj, actualObj, '');
      return {
        match: differences.length === 0,
        differences,
      };
    } catch {
      // Not JSON - return null to fall back to string comparison
      return null;
    }
  }

  /**
   * Recursively compare two JSON objects and collect differences.
   */
  private jsonDiff(expected: unknown, actual: unknown, path: string): DiffEntry[] {
    const differences: DiffEntry[] = [];

    // Handle null/undefined
    if (expected === null || expected === undefined) {
      if (actual !== null && actual !== undefined) {
        differences.push({
          path: path || 'root',
          expected: expected,
          actual: actual,
          type: 'added',
        });
      }
      return differences;
    }

    if (actual === null || actual === undefined) {
      differences.push({
        path: path || 'root',
        expected: expected,
        actual: actual,
        type: 'removed',
      });
      return differences;
    }

    // Handle different types
    if (typeof expected !== typeof actual) {
      differences.push({
        path: path || 'root',
        expected: expected,
        actual: actual,
        type: 'changed',
      });
      return differences;
    }

    // Handle primitives
    if (typeof expected !== 'object') {
      if (expected !== actual) {
        differences.push({
          path: path || 'root',
          expected: expected,
          actual: actual,
          type: 'changed',
        });
      }
      return differences;
    }

    // Handle arrays
    if (Array.isArray(expected) && Array.isArray(actual)) {
      const maxLen = Math.max(expected.length, actual.length);
      for (let i = 0; i < maxLen; i++) {
        const itemPath = `${path}[${i}]`;
        if (i >= expected.length) {
          differences.push({
            path: itemPath,
            expected: undefined,
            actual: actual[i],
            type: 'added',
          });
        } else if (i >= actual.length) {
          differences.push({
            path: itemPath,
            expected: expected[i],
            actual: undefined,
            type: 'removed',
          });
        } else {
          differences.push(...this.jsonDiff(expected[i], actual[i], itemPath));
        }
      }
      return differences;
    }

    // Handle objects
    const expectedObj = expected as Record<string, unknown>;
    const actualObj = actual as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(expectedObj), ...Object.keys(actualObj)]);

    for (const key of allKeys) {
      const keyPath = path ? `${path}.${key}` : key;

      if (!(key in expectedObj)) {
        differences.push({
          path: keyPath,
          expected: undefined,
          actual: actualObj[key],
          type: 'added',
        });
      } else if (!(key in actualObj)) {
        differences.push({
          path: keyPath,
          expected: expectedObj[key],
          actual: undefined,
          type: 'removed',
        });
      } else {
        differences.push(...this.jsonDiff(expectedObj[key], actualObj[key], keyPath));
      }
    }

    return differences;
  }

  /**
   * Generate a simple diff between two strings.
   */
  private stringDiff(expected: string, actual: string): DiffEntry[] {
    const differences: DiffEntry[] = [];

    // If one string contains the other, detect added/removed content
    if (actual.includes(expected) && actual.length > expected.length) {
      // Content was added
      differences.push({
        path: 'content',
        expected: expected,
        actual: actual,
        type: 'added',
      });
      return differences;
    }

    if (expected.includes(actual) && expected.length > actual.length) {
      // Content was removed
      differences.push({
        path: 'content',
        expected: expected,
        actual: actual,
        type: 'removed',
      });
      return differences;
    }

    // Simple line-based diff for multi-line strings
    const expectedLines = expected.split('\n');
    const actualLines = actual.split('\n');

    const maxLines = Math.max(expectedLines.length, actualLines.length);

    for (let i = 0; i < maxLines; i++) {
      const linePath = `line[${i + 1}]`;

      if (i >= expectedLines.length) {
        differences.push({
          path: linePath,
          expected: undefined,
          actual: actualLines[i],
          type: 'added',
        });
      } else if (i >= actualLines.length) {
        differences.push({
          path: linePath,
          expected: expectedLines[i],
          actual: undefined,
          type: 'removed',
        });
      } else if (expectedLines[i] !== actualLines[i]) {
        differences.push({
          path: linePath,
          expected: expectedLines[i],
          actual: actualLines[i],
          type: 'changed',
        });
      }
    }

    return differences;
  }
}
