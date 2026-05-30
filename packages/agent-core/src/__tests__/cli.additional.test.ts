import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  parseReplayArgs,
  parseExportArgs,
  parseImportArgs,
  parseGenerateArgs,
  validateArgs,
  formatStepProgress,
  formatResult,
} from '../cli.js';

// ─── parseReplayArgs ──────────────────────────────────────

describe('parseReplayArgs', () => {
  it('returns null when replay subcommand is not present', () => {
    const result = parseReplayArgs(['node', 'cli.ts', '--goal', 'test']);
    expect(result).toBeNull();
  });

  it('returns null when taskId is missing', () => {
    const result = parseReplayArgs(['node', 'cli.ts', 'replay', '--strict']);
    expect(result).toBeNull();
  });

  it('parses replay with taskId', () => {
    const result = parseReplayArgs([
      'node', 'cli.ts', 'replay', '--taskId', 'abc-123',
    ]);
    expect(result).toEqual({
      taskId: 'abc-123',
      strict: false,
      loose: false,
      dbPath: undefined,
    });
  });

  it('parses replay with --strict flag', () => {
    const result = parseReplayArgs([
      'node', 'cli.ts', 'replay', '--taskId', 'abc-123', '--strict',
    ]);
    expect(result).not.toBeNull();
    expect(result!.strict).toBe(true);
    expect(result!.loose).toBe(false);
  });

  it('parses replay with --loose flag', () => {
    const result = parseReplayArgs([
      'node', 'cli.ts', 'replay', '--taskId', 'abc-123', '--loose',
    ]);
    expect(result).not.toBeNull();
    expect(result!.loose).toBe(true);
  });

  it('parses replay with --db path', () => {
    const result = parseReplayArgs([
      'node', 'cli.ts', 'replay', '--taskId', 'abc-123', '--db', '/custom/path.db',
    ]);
    expect(result).not.toBeNull();
    expect(result!.dbPath).toBe('/custom/path.db');
  });

  it('handles replay subcommand appearing later in argv', () => {
    const result = parseReplayArgs([
      'node', 'cli.ts', 'extra', 'replay', '--taskId', 'xyz',
    ]);
    expect(result).not.toBeNull();
    expect(result!.taskId).toBe('xyz');
  });
});

// ─── parseExportArgs ──────────────────────────────────────

describe('parseExportArgs', () => {
  it('returns null when export subcommand is not present', () => {
    const result = parseExportArgs(['node', 'cli.ts']);
    expect(result).toBeNull();
  });

  it('returns null when taskId is missing', () => {
    const result = parseExportArgs(['node', 'cli.ts', 'export', '--format', 'jsonl']);
    expect(result).toBeNull();
  });

  it('parses export with taskId and defaults', () => {
    const result = parseExportArgs([
      'node', 'cli.ts', 'export', '--taskId', 'task-1',
    ]);
    expect(result).toEqual({
      taskId: 'task-1',
      format: 'jsonl',
      output: undefined,
      dbPath: undefined,
    });
  });

  it('parses export with all options', () => {
    const result = parseExportArgs([
      'node', 'cli.ts', 'export',
      '--taskId', 'task-1',
      '--format', 'jsonl',
      '--output', '/out/file.jsonl',
      '--db', '/custom/db.sqlite',
    ]);
    expect(result).toEqual({
      taskId: 'task-1',
      format: 'jsonl',
      output: '/out/file.jsonl',
      dbPath: '/custom/db.sqlite',
    });
  });

  it('defaults format to jsonl', () => {
    const result = parseExportArgs([
      'node', 'cli.ts', 'export', '--taskId', 't1',
    ]);
    expect(result!.format).toBe('jsonl');
  });
});

// ─── parseImportArgs ──────────────────────────────────────

describe('parseImportArgs', () => {
  it('returns null when import subcommand is not present', () => {
    const result = parseImportArgs(['node', 'cli.ts']);
    expect(result).toBeNull();
  });

  it('returns null when file is missing', () => {
    const result = parseImportArgs(['node', 'cli.ts', 'import', '--db', '/path']);
    expect(result).toBeNull();
  });

  it('parses import with file', () => {
    const result = parseImportArgs([
      'node', 'cli.ts', 'import', '--file', '/data/import.jsonl',
    ]);
    expect(result).toEqual({
      file: '/data/import.jsonl',
      dbPath: undefined,
    });
  });

  it('parses import with db path', () => {
    const result = parseImportArgs([
      'node', 'cli.ts', 'import', '--file', '/data/import.jsonl', '--db', '/custom/db.sqlite',
    ]);
    expect(result).not.toBeNull();
    expect(result!.file).toBe('/data/import.jsonl');
    expect(result!.dbPath).toBe('/custom/db.sqlite');
  });
});

// ─── parseGenerateArgs ────────────────────────────────────

describe('parseGenerateArgs', () => {
  it('returns null when generate subcommand is not present', () => {
    const result = parseGenerateArgs(['node', 'cli.ts']);
    expect(result).toBeNull();
  });

  it('returns null when taskId is missing', () => {
    const result = parseGenerateArgs(['node', 'cli.ts', 'generate', '--format', 'playwright']);
    expect(result).toBeNull();
  });

  it('parses generate with taskId and defaults', () => {
    const result = parseGenerateArgs([
      'node', 'cli.ts', 'generate', '--taskId', 'task-1',
    ]);
    expect(result).toEqual({
      taskId: 'task-1',
      format: 'playwright',
      output: undefined,
      dbPath: undefined,
    });
  });

  it('parses generate with all options', () => {
    const result = parseGenerateArgs([
      'node', 'cli.ts', 'generate',
      '--taskId', 'task-1',
      '--format', 'playwright',
      '--output', '/out/test.spec.ts',
      '--db', '/custom/db.sqlite',
    ]);
    expect(result).toEqual({
      taskId: 'task-1',
      format: 'playwright',
      output: '/out/test.spec.ts',
      dbPath: '/custom/db.sqlite',
    });
  });

  it('defaults format to playwright', () => {
    const result = parseGenerateArgs([
      'node', 'cli.ts', 'generate', '--taskId', 't1',
    ]);
    expect(result!.format).toBe('playwright');
  });
});

// ─── parseArgs edge cases ─────────────────────────────────

describe('parseArgs edge cases', () => {
  it('handles --provider flag', () => {
    const result = parseArgs([
      'node', 'cli.ts', '--goal', 'test', '--app', '/app', '--provider', 'openai',
    ]);
    expect(result.providerId).toBe('openai');
  });

  it('sets providerId to undefined when --provider is absent', () => {
    const result = parseArgs([
      'node', 'cli.ts', '--goal', 'test', '--app', '/app',
    ]);
    expect(result.providerId).toBeUndefined();
  });

  it('handles boolean flags (no value after --key)', () => {
    const result = parseArgs([
      'node', 'cli.ts', '--goal', 'test', '--verbose',
    ]);
    // --verbose has no next value, so it's set to 'true'
    // This doesn't affect CliArgs but tests the parsing branch
    expect(result.goal).toBe('test');
  });

  it('handles last arg being a flag with no value', () => {
    const result = parseArgs([
      'node', 'cli.ts', '--goal', 'test', '--app', '/app', '--dry-run',
    ]);
    expect(result.goal).toBe('test');
    expect(result.targetAppPath).toBe('/app');
  });
});

// ─── validateArgs edge cases ──────────────────────────────

describe('validateArgs edge cases', () => {
  it('returns ok: true and preserves providerId', () => {
    const result = validateArgs({
      goal: 'Test',
      targetAppPath: '/app',
      llmModel: 'gpt-4o',
      maxSteps: 10,
      providerId: 'custom-provider',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.providerId).toBe('custom-provider');
    }
  });

  it('returns ok: true with undefined providerId', () => {
    const result = validateArgs({
      goal: 'Test',
      targetAppPath: '/app',
      llmModel: 'gpt-4o',
      maxSteps: 10,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.providerId).toBeUndefined();
    }
  });

  it('rejects negative maxSteps', () => {
    const result = validateArgs({
      goal: 'Test',
      targetAppPath: '/app',
      llmModel: 'gpt-4o',
      maxSteps: -5,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects zero maxSteps', () => {
    const result = validateArgs({
      goal: 'Test',
      targetAppPath: '/app',
      llmModel: 'gpt-4o',
      maxSteps: 0,
    });
    expect(result.ok).toBe(false);
  });

  it('error message contains path and message from zod issues', () => {
    const result = validateArgs({
      goal: '',
      targetAppPath: '',
      llmModel: '',
      maxSteps: 50,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('goal');
    }
  });
});

// ─── formatStepProgress edge cases ────────────────────────

describe('formatStepProgress edge cases', () => {
  it('formats unknown phase via default branch', () => {
    const record = {
      id: 'test',
      taskId: 'test',
      stepIndex: 0,
      phase: 'custom-phase' as string,
      status: 'unknown' as string,
      timestamp: new Date().toISOString(),
      duration: 100,
    };
    const output = formatStepProgress(record as never, 1, 10);
    expect(output).toContain('[Step 1/10]');
    expect(output).toContain('custom-phase');
  });

  it('formats observe with no observation text', () => {
    const record = {
      id: 'test',
      taskId: 'test',
      stepIndex: 0,
      phase: 'observe',
      status: 'success',
      timestamp: new Date().toISOString(),
      duration: 100,
    };
    const output = formatStepProgress(record as never, 1, 10);
    expect(output).toContain('Scanning app...');
  });

  it('formats plan with no reasoning', () => {
    const record = {
      id: 'test',
      taskId: 'test',
      stepIndex: 0,
      phase: 'plan',
      status: 'success',
      timestamp: new Date().toISOString(),
      duration: 100,
    };
    const output = formatStepProgress(record as never, 1, 10);
    expect(output).toContain('Planning next action...');
  });

  it('formats execute with no action', () => {
    const record = {
      id: 'test',
      taskId: 'test',
      stepIndex: 0,
      phase: 'execute',
      status: 'success',
      timestamp: new Date().toISOString(),
      duration: 100,
    };
    const output = formatStepProgress(record as never, 1, 10);
    expect(output).toContain('unknown');
  });

  it('formats verify with no reasoning or observation', () => {
    const record = {
      id: 'test',
      taskId: 'test',
      stepIndex: 0,
      phase: 'verify',
      status: 'success',
      timestamp: new Date().toISOString(),
      duration: 100,
    };
    const output = formatStepProgress(record as never, 1, 10);
    expect(output).toContain('Checking...');
  });
});

// ─── formatResult edge cases ──────────────────────────────

describe('formatResult edge cases', () => {
  it('formats completed status as PASS', () => {
    const output = formatResult('completed', 5, 10000);
    expect(output).toContain('PASS');
    expect(output).toContain('5 steps');
    expect(output).toContain('10.0s');
  });

  it('formats passed status as PASSED', () => {
    const output = formatResult('passed', 3, 500);
    expect(output).toContain('PASSED');
  });

  it('formats zero duration', () => {
    const output = formatResult('completed', 1, 0);
    expect(output).toContain('0.0s');
  });

  it('formats large duration', () => {
    const output = formatResult('completed', 100, 300000);
    expect(output).toContain('300.0s');
  });
});
