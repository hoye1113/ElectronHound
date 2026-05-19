import { describe, it, expect } from 'vitest';
import { abortNode } from '../../nodes/abort.js';

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    goal: 'test goal',
    targetAppPath: '/app',
    llmModel: 'gpt-4o',
    maxSteps: 50,
    taskId: 'task-1',
    history: [],
    currentObservation: null,
    currentPlan: null,
    currentExecResult: null,
    currentVerdict: null,
    stepCount: 0,
    stuckCounter: 0,
    status: 'running' as const,
    lastObservationHash: '',
    ...overrides,
  };
}

describe('abortNode', () => {
  it('sets status to aborted', async () => {
    const result = await abortNode(makeState());
    expect(result.status).toBe('aborted');
  });

  it('sets status aborted when stuck counter >= 3', async () => {
    const result = await abortNode(makeState({ stuckCounter: 3 }));
    expect(result.status).toBe('aborted');
  });

  it('sets status aborted when max steps exceeded', async () => {
    const result = await abortNode(makeState({ stepCount: 50, maxSteps: 50 }));
    expect(result.status).toBe('aborted');
  });
});
