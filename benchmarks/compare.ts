/**
 * Benchmark comparison utilities.
 *
 * Loads baseline and current benchmark results, then checks for performance
 * regressions using a configurable threshold (default 10%).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface BenchmarkEntry {
  id: string;
  hz: number;
  min: number;
  max: number;
  mean: number;
  p75: number;
  p95: number;
  p99: number;
  p995: number;
  p999: number;
  rme: number;
  samples: unknown[];
}

export interface BenchmarkFile {
  filepath: string;
  groups: Array<{
    fullName: string;
    benchmarks: BenchmarkEntry[];
  }>;
}

export interface BenchmarkReport {
  files: BenchmarkFile[];
}

export interface BaselineData {
  version: number;
  timestamp: string;
  commit: string;
  results: Record<string, { mean: number; hz: number; p95: number }>;
}

export interface RegressionResult {
  name: string;
  baselineMean: number;
  currentMean: number;
  baselineP95: number;
  currentP95: number;
  p95ChangePercent: number;
  changePercent: number;
  regressed: boolean;
}

/**
 * Load baseline data from baseline.json.
 */
export function loadBaseline(baselinePath?: string): BaselineData {
  const filePath = baselinePath ?? resolve(__dirname, 'baseline.json');
  if (!existsSync(filePath)) {
    return { version: 1, timestamp: '', commit: '', results: {} };
  }
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as BaselineData;
}

/**
 * Load current benchmark results from the vitest bench JSON output.
 */
export function loadCurrent(currentPath?: string): Record<string, BenchmarkEntry> {
  const filePath = currentPath ?? resolve(__dirname, 'current.json');
  if (!existsSync(filePath)) {
    throw new Error(`Current benchmark results not found: ${filePath}`);
  }
  const raw = readFileSync(filePath, 'utf-8');
  const report = JSON.parse(raw) as BenchmarkReport;

  const flat: Record<string, BenchmarkEntry> = {};
  for (const file of report.files) {
    for (const group of file.groups) {
      for (const bench of group.benchmarks) {
        flat[bench.id] = bench;
      }
    }
  }
  return flat;
}

/**
 * Flatten a benchmark report into { name: { mean, hz } } for baseline storage.
 */
export function flattenReport(report: BenchmarkReport): Record<string, { mean: number; hz: number; p95: number }> {
  const results: Record<string, { mean: number; hz: number; p95: number }> = {};
  for (const file of report.files) {
    for (const group of file.groups) {
      for (const bench of group.benchmarks) {
        results[bench.id] = { mean: bench.mean, hz: bench.hz, p95: bench.p95 };
      }
    }
  }
  return results;
}

/**
 * Check for regressions between baseline and current results.
 *
 * A regression is detected when the current mean execution time exceeds
 * the baseline mean by more than the threshold percentage.
 *
 * @param baseline - Baseline results (mean and hz per benchmark)
 * @param current  - Current benchmark entries
 * @param thresholdPercent - Regression threshold (default 10%)
 * @returns Array of regression results, including which benchmarks regressed
 */
export function checkRegression(
  baseline: Record<string, { mean: number; hz: number; p95: number }>,
  current: Record<string, BenchmarkEntry>,
  thresholdPercent = 10,
): RegressionResult[] {
  const results: RegressionResult[] = [];

  for (const [name, baselineEntry] of Object.entries(baseline)) {
    const currentEntry = current[name];
    if (!currentEntry) {
      // Benchmark disappeared — not a regression, skip
      continue;
    }

    const changePercent =
      ((currentEntry.mean - baselineEntry.mean) / baselineEntry.mean) * 100;

    const p95ChangePercent =
      baselineEntry.p95 > 0
        ? ((currentEntry.p95 - baselineEntry.p95) / baselineEntry.p95) * 100
        : 0;

    results.push({
      name,
      baselineMean: baselineEntry.mean,
      currentMean: currentEntry.mean,
      baselineP95: baselineEntry.p95,
      currentP95: currentEntry.p95,
      p95ChangePercent,
      changePercent,
      regressed: changePercent > thresholdPercent || p95ChangePercent > thresholdPercent,
    });
  }

  return results;
}
