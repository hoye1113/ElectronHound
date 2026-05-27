/**
 * Result Export Service
 *
 * Provides export functionality for tasks, reports, and batches
 * in JSON, CSV, and HTML formats.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { Task, StepRecord } from '@eata/shared-types';
import { dbRowToTask, dbRowToStep } from '../utils/dbMappers.js';
import { validatePath } from './fileSecurity.js';

// ── Types ────────────────────────────────────────────────────────────

export type ExportFormat = 'json' | 'csv' | 'html';

export interface ExportResult {
  content: string;
  contentType: string;
  fileExtension: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  queued: '#71717a',
  running: '#60a5fa',
  completed: '#34d399',
  failed: '#f87171',
  cancelled: '#fbbf24',
  aborted: '#a1a1aa',
  success: '#34d399',
  retry: '#fbbf24',
  skipped: '#71717a',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m ${remSec}s`;
}

// ── CSS for HTML exports ─────────────────────────────────────────────

const EXPORT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #18181b;
    color: #e4e4e7;
    line-height: 1.6;
    padding: 2rem;
  }
  .container { max-width: 960px; margin: 0 auto; }
  .header {
    border-bottom: 1px solid #3f3f46;
    padding-bottom: 1.5rem;
    margin-bottom: 2rem;
  }
  .header h1 { font-size: 1.5rem; font-weight: 700; color: #fafafa; }
  .header h2 { font-size: 1.1rem; font-weight: 600; color: #d4d4d8; margin-top: 0.5rem; }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-top: 0.75rem;
  }
  .meta-item {
    font-size: 0.8rem;
    color: #a1a1aa;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .badge {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .section { margin-bottom: 2rem; }
  .section-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: #a1a1aa;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 1rem;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
  }
  .summary-card {
    background: #27272a;
    border: 1px solid #3f3f46;
    border-radius: 0.5rem;
    padding: 1.25rem;
    text-align: center;
  }
  .summary-card .value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #fafafa;
  }
  .summary-card .label {
    font-size: 0.75rem;
    color: #a1a1aa;
    margin-top: 0.25rem;
  }
  .summary-card p { font-size: 0.9rem; color: #d4d4d8; }
  .summary-card .error { color: #f87171; margin-top: 0.5rem; }
  table {
    width: 100%;
    border-collapse: collapse;
    background: #27272a;
    border: 1px solid #3f3f46;
    border-radius: 0.5rem;
    overflow: hidden;
  }
  th, td {
    padding: 0.75rem 1rem;
    text-align: left;
    border-bottom: 1px solid #3f3f46;
    font-size: 0.85rem;
  }
  th {
    background: #1f1f23;
    color: #a1a1aa;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
  }
  tr:last-child td { border-bottom: none; }
  .error-detail {
    background: #27272a;
    border: 1px solid #f8717133;
    border-left: 3px solid #f87171;
    border-radius: 0.5rem;
    padding: 1rem 1.25rem;
    margin-top: 1rem;
  }
  .error-detail h3 { color: #f87171; font-size: 0.85rem; margin-bottom: 0.5rem; }
  .error-detail p { color: #d4d4d8; font-size: 0.85rem; }
  .footer {
    border-top: 1px solid #3f3f46;
    padding-top: 1rem;
    margin-top: 2rem;
    font-size: 0.75rem;
    color: #52525b;
    text-align: center;
  }
  @media (max-width: 640px) {
    body { padding: 1rem; }
    .meta { flex-direction: column; }
    .summary-grid { grid-template-columns: repeat(2, 1fr); }
    table { font-size: 0.8rem; }
    th, td { padding: 0.5rem; }
  }
`;

// ── Export Service ───────────────────────────────────────────────────

export class ExportService {
  constructor(private db: Database.Database) {}

  /**
   * Export a single task with its steps and logs.
   */
  exportTask(taskId: string, format: ExportFormat): ExportResult {
    const taskRow = this.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(taskId) as Record<string, unknown> | undefined;

    if (!taskRow) {
      throw new ExportError('Task not found', 404);
    }

    const task = dbRowToTask(taskRow);

    const stepRows = this.db
      .prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_index')
      .all(taskId) as Array<Record<string, unknown>>;
    const steps = stepRows.map(dbRowToStep);

    const logRows = this.db
      .prepare('SELECT * FROM logs WHERE task_id = ? ORDER BY timestamp')
      .all(taskId) as Array<Record<string, unknown>>;

    switch (format) {
      case 'json':
        return this.toJson(task, steps, logRows);
      case 'csv':
        return this.toCsv([{ task, steps }]);
      case 'html':
        return this.toHtml(task, steps);
    }
  }

  /**
   * Export a report (task data from DB plus filesystem report data).
   */
  exportReport(reportId: string, format: ExportFormat): ExportResult {
    const taskRow = this.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(reportId) as Record<string, unknown> | undefined;

    if (!taskRow) {
      throw new ExportError('Report not found', 404);
    }

    const task = dbRowToTask(taskRow);

    const stepRows = this.db
      .prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_index')
      .all(reportId) as Array<Record<string, unknown>>;
    const steps = stepRows.map(dbRowToStep);

    // Attempt to read additional report data from filesystem
    let reportData: Record<string, unknown> | null = null;
    try {
      const reportDir = validatePath(join('data', 'reports'), reportId);
      const manifestPath = join(reportDir, 'manifest.json');
      if (existsSync(manifestPath)) {
        reportData = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      }
    } catch {
      // No filesystem report; use DB data only
    }

    const logRows = this.db
      .prepare('SELECT * FROM logs WHERE task_id = ? ORDER BY timestamp')
      .all(reportId) as Array<Record<string, unknown>>;

    switch (format) {
      case 'json':
        return this.toJson(task, steps, logRows, reportData);
      case 'csv':
        return this.toCsv([{ task, steps }]);
      case 'html':
        return this.toHtml(task, steps);
    }
  }

  /**
   * Export all tasks in a batch.
   */
  exportBatch(batchId: string, format: ExportFormat): ExportResult {
    // Verify batch exists
    const batchRow = this.db
      .prepare('SELECT * FROM batches WHERE id = ?')
      .get(batchId) as Record<string, unknown> | undefined;

    if (!batchRow) {
      throw new ExportError('Batch not found', 404);
    }

    const taskRows = this.db
      .prepare('SELECT * FROM tasks WHERE batch_id = ? ORDER BY created_at')
      .all(batchId) as Array<Record<string, unknown>>;

    if (taskRows.length === 0) {
      throw new ExportError('No tasks found in batch', 404);
    }

    const tasks = taskRows.map(dbRowToTask);

    // Fetch all steps in a single query to avoid N+1
    const taskIds = tasks.map((t) => t.id);
    const placeholders = taskIds.map(() => '?').join(', ');
    const allStepRows = this.db
      .prepare(`SELECT * FROM steps WHERE task_id IN (${placeholders}) ORDER BY task_id, step_index`)
      .all(...taskIds) as Array<Record<string, unknown>>;

    // Group steps by task_id in memory
    const stepsByTaskId = new Map<string, StepRecord[]>();
    for (const row of allStepRows) {
      const taskId = String(row.task_id);
      if (!stepsByTaskId.has(taskId)) {
        stepsByTaskId.set(taskId, []);
      }
      stepsByTaskId.get(taskId)!.push(dbRowToStep(row));
    }

    const tasksWithSteps = tasks.map((task) => ({
      task,
      steps: stepsByTaskId.get(task.id) ?? [],
    }));

    const batchInfo = {
      id: String(batchRow.id),
      name: batchRow.name as string | null,
      status: String(batchRow.status),
      totalTasks: Number(batchRow.total_tasks),
      completedTasks: Number(batchRow.completed_tasks),
      failedTasks: Number(batchRow.failed_tasks),
      priority: String(batchRow.priority),
      createdAt: String(batchRow.created_at),
      updatedAt: String(batchRow.updated_at),
    };

    switch (format) {
      case 'json':
        return this.batchToJson(batchInfo, tasksWithSteps);
      case 'csv':
        return this.toCsv(tasksWithSteps);
      case 'html':
        return this.batchToHtml(batchInfo, tasksWithSteps);
    }
  }

  // ── JSON formatters ────────────────────────────────────────────────

  private toJson(
    task: Task,
    steps: StepRecord[],
    logs: Array<Record<string, unknown>> = [],
    reportData?: Record<string, unknown> | null,
  ): ExportResult {
    const data: Record<string, unknown> = {
      task,
      steps,
      logs: logs.map((row) => ({
        id: row.id,
        level: row.level,
        message: row.message,
        metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
        timestamp: row.timestamp,
      })),
    };

    if (reportData) {
      data.report = reportData;
    }

    return {
      content: JSON.stringify(data, null, 2),
      contentType: 'application/json; charset=utf-8',
      fileExtension: 'json',
    };
  }

  private batchToJson(
    batchInfo: Record<string, unknown>,
    tasksWithSteps: Array<{ task: Task; steps: StepRecord[] }>,
  ): ExportResult {
    const data = {
      batch: batchInfo,
      tasks: tasksWithSteps.map(({ task, steps }) => ({ task, steps })),
    };

    return {
      content: JSON.stringify(data, null, 2),
      contentType: 'application/json; charset=utf-8',
      fileExtension: 'json',
    };
  }

  // ── CSV formatter ──────────────────────────────────────────────────

  private toCsv(
    tasksWithSteps: Array<{ task: Task; steps: StepRecord[] }>,
  ): ExportResult {
    const headers = [
      'task_id',
      'task_status',
      'step_id',
      'step_name',
      'step_status',
      'step_duration',
      'error_message',
    ];

    const rows: string[] = [headers.join(',')];

    for (const { task, steps } of tasksWithSteps) {
      if (steps.length === 0) {
        // Task with no steps — emit one row with empty step fields
        rows.push(
          [
            escapeCsvField(task.id),
            escapeCsvField(task.status),
            '',
            '',
            '',
            '0',
            escapeCsvField(task.resultSummary?.error ?? ''),
          ].join(','),
        );
        continue;
      }

      for (const step of steps) {
        const errorMsg =
          (step.result && typeof step.result === 'object' && 'error' in step.result
            ? String((step.result as Record<string, unknown>).error)
            : '') ||
          (task.resultSummary?.error ?? '');

        rows.push(
          [
            escapeCsvField(task.id),
            escapeCsvField(task.status),
            escapeCsvField(step.id),
            escapeCsvField(step.phase),
            escapeCsvField(step.status),
            String(step.duration),
            escapeCsvField(errorMsg),
          ].join(','),
        );
      }
    }

    return {
      content: rows.join('\n'),
      contentType: 'text/csv; charset=utf-8',
      fileExtension: 'csv',
    };
  }

  // ── HTML formatter ─────────────────────────────────────────────────

  private toHtml(task: Task, steps: StepRecord[]): ExportResult {
    const statusColor = STATUS_COLORS[task.status] ?? '#71717a';
    const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);
    const successSteps = steps.filter((s) => s.status === 'success').length;
    const failedSteps = steps.filter((s) => s.status === 'retry' || s.status === 'skipped').length;

    let summarySection = '';
    if (task.resultSummary) {
      summarySection = `
      <div class="section">
        <div class="section-title">Result Summary</div>
        <div class="summary-card" style="text-align: left">
          <p><strong>Success:</strong> ${task.resultSummary.success ? 'Yes' : 'No'}</p>
          <p>${escapeHtml(task.resultSummary.summary)}</p>
          ${task.resultSummary.error ? `<p class="error">${escapeHtml(task.resultSummary.error)}</p>` : ''}
        </div>
      </div>`;
    }

    const stepsRows = steps
      .map(
        (s) => `
        <tr>
          <td>${s.stepIndex}</td>
          <td>${escapeHtml(s.phase)}</td>
          <td><span class="badge" style="background: ${STATUS_COLORS[s.status] ?? '#71717a'}22; color: ${STATUS_COLORS[s.status] ?? '#71717a'}">${s.status}</span></td>
          <td>${formatDuration(s.duration)}</td>
          <td>${escapeHtml(s.observation ?? '-')}</td>
        </tr>`,
      )
      .join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Export - ${escapeHtml(task.goal)}</title>
  <style>${EXPORT_CSS}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(task.goal)}</h1>
      <div class="meta">
        <span class="badge" style="background: ${statusColor}22; color: ${statusColor}">${task.status}</span>
        <span class="meta-item">Model: ${escapeHtml(task.llmModel)}</span>
        <span class="meta-item">Created: ${formatDate(task.createdAt)}</span>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Summary</div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="value">${steps.length}</div>
          <div class="label">Total Steps</div>
        </div>
        <div class="summary-card">
          <div class="value" style="color: #34d399">${successSteps}</div>
          <div class="label">Passed</div>
        </div>
        <div class="summary-card">
          <div class="value" style="color: #f87171">${failedSteps}</div>
          <div class="label">Failed</div>
        </div>
        <div class="summary-card">
          <div class="value">${formatDuration(totalDuration)}</div>
          <div class="label">Duration</div>
        </div>
      </div>
    </div>

    ${summarySection}

    <div class="section">
      <div class="section-title">Steps</div>
      ${steps.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Phase</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Observation</th>
          </tr>
        </thead>
        <tbody>
          ${stepsRows}
        </tbody>
      </table>` : '<p style="color:#71717a">No steps recorded.</p>'}
    </div>

    <div class="footer">
      Exported at ${formatDate(new Date().toISOString())} &middot; Task ID: ${escapeHtml(task.id)}
    </div>
  </div>
</body>
</html>`;

    return {
      content: html,
      contentType: 'text/html; charset=utf-8',
      fileExtension: 'html',
    };
  }

  private batchToHtml(
    batchInfo: Record<string, unknown>,
    tasksWithSteps: Array<{ task: Task; steps: StepRecord[] }>,
  ): ExportResult {
    const batchColor =
      batchInfo.status === 'completed'
        ? '#34d399'
        : batchInfo.status === 'failed'
          ? '#f87171'
          : '#71717a';

    const totalSteps = tasksWithSteps.reduce((sum, t) => sum + t.steps.length, 0);
    const totalDuration = tasksWithSteps.reduce(
      (sum, t) => sum + t.steps.reduce((s, step) => s + step.duration, 0),
      0,
    );

    const taskRows = tasksWithSteps
      .map(
        ({ task, steps }) => `
        <tr>
          <td>${escapeHtml(task.id.slice(0, 8))}...</td>
          <td>${escapeHtml(task.goal)}</td>
          <td><span class="badge" style="background: ${STATUS_COLORS[task.status] ?? '#71717a'}22; color: ${STATUS_COLORS[task.status] ?? '#71717a'}">${task.status}</span></td>
          <td>${steps.length}</td>
          <td>${formatDuration(steps.reduce((s, step) => s + step.duration, 0))}</td>
        </tr>`,
      )
      .join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Batch Export - ${escapeHtml((batchInfo.name as string) ?? batchInfo.id as string)}</title>
  <style>${EXPORT_CSS}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Batch: ${escapeHtml((batchInfo.name as string) ?? 'Unnamed')}</h1>
      <div class="meta">
        <span class="badge" style="background: ${batchColor}22; color: ${batchColor}">${batchInfo.status}</span>
        <span class="meta-item">Priority: ${escapeHtml(String(batchInfo.priority))}</span>
        <span class="meta-item">Created: ${formatDate(String(batchInfo.createdAt))}</span>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Summary</div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="value">${batchInfo.totalTasks}</div>
          <div class="label">Total Tasks</div>
        </div>
        <div class="summary-card">
          <div class="value" style="color: #34d399">${batchInfo.completedTasks}</div>
          <div class="label">Completed</div>
        </div>
        <div class="summary-card">
          <div class="value" style="color: #f87171">${batchInfo.failedTasks}</div>
          <div class="label">Failed</div>
        </div>
        <div class="summary-card">
          <div class="value">${totalSteps}</div>
          <div class="label">Total Steps</div>
        </div>
        <div class="summary-card">
          <div class="value">${formatDuration(totalDuration)}</div>
          <div class="label">Total Duration</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Tasks</div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Goal</th>
            <th>Status</th>
            <th>Steps</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          ${taskRows}
        </tbody>
      </table>
    </div>

    <div class="footer">
      Exported at ${formatDate(new Date().toISOString())} &middot; Batch ID: ${escapeHtml(String(batchInfo.id))}
    </div>
  </div>
</body>
</html>`;

    return {
      content: html,
      contentType: 'text/html; charset=utf-8',
      fileExtension: 'html',
    };
  }
}

// ── Error class ──────────────────────────────────────────────────────

export class ExportError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'ExportError';
  }
}

// ── Factory ──────────────────────────────────────────────────────────

/**
 * Create a new ExportService instance.
 */
export function createExportService(db: Database.Database): ExportService {
  return new ExportService(db);
}
