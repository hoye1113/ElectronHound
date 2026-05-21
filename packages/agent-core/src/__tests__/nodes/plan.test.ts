import { describe, it, expect, vi } from 'vitest';
import { createPlanNode } from '../../nodes/plan.js';
import { PlanResultSchema } from '@eata/shared-types';

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    goal: 'Click the Settings button',
    targetAppPath: '/app',
    llmModel: 'gpt-4o',
    maxSteps: 50,
    taskId: 'task-1',
    history: [],
    currentObservation: {
      ariaTree: '<button>Settings</button><input name="username">',
      pageTitle: 'Main Page',
      url: 'http://localhost',
      timestamp: new Date().toISOString(),
    },
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

describe('planNode', () => {
  it('returns structured plan with generateObject', async () => {
    const mockGenerateObject = vi.fn().mockResolvedValue({
      object: {
        reasoning: 'Click Settings',
        toolCall: { name: 'browser_click', args: { element: 'Settings' } },
        expectedOutcome: 'Settings page opens',
      },
    });

    const node = createPlanNode({ generateObject: mockGenerateObject });
    const state = makeState();
    const result = await node(state);

    expect(mockGenerateObject).toHaveBeenCalledOnce();
    expect(result.currentPlan).toBeDefined();
    expect(result.currentPlan!.toolCall.name).toBe('browser_click');
    expect(result.currentPlan!.expectedOutcome).toBe('Settings page opens');
  });

  it('falls back to default when no generateObject', async () => {
    const node = createPlanNode({});
    const state = makeState();
    const result = await node(state);

    expect(result.currentPlan).toBeDefined();
    expect(result.currentPlan!.reasoning).toBe('No LLM configured');
    expect(result.currentPlan!.toolCall.name).toBe('browser_snapshot');
  });

  it('includes relevant feedback patterns in prompt', async () => {
    const mockGenerateObject = vi.fn().mockResolvedValue({
      object: {
        reasoning: 'Avoid clicking disabled buttons',
        toolCall: { name: 'browser_click', args: { element: 'Settings' } },
        expectedOutcome: 'Settings page opens',
      },
    });

    const mockGetPatterns = vi.fn().mockReturnValue([
      {
        id: 'pattern-1',
        errorType: 'disabled_button',
        targetDescription: 'Settings button',
        remediationHint: 'Check if button is enabled before clicking',
        similarityKeywords: ['settings', 'button', 'disabled'],
        frequency: 3,
        lastSeen: new Date().toISOString(),
        relatedGoalPatterns: ['click settings'],
      },
    ]);

    const node = createPlanNode({
      generateObject: mockGenerateObject,
      getRelevantPatterns: mockGetPatterns,
    });

    const state = makeState();
    const result = await node(state);

    expect(mockGetPatterns).toHaveBeenCalledWith(state.goal);

    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.prompt).toContain('disabled_button');
    expect(callArgs.prompt).toContain('Check if button is enabled before clicking');
    expect(callArgs.prompt).toContain('settings, button, disabled');
    expect(callArgs.schema).toBe(PlanResultSchema);
  });

  it('includes history context in prompt', async () => {
    const mockGenerateObject = vi.fn().mockResolvedValue({
      object: {
        reasoning: 'Next step',
        toolCall: { name: 'browser_click', args: {} },
        expectedOutcome: 'Done',
      },
    });

    const node = createPlanNode({ generateObject: mockGenerateObject });
    const state = makeState({
      history: [
        {
          id: 's1',
          taskId: 'task-1',
          stepIndex: 0,
          phase: 'observe',
          status: 'success',
          observation: 'page loaded',
          timestamp: new Date().toISOString(),
          duration: 100,
        },
      ],
    });

    await node(state);

    const callArgs = mockGenerateObject.mock.calls[0][0];
    expect(callArgs.prompt).toContain('Step 0');
    expect(callArgs.prompt).toContain('page loaded');
  });
});
