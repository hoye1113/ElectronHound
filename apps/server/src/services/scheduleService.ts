import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { CronExpressionParser } from 'cron-parser';
import { getLogger } from '@eata/agent-core/dx';
import { NotificationService } from './notificationService.js';

interface ScheduleRow {
  id: string;
  name: string;
  template_id: string;
  cron_expression: string;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  last_status: string | null;
  created_at: string;
  updated_at: string;
}

interface TemplateRow {
  id: string;
  goal: string;
}

interface TaskResult {
  status: string;
  stepCount: number;
}

export interface ComparisonResult {
  improved: boolean;
  regressed: boolean;
  currentStatus: string;
  previousStatus: string;
  currentStepCount: number;
  previousStepCount: number;
  details: string;
}

export class ScheduleService {
  private db: Database.Database;
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private logger = getLogger({ source: 'scheduleService' });
  private notificationService: NotificationService;

  constructor(db: Database.Database) {
    this.db = db;
    this.notificationService = new NotificationService();
  }

  /**
   * Get the notification service for external SSE broadcast wiring.
   */
  getNotificationService(): NotificationService {
    return this.notificationService;
  }

  /**
   * Load all enabled schedules and set up timers for execution.
   */
  start(): void {
    this.logger.info('Starting schedule service');

    const schedules = this.db
      .prepare('SELECT * FROM schedules WHERE enabled = 1')
      .all() as ScheduleRow[];

    for (const schedule of schedules) {
      this.scheduleNext(schedule);
    }

    this.logger.info(`Loaded ${schedules.length} enabled schedules`);
  }

  /**
   * Clear all timers and stop the service.
   */
  stop(): void {
    this.logger.info('Stopping schedule service');

    for (const [id, timer] of this.timers) {
      clearTimeout(timer);
      this.timers.delete(id);
    }

    this.logger.info('All schedule timers cleared');
  }

  /**
   * Schedule the next execution for a given schedule.
   */
  private scheduleNext(schedule: ScheduleRow): void {
    try {
      const interval = CronExpressionParser.parse(schedule.cron_expression);
      const nextRun = interval.next();
      const nextRunDate = nextRun.toDate();
      const now = new Date();
      const delayMs = Math.max(0, nextRunDate.getTime() - now.getTime());

      // Update next_run_at in database
      this.db
        .prepare("UPDATE schedules SET next_run_at = ?, updated_at = datetime('now') WHERE id = ?")
        .run(nextRunDate.toISOString(), schedule.id);

      // Set timer (cap at max setTimeout value to avoid overflow)
      const maxDelay = 2147483647; // ~24.8 days
      const actualDelay = Math.min(delayMs, maxDelay);

      const timer = setTimeout(() => {
        this.execute(schedule.id).catch((err) => {
          this.logger.error(`Schedule execution failed for ${schedule.id}`, err);
        });
      }, actualDelay);

      // Allow the timer to not keep the process alive
      if (typeof timer.unref === 'function') {
        timer.unref();
      }

      this.timers.set(schedule.id, timer);
      this.logger.debug(`Scheduled next run for ${schedule.name} at ${nextRunDate.toISOString()}`);
    } catch (err: unknown) {
      this.logger.error(`Failed to schedule ${schedule.name} (${schedule.id})`, err instanceof Error ? err : undefined);
    }
  }

  /**
   * Compare current run results with the previous run for the same schedule.
   * Detects regressions (status degraded, step count increased significantly)
   * and improvements (status improved, step count decreased).
   */
  compareResults(scheduleId: string, currentTaskId: string): ComparisonResult | null {
    // Get current task result
    const currentTask = this.db
      .prepare('SELECT status, step_count as stepCount FROM tasks WHERE id = ?')
      .get(currentTaskId) as TaskResult | undefined;

    if (!currentTask) return null;

    // Get previous run's task ID
    const previousRun = this.db
      .prepare(
        `SELECT task_id FROM schedule_runs
         WHERE schedule_id = ? AND task_id IS NOT NULL AND task_id != ?
         ORDER BY started_at DESC LIMIT 1`
      )
      .get(scheduleId, currentTaskId) as { task_id: string } | undefined;

    if (!previousRun) return null;

    // Get previous task result
    const previousTask = this.db
      .prepare('SELECT status, step_count as stepCount FROM tasks WHERE id = ?')
      .get(previousRun.task_id) as TaskResult | undefined;

    if (!previousTask) return null;

    const statusOrder: Record<string, number> = {
      completed: 0,
      queued: 1,
      running: 2,
      cancelled: 3,
      failed: 4,
    };

    const currentStatusVal = statusOrder[currentTask.status] ?? 2;
    const previousStatusVal = statusOrder[previousTask.status] ?? 2;

    const regressed = currentStatusVal > previousStatusVal;
    const improved = currentStatusVal < previousStatusVal;

    const stepDiff = currentTask.stepCount - previousTask.stepCount;
    const stepThreshold = Math.max(5, Math.floor(previousTask.stepCount * 0.5));
    const stepRegressed = stepDiff > stepThreshold;

    const details = [
      `Status: ${previousTask.status} → ${currentTask.status}`,
      `Steps: ${previousTask.stepCount} → ${currentTask.stepCount} (${stepDiff >= 0 ? '+' : ''}${stepDiff})`,
    ].join(', ');

    return {
      improved: improved || (stepDiff < -stepThreshold),
      regressed: regressed || stepRegressed,
      currentStatus: currentTask.status,
      previousStatus: previousTask.status,
      currentStepCount: currentTask.stepCount,
      previousStepCount: previousTask.stepCount,
      details,
    };
  }

  /**
   * Execute a schedule: create a task, record run history, update stats.
   */
  async execute(scheduleId: string): Promise<void> {
    const schedule = this.db
      .prepare('SELECT * FROM schedules WHERE id = ?')
      .get(scheduleId) as ScheduleRow | undefined;

    if (!schedule) {
      this.logger.warn(`Schedule ${scheduleId} not found, skipping execution`);
      return;
    }

    const template = this.db
      .prepare('SELECT * FROM templates WHERE id = ?')
      .get(schedule.template_id) as TemplateRow | undefined;

    if (!template) {
      this.logger.error(`Template ${schedule.template_id} not found for schedule ${schedule.name}`);
      return;
    }

    const taskId = randomUUID();
    const runId = randomUUID();
    const now = new Date().toISOString();

    try {
      // Create a task from the template
      this.db
        .prepare(
          `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, created_at, updated_at)
           VALUES (?, ?, '', '', 'queued', ?, ?)`
        )
        .run(taskId, template.goal, now, now);

      // Record schedule run
      this.db
        .prepare(
          `INSERT INTO schedule_runs (id, schedule_id, task_id, started_at, status)
           VALUES (?, ?, ?, ?, 'running')`
        )
        .run(runId, scheduleId, taskId, now);

      // Update schedule stats
      this.db
        .prepare(
          `UPDATE schedules SET last_run_at = ?, run_count = run_count + 1, last_status = 'running', updated_at = datetime('now') WHERE id = ?`
        )
        .run(now, scheduleId);

      this.logger.info(`Executed schedule ${schedule.name}, created task ${taskId}`);

      // Notify on successful execution
      await this.notificationService.send({
        event: 'schedule:executed',
        title: `Schedule "${schedule.name}" executed`,
        message: `Created task ${taskId} from template`,
        data: { scheduleId, taskId, scheduleName: schedule.name },
      });

      // Compare with previous run results
      const comparison = this.compareResults(scheduleId, taskId);
      if (comparison?.regressed) {
        await this.notificationService.send({
          event: 'schedule:regression',
          title: `Schedule "${schedule.name}" regression detected`,
          message: comparison.details,
          data: { scheduleId, taskId, scheduleName: schedule.name, comparison },
        });
      } else if (comparison?.improved) {
        await this.notificationService.send({
          event: 'schedule:improved',
          title: `Schedule "${schedule.name}" improved`,
          message: comparison.details,
          data: { scheduleId, taskId, scheduleName: schedule.name, comparison },
        });
      }

      // Schedule next run
      this.scheduleNext(schedule);
    } catch (err: unknown) {
      this.logger.error(`Failed to execute schedule ${schedule.name}`, err instanceof Error ? err : undefined);

      // Notify on failure
      await this.notificationService.send({
        event: 'schedule:failed',
        title: `Schedule "${schedule.name}" failed`,
        message: err instanceof Error ? err.message : String(err),
        data: { scheduleId, scheduleName: schedule.name },
      });

      // Record failed run
      this.db
        .prepare(
          `INSERT INTO schedule_runs (id, schedule_id, task_id, started_at, status, error)
           VALUES (?, ?, ?, ?, 'failed', ?)`
        )
        .run(runId, scheduleId, null, now, err instanceof Error ? err.message : String(err));

      this.db
        .prepare(
          `UPDATE schedules SET last_status = 'failed', updated_at = datetime('now') WHERE id = ?`
        )
        .run(scheduleId);

      // Still schedule next run even on failure
      this.scheduleNext(schedule);
    }
  }
}
