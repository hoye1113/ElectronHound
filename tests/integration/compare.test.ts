import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadBaseline,
  loadCurrent,
  flattenReport,
  checkRegression,
  type BenchmarkReport,
  type BenchmarkEntry,
  type BaselineData,
} from '../../benchmarks/compare.js';

function createBenchmarkEntry(overrides: Partial<BenchmarkEntry> = {}): BenchmarkEntry {
  return {
    id: 'bench-1',
    hz: 1000,
    min: 0.5,
    max: 2.0,
    mean: 1.0,
    p75: 1.2,
    p95: 1.5,
    p99: 1.8,
    p995: 1.9,
    p999: 1.95,
    rme: 0.5,
    samples: [],
    ...overrides,
  };
}

describe('loadBaseline', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bench-compare-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty baseline when file does not exist', () => {
    const result = loadBaseline('/nonexistent/path.json');
    expect(result.version).toBe(1);
    expect(result.results).toEqual({});
  });

  it('loads baseline from file', () => {
    const baseline: BaselineData = {
      version: 1,
      timestamp: '2026-01-01',
      commit: 'abc123',
      results: {
        'bench-1': { mean: 1.0, hz: 1000, p95: 1.5 },
      },
    };
    const filePath = join(tmpDir, 'baseline.json');
    writeFileSync(filePath, JSON.stringify(baseline));

    const result = loadBaseline(filePath);
    expect(result.results['bench-1']).toEqual({ mean: 1.0, hz: 1000, p95: 1.5 });
  });
});

describe('loadCurrent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bench-compare-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws when file does not exist', () => {
    expect(() => loadCurrent('/nonexistent/path.json')).toThrow('not found');
  });

  it('loads and flattens current results', () => {
    const report: BenchmarkReport = {
      files: [{
        filepath: 'test.bench.ts',
        groups: [{
          fullName: 'group',
          benchmarks: [
            createBenchmarkEntry({ id: 'api-call', mean: 2.0 }),
            createBenchmarkEntry({ id: 'db-query', mean: 0.5 }),
          ],
        }],
      }],
    };
    const filePath = join(tmpDir, 'current.json');
    writeFileSync(filePath, JSON.stringify(report));

    const result = loadCurrent(filePath);
    expect(result['api-call'].mean).toBe(2.0);
    expect(result['db-query'].mean).toBe(0.5);
  });
});

describe('flattenReport', () => {
  it('flattens nested report structure', () => {
    const report: BenchmarkReport = {
      files: [
        {
          filepath: 'file1.bench.ts',
          groups: [{
            fullName: 'group1',
            benchmarks: [
              createBenchmarkEntry({ id: 'bench-1', mean: 1.0, hz: 1000, p95: 1.5 }),
            ],
          }],
        },
        {
          filepath: 'file2.bench.ts',
          groups: [{
            fullName: 'group2',
            benchmarks: [
              createBenchmarkEntry({ id: 'bench-2', mean: 2.0, hz: 500, p95: 3.0 }),
            ],
          }],
        },
      ],
    };

    const result = flattenReport(report);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['bench-1']).toEqual({ mean: 1.0, hz: 1000, p95: 1.5 });
    expect(result['bench-2']).toEqual({ mean: 2.0, hz: 500, p95: 3.0 });
  });

  it('handles empty report', () => {
    const result = flattenReport({ files: [] });
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('checkRegression', () => {
  it('detects no regression when within threshold', () => {
    const baseline = { 'bench-1': { mean: 1.0, hz: 1000, p95: 1.5 } };
    const current = { 'bench-1': createBenchmarkEntry({ mean: 1.05, p95: 1.55 }) };

    const results = checkRegression(baseline, current, 10);
    expect(results).toHaveLength(1);
    expect(results[0].regressed).toBe(false);
  });

  it('detects regression when exceeding threshold', () => {
    const baseline = { 'bench-1': { mean: 1.0, hz: 1000, p95: 1.5 } };
    const current = { 'bench-1': createBenchmarkEntry({ mean: 1.5, p95: 1.5 }) };

    const results = checkRegression(baseline, current, 10);
    expect(results).toHaveLength(1);
    expect(results[0].regressed).toBe(true);
    expect(results[0].changePercent).toBeCloseTo(50);
  });

  it('detects p95 regression', () => {
    const baseline = { 'bench-1': { mean: 1.0, hz: 1000, p95: 1.0 } };
    const current = { 'bench-1': createBenchmarkEntry({ mean: 1.0, p95: 2.0 }) };

    const results = checkRegression(baseline, current, 10);
    expect(results[0].regressed).toBe(true);
    expect(results[0].p95ChangePercent).toBeCloseTo(100);
  });

  it('skips benchmarks missing from current', () => {
    const baseline = {
      'bench-1': { mean: 1.0, hz: 1000, p95: 1.5 },
      'bench-2': { mean: 2.0, hz: 500, p95: 3.0 },
    };
    const current = { 'bench-1': createBenchmarkEntry({ mean: 1.0 }) };

    const results = checkRegression(baseline, current);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('bench-1');
  });

  it('handles zero baseline p95', () => {
    const baseline = { 'bench-1': { mean: 1.0, hz: 1000, p95: 0 } };
    const current = { 'bench-1': createBenchmarkEntry({ mean: 1.0, p95: 1.0 }) };

    const results = checkRegression(baseline, current);
    expect(results[0].p95ChangePercent).toBe(0);
  });

  it('uses default threshold of 10%', () => {
    const baseline = { 'bench-1': { mean: 1.0, hz: 1000, p95: 1.0 } };
    const current = { 'bench-1': createBenchmarkEntry({ mean: 1.11, p95: 1.0 }) };

    const results = checkRegression(baseline, current);
    expect(results[0].regressed).toBe(true);
  });

  it('returns empty array for empty baseline', () => {
    const results = checkRegression({}, { 'bench-1': createBenchmarkEntry() });
    expect(results).toHaveLength(0);
  });
});
