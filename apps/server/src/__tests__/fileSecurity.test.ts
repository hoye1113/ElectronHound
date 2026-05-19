import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validatePath, PathTraversalError } from '../services/fileSecurity.js';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

describe('validatePath', () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'eata-security-test-'));
  });

  afterEach(() => {
    try {
      rmSync(baseDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('valid path passes', () => {
    const result = validatePath(baseDir, 'task-123/manifest.json');
    expect(result).toContain('task-123');
    expect(result).toContain('manifest.json');
  });

  it('valid path with subdirectory passes', () => {
    const result = validatePath(baseDir, 'task-456/screenshots/step-1.png');
    expect(result).toContain('task-456');
    expect(result).toContain('screenshots');
    expect(result).toContain('step-1.png');
  });

  it('simple task ID passes', () => {
    const result = validatePath(baseDir, 'my-task');
    expect(result).toContain('my-task');
  });

  it('../../etc/passwd throws PathTraversalError', () => {
    expect(() => validatePath(baseDir, '../../../etc/passwd')).toThrow(
      PathTraversalError,
    );
  });

  it('../outside throws PathTraversalError', () => {
    expect(() => validatePath(baseDir, '../outside')).toThrow(
      PathTraversalError,
    );
  });

  it('.. in taskId throws PathTraversalError', () => {
    expect(() => validatePath(baseDir, '..')).toThrow(PathTraversalError);
  });

  it('path with .. in the middle throws PathTraversalError', () => {
    expect(() => validatePath(baseDir, 'task/../escape')).toThrow(
      PathTraversalError,
    );
  });

  it('empty task ID throws PathTraversalError', () => {
    expect(() => validatePath(baseDir, '')).toThrow(PathTraversalError);
  });

  it('whitespace-only task ID throws PathTraversalError', () => {
    expect(() => validatePath(baseDir, '   ')).toThrow(PathTraversalError);
  });

  it('double-encoded traversal is treated as literal filename', () => {
    // ..%2F..%2Fetc is not decoded by path.resolve, so it becomes a valid
    // child filename rather than a traversal
    const result = validatePath(baseDir, '..%2F..%2Fetc');
    expect(result).toContain('..%2F..%2Fetc');
    // The encoded path becomes a literal filename inside baseDir
  });

  it('backslash separators are normalized (Windows)', () => {
    const result = validatePath(baseDir, 'task-789\\screenshots\\step.png');
    expect(result).toContain('task-789');
    expect(result).toContain('screenshots');
    expect(result).toContain('step.png');
  });

  it('mixed separators are handled', () => {
    const result = validatePath(baseDir, 'task-abc/screenshots\\step.png');
    expect(result).toContain('task-abc');
    expect(result).toContain('screenshots');
    expect(result).toContain('step.png');
  });

  it('absolute path target throws PathTraversalError', () => {
    // An absolute path would resolve to a different root
    const absoluteTarget = join(tmpdir(), 'escape');
    expect(() => validatePath(baseDir, absoluteTarget)).toThrow(
      PathTraversalError,
    );
  });

  it('single dot segment passes', () => {
    const result = validatePath(baseDir, './task-123/manifest.json');
    expect(result).toContain('task-123');
    expect(result).toContain('manifest.json');
  });

  it('throws with descriptive error name', () => {
    try {
      validatePath(baseDir, '../../etc/passwd');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PathTraversalError);
      expect(err instanceof Error).toBe(true);
      expect((err as Error).name).toBe('PathTraversalError');
      expect((err as Error).message).toContain('Path traversal');
    }
  });
});
