import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initDatabase } from '../db/index.js';

describe('initDatabase', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it('creates database in existing directory', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'db-init-'));
    dirs.push(tmpDir);
    const dbPath = join(tmpDir, 'test.sqlite');

    const db = initDatabase(dbPath);
    expect(existsSync(dbPath)).toBe(true);
    db.close();
  });

  it('creates parent directory when it does not exist', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'db-init-'));
    dirs.push(tmpDir);
    const nestedDir = join(tmpDir, 'deep', 'nested');
    const dbPath = join(nestedDir, 'test.sqlite');

    expect(existsSync(nestedDir)).toBe(false);

    const db = initDatabase(dbPath);
    expect(existsSync(nestedDir)).toBe(true);
    expect(existsSync(dbPath)).toBe(true);
    db.close();
  });

  it('enables WAL journal mode', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'db-init-'));
    dirs.push(tmpDir);
    const dbPath = join(tmpDir, 'wal-test.sqlite');

    const db = initDatabase(dbPath);
    const result = db.pragma('journal_mode', { simple: true });
    expect(result).toBe('wal');
    db.close();
  });
});
