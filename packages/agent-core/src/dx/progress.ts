/**
 * Progress Feedback System for ElectronHound
 *
 * Provides progress bars, spinners, ETA calculation,
 * and real-time status updates for long-running operations.
 */

// ─── Progress Bar ─────────────────────────────────────────────────────

export interface ProgressBarOptions {
  total: number;
  width?: number;
  complete?: string;
  incomplete?: string;
  head?: string;
  clear?: boolean;
  format?: string;
}

export class ProgressBar {
  private total: number;
  private current: number = 0;
  private width: number;
  private complete: string;
  private incomplete: string;
  private head: string;
  private clear: boolean;
  private format: string;
  private startTime: number;
  private lastRender: string = '';

  constructor(options: ProgressBarOptions) {
    this.total = options.total;
    this.width = options.width ?? 40;
    this.complete = options.complete ?? '█';
    this.incomplete = options.incomplete ?? '░';
    this.head = options.head ?? '█';
    this.clear = options.clear ?? false;
    this.format = options.format ?? '{bar} {percentage} | {current}/{total} | ETA: {eta} | {message}';
    this.startTime = Date.now();
  }

  /**
   * Update the progress bar.
   */
  update(current: number, message?: string): void {
    this.current = Math.min(current, this.total);
    this.render(message);
  }

  /**
   * Increment the progress bar by a value.
   */
  increment(delta: number = 1, message?: string): void {
    this.update(this.current + delta, message);
  }

  /**
   * Set the progress bar to complete.
   */
  complete_progress(message?: string): void {
    this.current = this.total;
    this.render(message ?? 'Complete');
    process.stdout.write('\n');
  }

  /**
   * Get the current progress percentage.
   */
  getPercentage(): number {
    return Math.round((this.current / this.total) * 100);
  }

  /**
   * Get the estimated time remaining in milliseconds.
   */
  getETA(): number {
    if (this.current === 0) return 0;
    const elapsed = Date.now() - this.startTime;
    const rate = this.current / elapsed;
    return Math.round((this.total - this.current) / rate);
  }

  /**
   * Render the progress bar.
   */
  private render(message?: string): void {
    const percentage = this.getPercentage();
    const eta = this.getETA();
    const filledWidth = Math.round((this.current / this.total) * this.width);
    const emptyWidth = this.width - filledWidth;

    const bar =
      this.complete.repeat(Math.max(0, filledWidth - 1)) +
      (filledWidth > 0 ? this.head : '') +
      this.incomplete.repeat(Math.max(0, emptyWidth));

    const etaStr = this.formatETA(eta);

    const line = this.format
      .replace('{bar}', bar)
      .replace('{percentage}', `${percentage}%`.padStart(4))
      .replace('{current}', String(this.current))
      .replace('{total}', String(this.total))
      .replace('{eta}', etaStr)
      .replace('{message}', message ?? '');

    // Clear previous line and write new one
    if (this.clear) {
      process.stdout.write('\r' + ' '.repeat(this.lastRender.length));
    }
    process.stdout.write('\r' + line);
    this.lastRender = line;
  }

  /**
   * Format ETA as human-readable string.
   */
  private formatETA(ms: number): string {
    if (ms <= 0) return '0s';
    if (ms < 1000) return '<1s';

    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / 60000) % 60;
    const hours = Math.floor(ms / 3600000);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }
}

// ─── Spinner ──────────────────────────────────────────────────────────

export interface SpinnerOptions {
  text?: string;
  frames?: string[];
  interval?: number;
  color?: string;
}

export class Spinner {
  private text: string;
  private frames: string[];
  private interval: number;
  private color: string;
  private frameIndex: number = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stream: NodeJS.WriteStream;

  constructor(options?: SpinnerOptions) {
    this.text = options?.text ?? 'Loading...';
    this.frames = options?.frames ?? ['⠁', '⠂', '⠄', '⡀', '⠠', '⠐', '⠈', '⠉'];
    this.interval = options?.interval ?? 80;
    this.color = options?.color ?? '\x1b[36m'; // Cyan
    this.stream = process.stdout;
  }

  /**
   * Start the spinner.
   */
  start(text?: string): void {
    if (text) this.text = text;
    this.frameIndex = 0;

    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(() => {
      this.render();
    }, this.interval);

    this.render();
  }

  /**
   * Update the spinner text.
   */
  update(text: string): void {
    this.text = text;
  }

  /**
   * Stop the spinner with a success message.
   */
  succeed(text?: string): void {
    this.stop('\x1b[32m✓\x1b[0m', text);
  }

  /**
   * Stop the spinner with a failure message.
   */
  fail(text?: string): void {
    this.stop('\x1b[31m✗\x1b[0m', text);
  }

  /**
   * Stop the spinner with a warning message.
   */
  warn(text?: string): void {
    this.stop('\x1b[33m⚠\x1b[0m', text);
  }

  /**
   * Stop the spinner.
   */
  stop(symbol?: string, text?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const displayText = text ?? this.text;
    const symbolStr = symbol ?? '';

    // Clear the spinner line
    this.stream.write('\r' + ' '.repeat(this.text.length + 10) + '\r');

    // Write the final message
    if (symbolStr) {
      this.stream.write(`${symbolStr} ${displayText}\n`);
    } else {
      this.stream.write(`${displayText}\n`);
    }
  }

  /**
   * Render the current spinner frame.
   */
  private render(): void {
    const frame = this.frames[this.frameIndex];
    this.stream.write(`\r${this.color}${frame}\x1b[0m ${this.text}`);
    this.frameIndex = (this.frameIndex + 1) % this.frames.length;
  }
}

// ─── Task Progress Tracker ────────────────────────────────────────────

export interface TaskProgress {
  taskId: string;
  phase: string;
  currentStep: number;
  totalSteps: number;
  startTime: number;
  message?: string;
  details?: Record<string, unknown>;
}

export class ProgressTracker {
  private tasks: Map<string, TaskProgress> = new Map();
  private listeners: Array<(progress: TaskProgress) => void> = [];

  /**
   * Start tracking a new task.
   */
  startTask(taskId: string, totalSteps: number, phase?: string): void {
    const progress: TaskProgress = {
      taskId,
      phase: phase ?? 'initializing',
      currentStep: 0,
      totalSteps,
      startTime: Date.now(),
    };
    this.tasks.set(taskId, progress);
    this.notify(progress);
  }

  /**
   * Update task progress.
   */
  updateTask(
    taskId: string,
    currentStep: number,
    phase?: string,
    message?: string,
    details?: Record<string, unknown>,
  ): void {
    const progress = this.tasks.get(taskId);
    if (!progress) return;

    progress.currentStep = Math.min(currentStep, progress.totalSteps);
    if (phase) progress.phase = phase;
    if (message) progress.message = message;
    if (details) progress.details = details;

    this.notify(progress);
  }

  /**
   * Complete a task.
   */
  completeTask(taskId: string, message?: string): void {
    const progress = this.tasks.get(taskId);
    if (!progress) return;

    progress.currentStep = progress.totalSteps;
    progress.phase = 'completed';
    progress.message = message ?? 'Task completed';

    this.notify(progress);
    this.tasks.delete(taskId);
  }

  /**
   * Fail a task.
   */
  failTask(taskId: string, message?: string): void {
    const progress = this.tasks.get(taskId);
    if (!progress) return;

    progress.phase = 'failed';
    progress.message = message ?? 'Task failed';

    this.notify(progress);
    this.tasks.delete(taskId);
  }

  /**
   * Get progress for a specific task.
   */
  getTaskProgress(taskId: string): TaskProgress | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all active task progress.
   */
  getAllProgress(): TaskProgress[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Calculate ETA for a task.
   */
  getTaskETA(taskId: string): number | null {
    const progress = this.tasks.get(taskId);
    if (!progress || progress.currentStep === 0) return null;

    const elapsed = Date.now() - progress.startTime;
    const rate = progress.currentStep / elapsed;
    return Math.round((progress.totalSteps - progress.currentStep) / rate);
  }

  /**
   * Get task progress as percentage.
   */
  getTaskPercentage(taskId: string): number {
    const progress = this.tasks.get(taskId);
    if (!progress) return 0;
    return Math.round((progress.currentStep / progress.totalSteps) * 100);
  }

  /**
   * Add a progress listener.
   */
  onProgress(listener: (progress: TaskProgress) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove a progress listener.
   */
  offProgress(listener: (progress: TaskProgress) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  /**
   * Notify all listeners of progress update.
   */
  private notify(progress: TaskProgress): void {
    for (const listener of this.listeners) {
      listener(progress);
    }
  }
}

// ─── Step Progress Formatter ──────────────────────────────────────────

export interface StepProgressOptions {
  stepNumber: number;
  totalSteps: number;
  phase: string;
  message?: string;
  duration?: number;
  status?: 'running' | 'success' | 'failed' | 'skipped';
}

/**
 * Format a step progress line for display.
 */
export function formatStepProgress(options: StepProgressOptions): string {
  const { stepNumber, totalSteps, phase, message, duration, status } = options;

  const statusIcons: Record<string, string> = {
    running: '\x1b[33m○\x1b[0m',   // Yellow circle
    success: '\x1b[32m✓\x1b[0m',    // Green checkmark
    failed: '\x1b[31m✗\x1b[0m',     // Red X
    skipped: '\x1b[90m→\x1b[0m',    // Gray arrow
  };

  const icon = statusIcons[status ?? 'running'] ?? statusIcons.running;
  const prefix = `[${stepNumber}/${totalSteps}]`;
  const phaseStr = phase.padEnd(10);
  const durationStr = duration !== undefined ? `(${duration}ms)` : '';

  const parts = [icon, prefix, phaseStr];
  if (message) parts.push(message);
  if (durationStr) parts.push(durationStr);

  return parts.join(' ');
}

/**
 * Format a summary of completed steps.
 */
export function formatStepSummary(
  totalSteps: number,
  passed: number,
  failed: number,
  skipped: number,
  totalDuration: number,
): string {
  const lines: string[] = [];
  const separator = '─'.repeat(50);

  lines.push(`\n${separator}`);
  lines.push('Step Summary');
  lines.push(separator);
  lines.push(`Total Steps:   ${totalSteps}`);
  lines.push(`\x1b[32mPassed:        ${passed}\x1b[0m`);
  if (failed > 0) {
    lines.push(`\x1b[31mFailed:        ${failed}\x1b[0m`);
  }
  if (skipped > 0) {
    lines.push(`\x1b[90mSkipped:       ${skipped}\x1b[0m`);
  }
  lines.push(`Duration:      ${formatDuration(totalDuration)}`);
  lines.push(separator);

  return lines.join('\n');
}

/**
 * Format duration in milliseconds to human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

// ─── Singleton Progress Tracker ───────────────────────────────────────

let defaultTracker: ProgressTracker | null = null;

/**
 * Get or create the default progress tracker.
 */
export function getProgressTracker(): ProgressTracker {
  if (!defaultTracker) {
    defaultTracker = new ProgressTracker();
  }
  return defaultTracker;
}
