import { describe, it, expect, vi } from 'vitest';
import {
  ProgressBar,
  Spinner,
  ProgressTracker,
  getProgressTracker,
  formatStepProgress,
  formatStepSummary,
  formatDuration,
} from '../progress.js';

describe('Progress System', () => {
  describe('ProgressBar', () => {
    it('should create progress bar with options', () => {
      const bar = new ProgressBar({
        total: 100,
        width: 30,
        complete: '#',
        incomplete: '-',
      });
      expect(bar.getPercentage()).toBe(0);
    });

    it('should update progress', () => {
      const bar = new ProgressBar({ total: 100 });
      bar.update(50);
      expect(bar.getPercentage()).toBe(50);
    });

    it('should increment progress', () => {
      const bar = new ProgressBar({ total: 100 });
      bar.increment(25);
      expect(bar.getPercentage()).toBe(25);
      bar.increment(25);
      expect(bar.getPercentage()).toBe(50);
    });

    it('should not exceed total', () => {
      const bar = new ProgressBar({ total: 100 });
      bar.update(150);
      expect(bar.getPercentage()).toBe(100);
    });

    it('should calculate ETA', () => {
      const bar = new ProgressBar({ total: 100 });
      bar.update(50);
      const eta = bar.getETA();
      expect(eta).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 ETA when no progress', () => {
      const bar = new ProgressBar({ total: 100 });
      expect(bar.getETA()).toBe(0);
    });
  });

  describe('Spinner', () => {
    it('should create spinner with default options', () => {
      const spinner = new Spinner();
      expect(spinner).toBeDefined();
    });

    it('should create spinner with custom options', () => {
      const spinner = new Spinner({
        text: 'Custom text',
        frames: ['-', '\\', '|', '/'],
        interval: 100,
      });
      expect(spinner).toBeDefined();
    });
  });

  describe('ProgressTracker', () => {
    it('should start tracking a task', () => {
      const tracker = new ProgressTracker();
      tracker.startTask('task-1', 100, 'initializing');

      const progress = tracker.getTaskProgress('task-1');
      expect(progress).toBeDefined();
      expect(progress?.taskId).toBe('task-1');
      expect(progress?.totalSteps).toBe(100);
      expect(progress?.phase).toBe('initializing');
    });

    it('should update task progress', () => {
      const tracker = new ProgressTracker();
      tracker.startTask('task-1', 100);
      tracker.updateTask('task-1', 50, 'executing', 'Half done');

      const progress = tracker.getTaskProgress('task-1');
      expect(progress?.currentStep).toBe(50);
      expect(progress?.phase).toBe('executing');
      expect(progress?.message).toBe('Half done');
    });

    it('should complete task', () => {
      const tracker = new ProgressTracker();
      tracker.startTask('task-1', 100);
      tracker.completeTask('task-1', 'Done');

      const progress = tracker.getTaskProgress('task-1');
      expect(progress).toBeUndefined();
    });

    it('should fail task', () => {
      const tracker = new ProgressTracker();
      tracker.startTask('task-1', 100);
      tracker.failTask('task-1', 'Failed');

      const progress = tracker.getTaskProgress('task-1');
      expect(progress).toBeUndefined();
    });

    it('should get all active tasks', () => {
      const tracker = new ProgressTracker();
      tracker.startTask('task-1', 100);
      tracker.startTask('task-2', 200);

      const all = tracker.getAllProgress();
      expect(all).toHaveLength(2);
    });

    it('should calculate task percentage', () => {
      const tracker = new ProgressTracker();
      tracker.startTask('task-1', 100);
      tracker.updateTask('task-1', 50);

      expect(tracker.getTaskPercentage('task-1')).toBe(50);
    });

    it('should calculate task ETA', () => {
      const tracker = new ProgressTracker();
      tracker.startTask('task-1', 100);
      tracker.updateTask('task-1', 50);

      const eta = tracker.getTaskETA('task-1');
      expect(eta).toBeGreaterThanOrEqual(0);
    });

    it('should return null ETA for unknown task', () => {
      const tracker = new ProgressTracker();
      expect(tracker.getTaskETA('unknown')).toBeNull();
    });

    it('should notify listeners', () => {
      const tracker = new ProgressTracker();
      const listener = vi.fn();
      tracker.onProgress(listener);

      tracker.startTask('task-1', 100);
      expect(listener).toHaveBeenCalledTimes(1);

      tracker.updateTask('task-1', 50);
      expect(listener).toHaveBeenCalledTimes(2);

      tracker.offProgress(listener);
      tracker.updateTask('task-1', 75);
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('getProgressTracker', () => {
    it('should return singleton tracker', () => {
      const tracker1 = getProgressTracker();
      const tracker2 = getProgressTracker();
      expect(tracker1).toBe(tracker2);
    });
  });

  describe('formatStepProgress', () => {
    it('should format step with running status', () => {
      const formatted = formatStepProgress({
        stepNumber: 1,
        totalSteps: 10,
        phase: 'observe',
        message: 'Scanning app',
      });
      expect(formatted).toContain('[1/10]');
      expect(formatted).toContain('observe');
      expect(formatted).toContain('Scanning app');
    });

    it('should format step with success status', () => {
      const formatted = formatStepProgress({
        stepNumber: 5,
        totalSteps: 10,
        phase: 'execute',
        status: 'success',
        duration: 150,
      });
      expect(formatted).toContain('[5/10]');
      expect(formatted).toContain('execute');
      expect(formatted).toContain('150ms');
    });

    it('should format step with failed status', () => {
      const formatted = formatStepProgress({
        stepNumber: 3,
        totalSteps: 10,
        phase: 'verify',
        status: 'failed',
      });
      expect(formatted).toContain('[3/10]');
      expect(formatted).toContain('verify');
    });
  });

  describe('formatStepSummary', () => {
    it('should format summary with all steps', () => {
      const summary = formatStepSummary(10, 8, 2, 0, 5000);
      expect(summary).toContain('Total Steps:   10');
      expect(summary).toContain('Passed:        8');
      expect(summary).toContain('Failed:        2');
      expect(summary).toContain('Duration:');
    });

    it('should not show failed if 0', () => {
      const summary = formatStepSummary(10, 10, 0, 0, 5000);
      expect(summary).not.toContain('Failed:');
    });

    it('should show skipped if > 0', () => {
      const summary = formatStepSummary(10, 8, 0, 2, 5000);
      expect(summary).toContain('Skipped:       2');
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(5000)).toBe('5.0s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(125000)).toBe('2m 5s');
    });

    it('should format hours and minutes', () => {
      expect(formatDuration(3720000)).toBe('1h 2m');
    });
  });
});
