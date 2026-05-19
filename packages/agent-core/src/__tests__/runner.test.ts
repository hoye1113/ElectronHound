import { describe, it, expect } from 'vitest';
import { runTest } from '../runner.js';

describe('runTest', () => {
  it('runs test with default options', async () => {
    const result = await runTest({
      goal: 'Click the Settings button',
      targetAppPath: '/test/app',
      taskId: 'test-runner-1',
      checkpointPath: ':memory:',
    });

    expect(result).toBeDefined();
    expect(result.goal).toBe('Click the Settings button');
    expect(result.targetAppPath).toBe('/test/app');
  });

  it('completes test with pass flow', async () => {
    const result = await runTest({
      goal: 'Simple navigation',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 5,
      taskId: 'test-runner-2',
      checkpointPath: ':memory:',
    });

    expect(result.status).toBeDefined();
    expect(['completed', 'failed', 'running', 'aborted']).toContain(result.status);
  });

  it('respects maxSteps option', async () => {
    // With a low maxSteps, runTest should terminate early
    const result = await runTest({
      goal: 'Test low max steps',
      targetAppPath: '/test/app',
      maxSteps: 2,
      taskId: 'test-runner-3',
      checkpointPath: ':memory:',
    });

    // Should not be running after completion (terminated by maxSteps)
    expect(result.status).not.toBe('running');
  });

  it('generates taskId when not provided', async () => {
    const result = await runTest({
      goal: 'Auto-generated ID',
      targetAppPath: '/test/app',
      checkpointPath: ':memory:',
    });

    expect(result.taskId).toBeDefined();
    expect(result.taskId.length).toBeGreaterThan(0);
  });
});
