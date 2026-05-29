import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

// ── Validation ───────────────────────────────────────────────────────

const TrendsQuerySchema = z.object({
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

export async function trendsRoutes(server: FastifyInstance) {
  server.get('/tasks/trends', async (request, reply) => {
    const parseResult = TrendsQuerySchema.safeParse(request.query);

    if (!parseResult.success) {
      reply.code(400);
      return {
        error: 'Validation failed',
        details: parseResult.error.issues,
      };
    }

    const { days } = parseResult.data;

    // Query tasks grouped by date, counting completed and failed
    const taskRows = server.db
      .prepare(
        `SELECT
           DATE(created_at) as date,
           COUNT(*) as total,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
         FROM tasks
         WHERE created_at >= DATE('now', '-' || ? || ' days')
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
      )
      .all(days) as Array<{
      date: string;
      total: number;
      completed: number;
      failed: number;
    }>;

    // Query average step duration per date
    const durationRows = server.db
      .prepare(
        `SELECT
           DATE(t.created_at) as date,
           AVG(s.duration) as avg_duration
         FROM steps s
         JOIN tasks t ON s.task_id = t.id
         WHERE t.created_at >= DATE('now', '-' || ? || ' days')
         GROUP BY DATE(t.created_at)
         ORDER BY date ASC`,
      )
      .all(days) as Array<{ date: string; avg_duration: number | null }>;

    // Build duration lookup
    const durationMap = new Map<string, number>();
    for (const row of durationRows) {
      if (row.avg_duration != null) {
        durationMap.set(row.date, Math.round(row.avg_duration));
      }
    }

    const dates: string[] = [];
    const passRates: number[] = [];
    const taskCounts: number[] = [];
    const avgDuration: number[] = [];

    for (const row of taskRows) {
      dates.push(row.date);
      const rate = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0;
      passRates.push(rate);
      taskCounts.push(row.total);
      avgDuration.push(durationMap.get(row.date) ?? 0);
    }

    return { dates, passRates, taskCounts, avgDuration };
  });
}
