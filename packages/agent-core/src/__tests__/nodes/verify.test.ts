import { describe, it, expect, vi } from 'vitest';
import { createVerifyNode } from '../../nodes/verify.js';
import { VerdictResultSchema } from '@eata/shared-types';

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    goal: 'Click Settings',
    targetAppPath: '/app',
    llmModel: 'gpt-4o',
    maxSteps: 50,
    taskId: 'task-1',
    history: [],
    currentObservation: null,
    currentPlan: {
      reasoning: 'Click Settings',
      toolCall: { name: 'browser_click', args: { element: 'Settings' } },
      expectedOutcome: 'Settings page appears',
    },
    currentExecResult: {
      success: true,
      result: 'Clicked Settings, page changed',
    },
    currentVerdict: null,
    stepCount: 1,
    stuckCounter: 0,
    status: 'running' as const,
    lastObservationHash: '',
    ...overrides,
  };
}

describe('verifyNode', () => {
  it('returns pass when generateObject says pass', async () => {
    const mockGenerateObject = vi.fn().mockResolvedValue({
      object: { verdict: 'pass', reasoning: 'Action matched expected outcome' },
    });

    const node = createVerifyNode({ generateObject: mockGenerateObject });
    const result = await node(makeState());

    expect(result.currentVerdict!.verdict).toBe('pass');
  });

  it('returns retry when generateObject says retry', async () => {
    const mockGenerateObject = vi.fn().mockResolvedValue({
      object: { verdict: 'retry', reasoning: 'Try a different approach' },
    });

    const node = createVerifyNode({ generateObject: mockGenerateObject });
    const result = await node(makeState());

    expect(result.currentVerdict!.verdict).toBe('retry');
  });

  it('returns fail when generateObject says fail', async () => {
    const mockGenerateObject = vi.fn().mockResolvedValue({
      object: { verdict: 'fail', reasoning: 'Cannot recover' },
    });

    const node = createVerifyNode({ generateObject: mockGenerateObject });
    const result = await node(makeState());

    expect(result.currentVerdict!.verdict).toBe('fail');
  });

  it('returns escalate when generateObject says escalate', async () => {
    const mockGenerateObject = vi.fn().mockResolvedValue({
      object: { verdict: 'escalate', reasoning: 'Page in error state' },
    });

    const node = createVerifyNode({ generateObject: mockGenerateObject });
    const result = await node(makeState());

    expect(result.currentVerdict!.verdict).toBe('escalate');
  });

  it('defaults to retry when execution failed and no LLM', async () => {
    const node = createVerifyNode({});
    const state = makeState({
      currentExecResult: { success: false, result: 'Timeout' },
    });
    const result = await node(state);

    expect(result.currentVerdict!.verdict).toBe('retry');
  });

  it('defaults to pass when execution succeeded and no LLM', async () => {
    const node = createVerifyNode({});
    const state = makeState({
      currentExecResult: { success: true, result: 'done' },
    });
    const result = await node(state);

    expect(result.currentVerdict!.verdict).toBe('pass');
  });

  it('includes goal and expected outcome in prompt', async () => {
    const mockGenerateObject = vi.fn().mockResolvedValue({
      object: { verdict: 'pass', reasoning: 'ok' },
    });

    const node = createVerifyNode({ generateObject: mockGenerateObject });
    await node(makeState());

    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.prompt).toContain('Click Settings');
    expect(callArgs.prompt).toContain('Settings page appears');
    expect(callArgs.schema).toBe(VerdictResultSchema);
  });
});
