#!/usr/bin/env node
/**
 * Update the benchmark baseline from current results.
 *
 * Runs `vitest bench`, reads the JSON output, and writes baseline.json
 * with the current commit hash and timestamp.
 * Used by: `pnpm bench:update`
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BENCHMARKS_DIR = resolve(__dirname, '..', 'benchmarks');
const BASELINE_PATH = resolve(BENCHMARKS_DIR, 'baseline.json');
const CURRENT_PATH = resolve(BENCHMARKS_DIR, 'current.json');

function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function flattenReport(report) {
  const results = {};
  for (const file of report.files) {
    for (const group of file.groups) {
      for (const bench of group.benchmarks) {
        results[bench.id] = { mean: bench.mean, hz: bench.hz };
      }
    }
  }
  return results;
}

function main() {
  console.log('Running benchmarks...');

  try {
    execSync('npx vitest bench --run --config vitest.bench.config.ts --outputJson benchmarks/current.json', {
      cwd: resolve(__dirname, '..'),
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('Benchmark run failed:', err.message);
    process.exit(1);
  }

  if (!existsSync(CURRENT_PATH)) {
    console.error('Benchmark output not found at:', CURRENT_PATH);
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(CURRENT_PATH, 'utf-8'));
  const results = flattenReport(report);
  const commit = getGitCommit();

  const baseline = {
    version: 1,
    timestamp: new Date().toISOString(),
    commit,
    results,
  };

  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`Baseline updated (${Object.keys(results).length} benchmarks, commit: ${commit})`);
}

main();
