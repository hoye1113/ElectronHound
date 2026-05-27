import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PatternStore } from '../report-graph/pattern-store.js';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FeedbackPattern } from '@eata/shared-types';

function makePattern(overrides: Partial<FeedbackPattern> = {}): FeedbackPattern {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    errorType: 'element-not-found',
    targetDescription: 'Submit button',
    remediationHint: 'Use data-testid attribute',
    similarityKeywords: ['submit', 'button', 'click'],
    frequency: 1,
    lastSeen: '2026-01-01T00:00:00Z',
    relatedGoalPatterns: ['form submission'],
    ...overrides,
  };
}

describe('PatternStore', () => {
  let tempDir: string;
  let store: PatternStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pattern-store-test-'));
    store = new PatternStore(tempDir);
  });

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('readAll', () => {
    it('returns empty array when no patterns file exists', () => {
      expect(store.readAll()).toEqual([]);
    });

    it('reads patterns from JSONL file', () => {
      store.upsert(makePattern());
      store.upsert(makePattern({ id: '550e8400-e29b-41d4-a716-446655440001', errorType: 'timeout' }));

      const patterns = store.readAll();
      expect(patterns).toHaveLength(2);
      expect(patterns[0].errorType).toBe('element-not-found');
      expect(patterns[1].errorType).toBe('timeout');
    });

    it('skips empty lines', () => {
      const filePath = join(tempDir, 'feedback', 'patterns.jsonl');
      const { writeFileSync, mkdirSync } = require('node:fs');
      mkdirSync(join(tempDir, 'feedback'), { recursive: true });
      writeFileSync(filePath, '\n' + JSON.stringify(makePattern()) + '\n\n');

      const patterns = store.readAll();
      expect(patterns).toHaveLength(1);
    });
  });

  describe('upsert', () => {
    it('appends new pattern when no match exists', () => {
      const pattern = makePattern();
      const result = store.upsert(pattern);

      expect(result.errorType).toBe('element-not-found');
      expect(store.readAll()).toHaveLength(1);
    });

    it('increments frequency when matching pattern exists', () => {
      store.upsert(makePattern({ frequency: 3 }));
      const result = store.upsert(makePattern({ frequency: 1, lastSeen: '2026-06-01T00:00:00Z' }));

      expect(result.frequency).toBe(4);
      expect(store.readAll()).toHaveLength(1);
    });

    it('merges similarityKeywords on match', () => {
      store.upsert(makePattern({ similarityKeywords: ['submit', 'button'] }));
      const result = store.upsert(makePattern({ similarityKeywords: ['button', 'form', 'click'] }));

      expect(result.similarityKeywords).toContain('submit');
      expect(result.similarityKeywords).toContain('button');
      expect(result.similarityKeywords).toContain('form');
      expect(result.similarityKeywords).toContain('click');
    });

    it('merges relatedGoalPatterns on match', () => {
      store.upsert(makePattern({ relatedGoalPatterns: ['form submission'] }));
      const result = store.upsert(makePattern({ relatedGoalPatterns: ['login flow', 'form submission'] }));

      expect(result.relatedGoalPatterns).toContain('form submission');
      expect(result.relatedGoalPatterns).toContain('login flow');
    });

    it('matches similar descriptions (substring)', () => {
      store.upsert(makePattern({ targetDescription: 'Submit button on the form' }));
      const result = store.upsert(makePattern({ targetDescription: 'Submit button' }));

      expect(store.readAll()).toHaveLength(1);
      expect(result.frequency).toBe(2);
    });

    it('does not match different error types', () => {
      store.upsert(makePattern({ errorType: 'element-not-found' }));
      store.upsert(makePattern({ errorType: 'timeout', id: '550e8400-e29b-41d4-a716-446655440001' }));

      expect(store.readAll()).toHaveLength(2);
    });

    it('limits similarityKeywords to 10', () => {
      store.upsert(makePattern({ similarityKeywords: ['a', 'b', 'c', 'd', 'e'] }));
      const result = store.upsert(makePattern({ similarityKeywords: ['f', 'g', 'h', 'i', 'j', 'k'] }));

      expect(result.similarityKeywords.length).toBeLessThanOrEqual(10);
    });
  });

  describe('loadPatternsForPrompt', () => {
    it('returns empty string when no patterns exist', () => {
      expect(store.loadPatternsForPrompt('test goal')).toBe('');
    });

    it('returns relevant patterns matching goal keywords', () => {
      store.upsert(makePattern({
        similarityKeywords: ['login', 'button', 'submit'],
        targetDescription: 'Login form submit button',
      }));

      const result = store.loadPatternsForPrompt('Test the login button');
      expect(result).toContain('element-not-found');
      expect(result).toContain('Use data-testid attribute');
    });

    it('returns empty for unrelated goal', () => {
      store.upsert(makePattern({
        similarityKeywords: ['login', 'button'],
        targetDescription: 'Login form',
      }));

      const result = store.loadPatternsForPrompt('Export PDF report');
      expect(result).toBe('');
    });

    it('respects maxCount parameter', () => {
      for (let i = 0; i < 10; i++) {
        store.upsert(makePattern({
          id: `550e8400-e29b-41d4-a716-44665544000${i}`,
          errorType: `error-${i}`,
          similarityKeywords: ['test', 'button'],
          frequency: i,
        }));
      }

      const result = store.loadPatternsForPrompt('test button', 3);
      const matches = result.match(/error-/g);
      expect(matches).toHaveLength(3);
    });

    it('sorts by frequency descending', () => {
      store.upsert(makePattern({ errorType: 'low-freq', frequency: 1, similarityKeywords: ['test'] }));
      store.upsert(makePattern({
        id: '550e8400-e29b-41d4-a716-446655440001',
        errorType: 'high-freq',
        frequency: 10,
        similarityKeywords: ['test'],
      }));

      const result = store.loadPatternsForPrompt('test');
      const highIdx = result.indexOf('high-freq');
      const lowIdx = result.indexOf('low-freq');
      expect(highIdx).toBeLessThan(lowIdx);
    });
  });
});
