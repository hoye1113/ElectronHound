#!/usr/bin/env node
/**
 * Check benchmark results for regressions against the baseline.
 *
 * Exits with code 1 if any regression exceeds the 10% threshold.
 * Used by CI: `pnpm bench:check`
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BENCHMARKS_DIR = resolve(__dirname, '..', 'benchmarks');
const BASELINE_PATH = resolve(BENCHMARKS_DIR, 'baseline.json');
const CURRENT_PATH = resolve(BENCHMARKS_DIR, 'current.json');
const THRESHOLD_PERCENT = 10;

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function flattenReport(report) {
  const flat = {};
  for (const file of report.files) {
    for (const group of file.groups) {
      for (const bench of group.benchmarks) {
        flat[bench.id] = bench;
      }
    }
  }
  return flat;
}

function main() {
  if (!existsSync(BASELINE_PATH)) {
    console.log('No baseline found — skipping regression check.');
    process.exit(0);
  }

  if (!existsSync(CURRENT_PATH)) {
    console.error('No current benchmark results found. Run `pnpm bench` first.');
    process.exit(1);
  }

  const baseline = loadJson(BASELINE_PATH);
  const currentReport = loadJson(CURRENT_PATH);
  const current = flattenReport(currentReport);

  if (!baseline.results || Object.keys(baseline.results).length === 0) {
    console.log('Baseline is empty — skipping regression check.');
    process.exit(0);
  }

  const regressions = [];

  for (const [name, baselineEntry] of Object.entries(baseline.results)) {
    const currentEntry = current[name];
    if (!currentEntry) continue;

    const changePercent =
      ((currentEntry.mean - baselineEntry.mean) / baselineEntry.mean) * 100;

    if (changePercent > THRESHOLD_PERCENT) {
      regressions.push({
        name,
        baselineMean: baselineEntry.mean.toFixed(2),
        currentMean: currentEntry.mean.toFixed(2),
        changePercent: changePercent.toFixed(1),
      });
    }
  }

  if (regressions.length > 0) {
    console.error(`\nBenchmark regressions detected (${regressions.length}):\n`);
    for (const r of regressions) {
      console.error(
        `  ${r.name}: ${r.baselineMean}ms -> ${r.currentMean}ms (+${r.changePercent}%)`,
      );
    }
    console.error(`\nThreshold: ${THRESHOLD_PERCENT}%`);
    process.exit(1);
  }

  console.log('No benchmark regressions detected.');
  process.exit(0);
}

main();
