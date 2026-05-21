import { describe, it, expect } from 'vitest';
import { reportNode } from '../../nodes/report.js';

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
    stepCount: 1,
    stuckCounter: 0,
    status: 'running' as const,
    lastObservationHash: '',
    auditChainResult: null,
    ...overrides,
  };
}

describe('reportNode', () => {
  it('sets status to completed on pass verdict', async () => {
    const result = await reportNode(
      makeState({
        currentVerdict: { verdict: 'pass', reasoning: 'test passed' },
      }),
    );
    expect(result.status).toBe('completed');
  });

  it('sets status to failed on fail verdict', async () => {
    const result = await reportNode(
      makeState({
        currentVerdict: { verdict: 'fail', reasoning: 'test failed' },
      }),
    );
    expect(result.status).toBe('failed');
  });

  it('sets status to failed when max steps reached', async () => {
    const result = await reportNode(
      makeState({
        stepCount: 50,
        maxSteps: 50,
      }),
    );
    expect(result.status).toBe('failed');
  });

  it('sets status to completed when pass', async () => {
    const result = await reportNode(
      makeState({
        currentVerdict: { verdict: 'pass', reasoning: 'ok' },
      }),
    );
    expect(result.status).toBe('completed');
  });
});
