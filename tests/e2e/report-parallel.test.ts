import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Deferred: Previously tested createReportGraph() which was removed in Pi migration.
// Needs rewriting to test report generation within AgentLoop's report phase.
describe.skip('Report Sub Graph parallel execution (needs rewrite for AgentLoop)', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'eata-e2e-report-'));
  });

  afterEach(() => {
    try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('compiles and executes with default (no generateObject)', async () => {
    // Previously tested LangGraph report-graph compilation and execution
  });

  it('executes with mock generateObject for each node', async () => {
    // Previously tested report-graph with mocked LLM calls
  });

  it('all 4 analysis nodes run before summarize', async () => {
    // Previously verified LangGraph fan-out/fan-in topology
  });
});

describe.skip('PatternStore integration in report flow (needs rewrite)', () => {
  it('writes patterns from report analysis to JSONL', () => {
    // PatternStore was removed with report-graph
  });

  it('deduplicates patterns by errorType + description', () => {
    // PatternStore was removed with report-graph
  });

  it('caps patterns at 50 for prompt injection', () => {
    // PatternStore was removed with report-graph
  });
});
