import type Database from 'better-sqlite3';

export interface TokenUsageRecord {
  id: number;
  task_id: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  created_at: string;
}

export interface TokenUsageSummary {
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  record_count: number;
}

export interface TokenUsageByProvider {
  provider: string;
  model: string;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  record_count: number;
}

export interface TokenUsageByDay {
  date: string;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  record_count: number;
}

export interface DateRangeFilter {
  start_date?: string;
  end_date?: string;
}

export interface TokenUsageQueryResult {
  records: TokenUsageRecord[];
  summary: TokenUsageSummary;
  by_provider: TokenUsageByProvider[];
  by_day: TokenUsageByDay[];
  total: number;
  page: number;
  limit: number;
}

export class UsageAuditService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Record token usage for a task execution.
   */
  recordUsage(params: {
    task_id: string;
    provider: string;
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
  }): TokenUsageRecord {
    const stmt = this.db.prepare(`
      INSERT INTO token_usage (task_id, provider, model, prompt_tokens, completion_tokens)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      params.task_id,
      params.provider,
      params.model,
      params.prompt_tokens,
      params.completion_tokens,
    );

    return this.db.prepare('SELECT * FROM token_usage WHERE id = ?').get(result.lastInsertRowid) as TokenUsageRecord;
  }

  /**
   * Query token usage with date range filtering, pagination, and aggregations.
   */
  queryUsage(filters: DateRangeFilter & {
    provider?: string;
    page?: number;
    limit?: number;
  }): TokenUsageQueryResult {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.start_date) {
      conditions.push('created_at >= ?');
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push('created_at <= ?');
      params.push(filters.end_date + ' 23:59:59');
    }

    if (filters.provider) {
      conditions.push('provider = ?');
      params.push(filters.provider);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countRow = this.db.prepare(
      `SELECT COUNT(*) as total FROM token_usage ${whereClause}`
    ).get(...params) as { total: number };

    // Get paginated records
    const records = this.db.prepare(
      `SELECT * FROM token_usage ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as TokenUsageRecord[];

    // Get summary
    const summary = this.db.prepare(
      `SELECT
        COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
        COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens,
        COUNT(*) as record_count
      FROM token_usage ${whereClause}`
    ).get(...params) as TokenUsageSummary;

    // Get by provider
    const byProvider = this.db.prepare(
      `SELECT
        provider,
        model,
        COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
        COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens,
        COUNT(*) as record_count
      FROM token_usage ${whereClause}
      GROUP BY provider, model
      ORDER BY total_tokens DESC`
    ).all(...params) as TokenUsageByProvider[];

    // Get by day
    const byDay = this.db.prepare(
      `SELECT
        DATE(created_at) as date,
        COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
        COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens,
        COUNT(*) as record_count
      FROM token_usage ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY date DESC`
    ).all(...params) as TokenUsageByDay[];

    return {
      records,
      summary,
      by_provider: byProvider,
      by_day: byDay,
      total: countRow.total,
      page,
      limit,
    };
  }

  /**
   * Get usage for a specific task.
   */
  getTaskUsage(taskId: string): TokenUsageRecord[] {
    return this.db.prepare(
      'SELECT * FROM token_usage WHERE task_id = ? ORDER BY created_at DESC'
    ).all(taskId) as TokenUsageRecord[];
  }

  /**
   * Get available providers for filtering.
   */
  getProviders(): string[] {
    const rows = this.db.prepare(
      'SELECT DISTINCT provider FROM token_usage ORDER BY provider'
    ).all() as Array<{ provider: string }>;

    return rows.map(r => r.provider);
  }
}
