/**
 * Storage API Routes
 *
 * Provides endpoints for disk usage monitoring and manual cleanup
 * of screenshot/accessibility files.
 */
import type { FastifyInstance } from 'fastify';
import { getDiskUsage, cleanupOldFiles, checkDiskQuota } from '../services/cleanup.js';

export async function storageRoutes(server: FastifyInstance) {
  // GET /storage — get disk usage and quota status
  server.get('/storage', async () => {
    const dataDir = server.dataDir as string;
    const reportsDir = `${dataDir}/reports`;

    const usage = await getDiskUsage(reportsDir);
    const quota = await checkDiskQuota(reportsDir);

    return {
      totalSize: usage.totalSize,
      fileCount: usage.fileCount,
      quota: quota.quota,
      isOverQuota: quota.isOverQuota,
    };
  });

  // POST /storage/cleanup — trigger manual cleanup
  server.post('/storage/cleanup', async () => {
    const dataDir = server.dataDir as string;
    const reportsDir = `${dataDir}/reports`;

    const deletedCount = await cleanupOldFiles(reportsDir);
    const usage = await getDiskUsage(reportsDir);

    return {
      deletedCount,
      totalSize: usage.totalSize,
      fileCount: usage.fileCount,
    };
  });
}
