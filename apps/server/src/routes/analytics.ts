import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

// ── Validation ───────────────────────────────────────────────────────

const AnalyticsQuerySchema = z.object({
  days: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .transform((val) => {
      if (!val) return 30;
      const n = parseInt(val, 10);
      return Math.min(365, Math.max(1, n));
    }),
});

// ── Route ────────────────────────────────────────────────────────────

export async function analyticsRoutes(server: FastifyInstance) {
  server.get('/tasks/analytics', async (request, reply) => {
    const parseResult = AnalyticsQuerySchema.safeParse(request.query);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Validation failed',
        details: parseResult.error.issues,
      };
    }

    const { days } = parseResult.data;

    // 1. Completion rate per day
    const completionRows = server.db
      .prepare(
        `SELECT
           DATE(created_at) as date,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
         FROM tasks
         WHERE created_at >= DATE('now', '-' || ? || ' days')
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
      )
      .all(days) as Array<{ date: string; completed: number; failed: number }>;

    // 2. Average execution duration per day
    const durationRows = server.db
      .prepare(
        `SELECT
           DATE(t.created_at) as date,
           ROUND(AVG(t.updated_at - t.created_at) * 86400) as avgSeconds
         FROM tasks t
         WHERE t.created_at >= DATE('now', '-' || ? || ' days')
           AND t.status IN ('completed', 'failed')
         GROUP BY DATE(t.created_at)
         ORDER BY date ASC`,
      )
      .all(days) as Array<{ date: string; avgSeconds: number | null }>;

    // 3. Status distribution
    const statusRows = server.db
      .prepare(
        `SELECT
           status,
           COUNT(*) as count
         FROM tasks
         WHERE created_at >= DATE('now', '-' || ? || ' days')
         GROUP BY status`,
      )
      .all(days) as Array<{ status: string; count: number }>;

    const statusDistribution: Record<string, number> = {
      completed: 0,
      failed: 0,
      cancelled: 0,
      queued: 0,
    };
    for (const row of statusRows) {
      if (row.status in statusDistribution) {
        statusDistribution[row.status] = row.count;
      }
    }

    // 4. Token usage per day
    const tokenRows = server.db
      .prepare(
        `SELECT
           DATE(created_at) as date,
           SUM(prompt_tokens + completion_tokens) as tokens
         FROM token_usage
         WHERE created_at >= DATE('now', '-' || ? || ' days')
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
      )
      .all(days) as Array<{ date: string; tokens: number }>;

    return {
      completionRate: completionRows,
      avgDuration: durationRows.map((row) => ({
        date: row.date,
        avgSeconds: row.avgSeconds ?? 0,
      })),
      statusDistribution,
      tokenUsage: tokenRows,
    };
  });
}
