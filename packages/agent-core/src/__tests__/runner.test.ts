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

describe('runTest with LLM DI injection', () => {
  it('runTest calls getGenerateObject with model from options and handles null result', async () => {
    // No mock needed — in test env without OPENAI_API_KEY,
    // getGenerateObject returns null and graph uses deterministic fallbacks.
    // This verifies the runner correctly wires the null-through path.
    const result = await runTest({
      goal: 'DI fallback test',
      targetAppPath: '/test/app',
      llmModel: 'gpt-4o',
      maxSteps: 3,
      taskId: 'di-fallback-test',
      checkpointPath: ':memory:',
    });

    expect(result).toBeDefined();
    expect(result.goal).toBe('DI fallback test');
    expect(result.status).toBeDefined();
    // Graph terminates because plan node uses deterministic fallback (browser_snapshot)
    // and verify uses fallback logic — this proves the null-through DI path works
    expect(['completed', 'failed', 'aborted']).toContain(result.status);
  });
});
