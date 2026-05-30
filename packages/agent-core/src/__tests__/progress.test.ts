import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProgressBar,
  Spinner,
  ProgressTracker,
  formatStepProgress,
  formatStepSummary,
  formatDuration,
  getProgressTracker,
} from '../dx/progress.js';

describe('ProgressBar', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('should create with default options', () => {
    const bar = new ProgressBar({ total: 100 });
    expect(bar.getPercentage()).toBe(0);
  });

  it('should update progress', () => {
    const bar = new ProgressBar({ total: 100 });
    bar.update(50);
    expect(bar.getPercentage()).toBe(50);
  });

  it('should increment progress', () => {
    const bar = new ProgressBar({ total: 100 });
    bar.increment(10);
    expect(bar.getPercentage()).toBe(10);
    bar.increment(20);
    expect(bar.getPercentage()).toBe(30);
  });

  it('should not exceed total', () => {
    const bar = new ProgressBar({ total: 100 });
    bar.update(150);
    expect(bar.getPercentage()).toBe(100);
  });

  it('should complete progress', () => {
    const bar = new ProgressBar({ total: 100 });
    bar.complete_progress('Done');
    expect(bar.getPercentage()).toBe(100);
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should calculate ETA', () => {
    const bar = new ProgressBar({ total: 100 });
    bar.update(50);
    // ETA depends on time elapsed, so just check it returns a number
    expect(typeof bar.getETA()).toBe('number');
  });

  it('should return 0 ETA when no progress', () => {
    const bar = new ProgressBar({ total: 100 });
    expect(bar.getETA()).toBe(0);
  });

  it('should render with clear option', () => {
    const bar = new ProgressBar({ total: 100, clear: true });
    bar.update(50);
    bar.update(75);
    expect(stdoutSpy).toHaveBeenCalled();
  });
});

describe('Spinner', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('should create with default options', () => {
    const spinner = new Spinner();
    expect(spinner).toBeDefined();
  });

  it('should start and stop', () => {
    const spinner = new Spinner({ text: 'Loading' });
    spinner.start();
    spinner.stop();
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should succeed', () => {
    const spinner = new Spinner();
    spinner.start();
    spinner.succeed('Done');
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should fail', () => {
    const spinner = new Spinner();
    spinner.start();
    spinner.fail('Error');
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should warn', () => {
    const spinner = new Spinner();
    spinner.start();
    spinner.warn('Warning');
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should update text', () => {
    const spinner = new Spinner();
    spinner.start('Initial');
    spinner.update('Updated');
    spinner.stop();
    expect(stdoutSpy).toHaveBeenCalled();
  });
});

describe('ProgressTracker', () => {
  it('should start and track tasks', () => {
    const tracker = new ProgressTracker();
    tracker.startTask('task-1', 10, 'executing');

    const progress = tracker.getTaskProgress('task-1');
    expect(progress).toBeDefined();
    expect(progress!.currentStep).toBe(0);
    expect(progress!.totalSteps).toBe(10);
    expect(progress!.phase).toBe('executing');
  });

  it('should update task progress', () => {
    const tracker = new ProgressTracker();
    tracker.startTask('task-1', 10);
    tracker.updateTask('task-1', 5, 'running', 'Step 5');

    const progress = tracker.getTaskProgress('task-1');
    expect(progress!.currentStep).toBe(5);
    expect(progress!.phase).toBe('running');
    expect(progress!.message).toBe('Step 5');
  });

  it('should complete task', () => {
    const tracker = new ProgressTracker();
    tracker.startTask('task-1', 10);
    tracker.completeTask('task-1', 'Done');

    // Task should be removed after completion
    expect(tracker.getTaskProgress('task-1')).toBeUndefined();
  });

  it('should fail task', () => {
    const tracker = new ProgressTracker();
    tracker.startTask('task-1', 10);
    tracker.failTask('task-1', 'Error');

    expect(tracker.getTaskProgress('task-1')).toBeUndefined();
  });

  it('should get all progress', () => {
    const tracker = new ProgressTracker();
    tracker.startTask('task-1', 10);
    tracker.startTask('task-2', 20);

    const all = tracker.getAllProgress();
    expect(all).toHaveLength(2);
  });

  it('should calculate percentage', () => {
    const tracker = new ProgressTracker();
    tracker.startTask('task-1', 10);
    tracker.updateTask('task-1', 5);

    expect(tracker.getTaskPercentage('task-1')).toBe(50);
  });

  it('should return 0 for unknown task percentage', () => {
    const tracker = new ProgressTracker();
    expect(tracker.getTaskPercentage('unknown')).toBe(0);
  });

  it('should calculate ETA', () => {
    const tracker = new ProgressTracker();
    tracker.startTask('task-1', 10);
    tracker.updateTask('task-1', 5);

    // ETA depends on time, just check it returns a value
    const eta = tracker.getTaskETA('task-1');
    expect(typeof eta).toBe('number');
  });

  it('should return null ETA when no progress', () => {
    const tracker = new ProgressTracker();
    tracker.startTask('task-1', 10);

    expect(tracker.getTaskETA('task-1')).toBeNull();
  });

  it('should notify listeners', () => {
    const tracker = new ProgressTracker();
    const listener = vi.fn();
    tracker.onProgress(listener);

    tracker.startTask('task-1', 10);
    expect(listener).toHaveBeenCalled();
  });

  it('should remove listeners', () => {
    const tracker = new ProgressTracker();
    const listener = vi.fn();
    tracker.onProgress(listener);
    tracker.offProgress(listener);

    tracker.startTask('task-1', 10);
    // Listener was removed before startTask, so it shouldn't be called
    // Note: onProgress adds to array, startTask calls notify
    // The listener was removed, so it shouldn't be called
    expect(listener).not.toHaveBeenCalled();
  });

  it('should ignore updates for unknown tasks', () => {
    const tracker = new ProgressTracker();
    // Should not throw
    tracker.updateTask('unknown', 5);
    tracker.completeTask('unknown');
    tracker.failTask('unknown');
  });
});

describe('formatStepProgress', () => {
  it('should format running step', () => {
    const result = formatStepProgress({
      stepNumber: 1,
      totalSteps: 10,
      phase: 'observe',
      message: 'Scanning',
    });
    expect(result).toContain('[1/10]');
    expect(result).toContain('observe');
    expect(result).toContain('Scanning');
  });

  it('should format success step', () => {
    const result = formatStepProgress({
      stepNumber: 2,
      totalSteps: 10,
      phase: 'execute',
      status: 'success',
      duration: 100,
    });
    expect(result).toContain('[2/10]');
    expect(result).toContain('(100ms)');
  });

  it('should format failed step', () => {
    const result = formatStepProgress({
      stepNumber: 3,
      totalSteps: 10,
      phase: 'verify',
      status: 'failed',
    });
    expect(result).toContain('[3/10]');
  });
});

describe('formatStepSummary', () => {
  it('should format summary with all steps passed', () => {
    const result = formatStepSummary(10, 10, 0, 0, 5000);
    expect(result).toContain('Total Steps:   10');
    expect(result).toContain('Passed:        10');
  });

  it('should include failed count when > 0', () => {
    const result = formatStepSummary(10, 8, 2, 0, 5000);
    expect(result).toContain('Failed:        2');
  });

  it('should include skipped count when > 0', () => {
    const result = formatStepSummary(10, 8, 0, 2, 5000);
    expect(result).toContain('Skipped:       2');
  });
});

describe('formatDuration', () => {
  it('should format milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('should format seconds', () => {
    expect(formatDuration(5000)).toBe('5.0s');
  });

  it('should format minutes', () => {
    expect(formatDuration(125000)).toBe('2m 5s');
  });

  it('should format hours', () => {
    expect(formatDuration(3725000)).toBe('1h 2m');
  });
});

describe('getProgressTracker', () => {
  it('should return singleton tracker', () => {
    const tracker1 = getProgressTracker();
    const tracker2 = getProgressTracker();
    expect(tracker1).toBe(tracker2);
  });
});
