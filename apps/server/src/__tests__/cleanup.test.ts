/**
 * Cleanup Service Unit Tests
 *
 * Tests for TTL-based cleanup, quota checking, and disk usage calculation
 * in the screenshot lifecycle management system.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getDiskUsage,
  cleanupOldFiles,
  checkDiskQuota,
} from '../services/cleanup.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function createTestDir(): string {
  return join(tmpdir(), `cleanup-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function writeTestFile(filePath: string, size: number): void {
  // Create a buffer of the specified size
  const buffer = Buffer.alloc(size, 0x42);
  writeFileSync(filePath, buffer);
}

function createTaskDir(
  baseDir: string,
  taskId: string,
  ageInDays: number = 0,
  screenshotCount: number = 1,
): void {
  const taskDir = join(baseDir, taskId);
  const screenshotsDir = join(taskDir, 'screenshots');
  const accessibilityDir = join(taskDir, 'accessibility');
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(accessibilityDir, { recursive: true });

  for (let i = 0; i < screenshotCount; i++) {
    const pngFile = join(screenshotsDir, `step-${i}.png`);
    const jsonFile = join(accessibilityDir, `step-${i}.json`);
    writeTestFile(pngFile, 1024); // 1KB per file
    writeTestFile(jsonFile, 512); // 512B per file

    // Set file modification time to simulate age
    if (ageInDays > 0) {
      const pastDate = new Date(Date.now() - ageInDays * 24 * 60 * 60 * 1000);
      utimesSync(pngFile, pastDate, pastDate);
      utimesSync(jsonFile, pastDate, pastDate);
    }
  }
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('getDiskUsage', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('returns zero for empty reports directory', async () => {
    const result = await getDiskUsage(testDir);

    expect(result.totalSize).toBe(0);
    expect(result.fileCount).toBe(0);
  });

  it('calculates total size of all files', async () => {
    createTaskDir(testDir, 'task-1', 0, 2);
    // Each task: 2 screenshots (1024B each) + 2 accessibility (512B each) = 3072B

    const result = await getDiskUsage(testDir);

    expect(result.totalSize).toBe(3072);
    expect(result.fileCount).toBe(4);
  });

  it('counts files from multiple tasks', async () => {
    createTaskDir(testDir, 'task-1', 0, 1);
    createTaskDir(testDir, 'task-2', 0, 2);

    // task-1: 1 png (1024) + 1 json (512) = 1536B, 2 files
    // task-2: 2 png (2048) + 2 json (1024) = 3072B, 4 files
    const result = await getDiskUsage(testDir);

    expect(result.totalSize).toBe(4608);
    expect(result.fileCount).toBe(6);
  });

  it('handles nested directory structures', async () => {
    const taskDir = join(testDir, 'task-1', 'screenshots');
    mkdirSync(taskDir, { recursive: true });
    writeTestFile(join(taskDir, 'step-0.png'), 2048);

    const result = await getDiskUsage(testDir);
    expect(result.totalSize).toBe(2048);
    expect(result.fileCount).toBe(1);
  });

  it('returns zero for non-existent directory', async () => {
    const nonExistent = join(testDir, 'does-not-exist');
    const result = await getDiskUsage(nonExistent);

    expect(result.totalSize).toBe(0);
    expect(result.fileCount).toBe(0);
  });
});

describe('cleanupOldFiles', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('removes files older than TTL', async () => {
    // Create a task with files from 31 days ago
    createTaskDir(testDir, 'old-task', 31, 1);

    const deletedCount = await cleanupOldFiles(testDir, 30);

    expect(deletedCount).toBe(2); // 1 png + 1 json
    expect(existsSync(join(testDir, 'old-task'))).toBe(false);
  });

  it('keeps files within TTL', async () => {
    // Create a task with files from 10 days ago
    createTaskDir(testDir, 'recent-task', 10, 1);

    const deletedCount = await cleanupOldFiles(testDir, 30);

    expect(deletedCount).toBe(0);
    expect(existsSync(join(testDir, 'recent-task'))).toBe(true);
  });

  it('handles mixed old and new files', async () => {
    createTaskDir(testDir, 'old-task', 31, 1);
    createTaskDir(testDir, 'recent-task', 10, 1);

    const deletedCount = await cleanupOldFiles(testDir, 30);

    expect(deletedCount).toBe(2); // Only old-task's files
    expect(existsSync(join(testDir, 'old-task'))).toBe(false);
    expect(existsSync(join(testDir, 'recent-task'))).toBe(true);
  });

  it('uses default TTL of 30 days', async () => {
    createTaskDir(testDir, 'task-31d', 31, 1);
    createTaskDir(testDir, 'task-29d', 29, 1);

    const deletedCount = await cleanupOldFiles(testDir);

    expect(deletedCount).toBe(2); // Only 31d old files
    expect(existsSync(join(testDir, 'task-31d'))).toBe(false);
    expect(existsSync(join(testDir, 'task-29d'))).toBe(true);
  });

  it('returns zero for empty directory', async () => {
    const deletedCount = await cleanupOldFiles(testDir, 30);
    expect(deletedCount).toBe(0);
  });

  it('returns zero for non-existent directory', async () => {
    const nonExistent = join(testDir, 'does-not-exist');
    const deletedCount = await cleanupOldFiles(nonExistent, 30);
    expect(deletedCount).toBe(0);
  });

  it('removes entire task directory when all files are old', async () => {
    createTaskDir(testDir, 'old-task', 31, 3);

    const deletedCount = await cleanupOldFiles(testDir, 30);

    expect(deletedCount).toBe(6); // 3 png + 3 json
    expect(existsSync(join(testDir, 'old-task'))).toBe(false);
  });
});

describe('checkDiskQuota', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('returns under quota when usage is below limit', async () => {
    createTaskDir(testDir, 'task-1', 0, 1);
    // 1KB + 512B = 1536B
    // Quota = 5GB

    const result = await checkDiskQuota(testDir);

    expect(result.usage).toBe(1536);
    expect(result.quota).toBe(5 * 1024 * 1024 * 1024); // 5GB default
    expect(result.isOverQuota).toBe(false);
  });

  it('returns over quota when usage exceeds limit', async () => {
    // Create files that exceed a small quota
    createTaskDir(testDir, 'task-1', 0, 10);

    const result = await checkDiskQuota(testDir, 1024); // 1KB quota

    expect(result.usage).toBe(15360); // 10 * (1024 + 512)
    expect(result.quota).toBe(1024);
    expect(result.isOverQuota).toBe(true);
  });

  it('uses default quota of 5GB', async () => {
    const result = await checkDiskQuota(testDir);

    expect(result.quota).toBe(5 * 1024 * 1024 * 1024);
  });

  it('accepts custom quota', async () => {
    const customQuota = 1024 * 1024; // 1MB
    const result = await checkDiskQuota(testDir, customQuota);

    expect(result.quota).toBe(customQuota);
  });

  it('handles non-existent directory', async () => {
    const nonExistent = join(testDir, 'does-not-exist');
    const result = await checkDiskQuota(nonExistent);

    expect(result.usage).toBe(0);
    expect(result.isOverQuota).toBe(false);
  });
});
