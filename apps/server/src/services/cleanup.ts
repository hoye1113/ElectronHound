/**
 * Cleanup Service - Screenshot Lifecycle Management
 *
 * Provides configurable TTL-based cleanup and disk quota management
 * for test run screenshots and accessibility snapshots.
 */
import { readdir, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createStderrLogger } from '../utils/logger.js';

const log = createStderrLogger('cleanup');

// ── Constants ──────────────────────────────────────────────────────────

const DEFAULT_TTL_DAYS = 30;
const DEFAULT_QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

// ── Types ──────────────────────────────────────────────────────────────

export interface DiskUsage {
  totalSize: number;
  fileCount: number;
}

export interface QuotaStatus {
  usage: number;
  quota: number;
  isOverQuota: boolean;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Calculate the total disk usage (size and file count) of a directory
 * by recursively walking all files.
 *
 * @param reportsDir - Path to the reports directory
 * @returns Object with totalSize (bytes) and fileCount
 */
export async function getDiskUsage(reportsDir: string): Promise<DiskUsage> {
  let totalSize = 0;
  let fileCount = 0;

  try {
    await walk(reportsDir, (filePath) => {
      // walk already filters to files only
      return stat(filePath).then(s => {
        totalSize += s.size;
        fileCount += 1;
      });
    });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // Directory doesn't exist - no usage
      return { totalSize: 0, fileCount: 0 };
    }
    throw err;
  }

  return { totalSize, fileCount };
}

/**
 * Remove task directories whose most recent file modification is older
 * than the given TTL.
 *
 * Strategy: scan top-level task directories under reportsDir, check the
 * mtime of each file within, and remove the entire task directory if ALL
 * files are older than the cutoff. This ensures we don't partially
 * delete a task's data.
 *
 * @param reportsDir - Path to the reports directory
 * @param ttlDays - Maximum age in days (default: 30)
 * @returns Number of files deleted
 */
export async function cleanupOldFiles(
  reportsDir: string,
  ttlDays: number = DEFAULT_TTL_DAYS,
): Promise<number> {
  const cutoff = Date.now() - ttlDays * 24 * 60 * 60 * 1000;
  let deletedCount = 0;

  let entries: string[];
  try {
    entries = await readdir(reportsDir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }
    throw err;
  }

  for (const entry of entries) {
    const taskDir = join(reportsDir, entry);
    try {
      const taskStat = await stat(taskDir);
      if (!taskStat.isDirectory()) continue;

      // Collect all files and their mtimes
      const files = await collectFiles(taskDir);

      if (files.length === 0) continue;

      // Check if ALL files are older than cutoff
      const allOld = files.every(f => f.mtimeMs < cutoff);

      if (allOld) {
        // Remove the entire task directory
        await rm(taskDir, { recursive: true, force: true });
        deletedCount += files.length;
        log.info(`Cleaned up old task directory: ${entry} (${files.length} files)`);
      }
    } catch (err: unknown) {
      log.warn(`Error processing task directory ${entry}: ${toErrorMessage(err)}`);
    }
  }

  if (deletedCount > 0) {
    log.info(`Cleanup complete: removed ${deletedCount} files`);
  }

  return deletedCount;
}

/**
 * Check whether current disk usage exceeds the configured quota.
 *
 * @param reportsDir - Path to the reports directory
 * @param quotaBytes - Maximum allowed disk usage in bytes (default: 5 GB)
 * @returns QuotaStatus with usage, quota, and isOverQuota flag
 */
export async function checkDiskQuota(
  reportsDir: string,
  quotaBytes: number = DEFAULT_QUOTA_BYTES,
): Promise<QuotaStatus> {
  const { totalSize } = await getDiskUsage(reportsDir);

  return {
    usage: totalSize,
    quota: quotaBytes,
    isOverQuota: totalSize > quotaBytes,
  };
}

// ── Private helpers ────────────────────────────────────────────────────

interface FileInfo {
  path: string;
  mtimeMs: number;
}

/**
 * Recursively collect all files under a directory with their mtime.
 */
async function collectFiles(dir: string): Promise<FileInfo[]> {
  const files: FileInfo[] = [];

  await walk(dir, async (filePath) => {
    const s = await stat(filePath);
    files.push({ path: filePath, mtimeMs: s.mtimeMs });
  });

  return files;
}

/**
 * Recursively walk a directory and invoke callback for each file.
 */
async function walk(dir: string, onFile: (filePath: string) => Promise<void>): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, onFile);
    } else if (entry.isFile()) {
      await onFile(fullPath);
    }
  }
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
