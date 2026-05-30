/**
 * ReplayVerifier Tests
 *
 * Tests for the ReplayVerifier class that compares expected vs actual
 * observations during replay.
 *
 * Covers:
 * - Strict mode: exact string match, JSON structural comparison, string diff
 * - Loose mode: error keyword detection, empty observations
 * - Diff generation: added/removed/changed entries
 * - Edge cases: null JSON, arrays, nested objects
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ReplayVerifier } from '../replay/replayVerifier.js';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ReplayVerifier', () => {
  let verifier: ReplayVerifier;

  beforeEach(() => {
    verifier = new ReplayVerifier();
  });

  // ── Strict mode ─────────────────────────────────────────────────────────

  describe('strict mode', () => {
    it('matches identical strings', () => {
      const result = verifier.compare('hello world', 'hello world', 'strict');
      expect(result.match).toBe(true);
      expect(result.differences).toEqual([]);
    });

    it('does not match different strings', () => {
      const result = verifier.compare('hello', 'world', 'strict');
      expect(result.match).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);
    });

    it('matches identical JSON objects', () => {
      const json = JSON.stringify({ status: 'ok', count: 5 });
      const result = verifier.compare(json, json, 'strict');
      expect(result.match).toBe(true);
      expect(result.differences).toEqual([]);
    });

    it('detects changed values in JSON', () => {
      const expected = JSON.stringify({ status: 'ok', count: 5 });
      const actual = JSON.stringify({ status: 'error', count: 5 });

      const result = verifier.compare(expected, actual, 'strict');
      expect(result.match).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].path).toBe('status');
      expect(result.differences[0].expected).toBe('ok');
      expect(result.differences[0].actual).toBe('error');
      expect(result.differences[0].type).toBe('changed');
    });

    it('detects added keys in JSON', () => {
      const expected = JSON.stringify({ name: 'test' });
      const actual = JSON.stringify({ name: 'test', extra: 'value' });

      const result = verifier.compare(expected, actual, 'strict');
      expect(result.match).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].path).toBe('extra');
      expect(result.differences[0].type).toBe('added');
    });

    it('detects removed keys in JSON', () => {
      const expected = JSON.stringify({ name: 'test', removed: 'gone' });
      const actual = JSON.stringify({ name: 'test' });

      const result = verifier.compare(expected, actual, 'strict');
      expect(result.match).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].path).toBe('removed');
      expect(result.differences[0].type).toBe('removed');
    });

    it('handles nested JSON objects', () => {
      const expected = JSON.stringify({ user: { name: 'Alice', age: 30 } });
      const actual = JSON.stringify({ user: { name: 'Bob', age: 30 } });

      const result = verifier.compare(expected, actual, 'strict');
      expect(result.match).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].path).toBe('user.name');
      expect(result.differences[0].expected).toBe('Alice');
      expect(result.differences[0].actual).toBe('Bob');
    });

    it('handles JSON arrays', () => {
      const expected = JSON.stringify([1, 2, 3]);
      const actual = JSON.stringify([1, 2, 4]);

      const result = verifier.compare(expected, actual, 'strict');
      expect(result.match).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].path).toBe('[2]');
      expect(result.differences[0].expected).toBe(3);
      expect(result.differences[0].actual).toBe(4);
    });

    it('detects added items in JSON arrays', () => {
      const expected = JSON.stringify([1, 2]);
      const actual = JSON.stringify([1, 2, 3]);

      const result = verifier.compare(expected, actual, 'strict');
      expect(result.match).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].path).toBe('[2]');
      expect(result.differences[0].type).toBe('added');
    });

    it('detects removed items in JSON arrays', () => {
      const expected = JSON.stringify([1, 2, 3]);
      const actual = JSON.stringify([1, 2]);

      const result = verifier.compare(expected, actual, 'strict');
      expect(result.match).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].path).toBe('[2]');
      expect(result.differences[0].type).toBe('removed');
    });

    it('falls back to string diff for non-JSON strings', () => {
      const result = verifier.compare('line1\nline2\nline3', 'line1\nlineX\nline3', 'strict');
      expect(result.match).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);
    });

    it('generates string diff for multiline content with added lines', () => {
      const result = verifier.compare('line1\nline2', 'line1\nline2\nline3', 'strict');
      expect(result.match).toBe(false);
      const addedDiffs = result.differences.filter(d => d.type === 'added');
      expect(addedDiffs.length).toBeGreaterThan(0);
    });

    it('generates string diff for multiline content with removed lines', () => {
      const result = verifier.compare('line1\nline2\nline3', 'line1\nline2', 'strict');
      expect(result.match).toBe(false);
      const removedDiffs = result.differences.filter(d => d.type === 'removed');
      expect(removedDiffs.length).toBeGreaterThan(0);
    });

    it('handles completely different non-JSON strings', () => {
      const result = verifier.compare('abc', 'xyz', 'strict');
      expect(result.match).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);
    });

    it('detects content added to string (substring case)', () => {
      const result = verifier.compare('hello', 'hello world extra', 'strict');
      expect(result.match).toBe(false);
      const addedDiffs = result.differences.filter(d => d.type === 'added');
      expect(addedDiffs.length).toBeGreaterThan(0);
    });

    it('detects content removed from string (substring case)', () => {
      const result = verifier.compare('hello world extra', 'hello', 'strict');
      expect(result.match).toBe(false);
      const removedDiffs = result.differences.filter(d => d.type === 'removed');
      expect(removedDiffs.length).toBeGreaterThan(0);
    });
  });

  // ── Loose mode ──────────────────────────────────────────────────────────

  describe('loose mode', () => {
    it('matches when both strings are empty', () => {
      const result = verifier.compare('', '', 'loose');
      expect(result.match).toBe(true);
      expect(result.differences).toEqual([]);
    });

    it('matches when actual has no error keywords', () => {
      const result = verifier.compare('expected', 'Action completed successfully', 'loose');
      expect(result.match).toBe(true);
      expect(result.differences).toEqual([]);
    });

    it('does not match when actual contains "error"', () => {
      const result = verifier.compare('expected', 'An error occurred', 'loose');
      expect(result.match).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('changed');
    });

    it('does not match when actual contains "failed"', () => {
      const result = verifier.compare('expected', 'Operation failed', 'loose');
      expect(result.match).toBe(false);
    });

    it('does not match when actual contains "timeout"', () => {
      const result = verifier.compare('expected', 'Connection timeout', 'loose');
      expect(result.match).toBe(false);
    });

    it('does not match when actual contains "exception"', () => {
      const result = verifier.compare('expected', 'Uncaught exception', 'loose');
      expect(result.match).toBe(false);
    });

    it('does not match when actual contains "not found"', () => {
      const result = verifier.compare('expected', 'Element not found', 'loose');
      expect(result.match).toBe(false);
    });

    it('does not match when actual contains "denied"', () => {
      const result = verifier.compare('expected', 'Access denied', 'loose');
      expect(result.match).toBe(false);
    });

    it('does not match when actual contains "crash"', () => {
      const result = verifier.compare('expected', 'App crash detected', 'loose');
      expect(result.match).toBe(false);
    });

    it('does not match when actual contains "invalid"', () => {
      const result = verifier.compare('expected', 'Invalid input', 'loose');
      expect(result.match).toBe(false);
    });

    it('does not match when actual contains "refused"', () => {
      const result = verifier.compare('expected', 'Connection refused', 'loose');
      expect(result.match).toBe(false);
    });

    it('does not match when actual contains "unavailable"', () => {
      const result = verifier.compare('expected', 'Service unavailable', 'loose');
      expect(result.match).toBe(false);
    });

    it('is case insensitive for error detection', () => {
      const result = verifier.compare('expected', 'ERROR in uppercase', 'loose');
      expect(result.match).toBe(false);
    });

    it('matches when expected is non-empty and actual is success text', () => {
      const result = verifier.compare(
        'Button clicked successfully',
        'Page loaded with new content',
        'loose'
      );
      expect(result.match).toBe(true);
    });

    it('diff entry has correct structure on mismatch', () => {
      const result = verifier.compare('expected', 'Something error happened', 'loose');
      expect(result.differences[0]).toEqual({
        path: 'observation',
        expected: 'success indicator',
        actual: 'Something error happened',
        type: 'changed',
      });
    });
  });

  // ── JSON comparison edge cases ──────────────────────────────────────────

  describe('JSON comparison edge cases', () => {
    it('handles null vs non-null in JSON', () => {
      const expected = JSON.stringify(null);
      const actual = JSON.stringify({ key: 'value' });

      const result = verifier.compare(expected, actual, 'strict');
      expect(result.match).toBe(false);
    });

    it('handles different types in JSON', () => {
      const expected = JSON.stringify({ count: '5' });
      const actual = JSON.stringify({ count: 5 });

      const result = verifier.compare(expected, actual, 'strict');
      expect(result.match).toBe(false);
      expect(result.differences[0].path).toBe('count');
      expect(result.differences[0].type).toBe('changed');
    });

    it('handles deeply nested objects', () => {
      const expected = JSON.stringify({ a: { b: { c: { d: 1 } } } });
      const actual = JSON.stringify({ a: { b: { c: { d: 2 } } } });

      const result = verifier.compare(expected, actual, 'strict');
      expect(result.match).toBe(false);
      expect(result.differences[0].path).toBe('a.b.c.d');
      expect(result.differences[0].expected).toBe(1);
      expect(result.differences[0].actual).toBe(2);
    });

    it('handles empty JSON objects', () => {
      const result = verifier.compare('{}', '{}', 'strict');
      expect(result.match).toBe(true);
    });

    it('handles empty JSON arrays', () => {
      const result = verifier.compare('[]', '[]', 'strict');
      expect(result.match).toBe(true);
    });

    it('detects multiple differences in complex JSON', () => {
      const expected = JSON.stringify({ a: 1, b: 2, c: 3 });
      const actual = JSON.stringify({ a: 1, b: 99, d: 4 });

      const result = verifier.compare(expected, actual, 'strict');
      expect(result.match).toBe(false);
      // b changed, c removed, d added
      expect(result.differences.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── compare method routing ──────────────────────────────────────────────

  describe('compare method routing', () => {
    it('routes to strict comparison when mode is strict', () => {
      const result = verifier.compare('same', 'same', 'strict');
      expect(result.match).toBe(true);
    });

    it('routes to loose comparison when mode is loose', () => {
      const result = verifier.compare('expected', 'success', 'loose');
      expect(result.match).toBe(true);
    });
  });
});
