import { describe, it, expect, vi } from 'vitest';
import { createVerifyNode } from '../../nodes/verify.js';
import { VerdictResultSchema } from '@eata/shared-types';
import type { AuditChainResult } from '../../sub-agents/index.js';

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
    auditChainResult: null,
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

  describe('audit chain integration', () => {
    it('calls runAuditChain and stores result in state', async () => {
      const node = createVerifyNode({});
      const result = await node(makeState());

      // The real auditChainResult should be stored in state
      expect(result.auditChainResult).toBeDefined();
      const auditResult = result.auditChainResult as AuditChainResult;
      expect(auditResult.goal).toBe('Click Settings');
      expect(auditResult.testPlanner).toBeDefined();
      expect(auditResult.executionAnalyst).toBeDefined();
      expect(auditResult.securityReviewer).toBeDefined();
      expect(auditResult.reportSynthesizer).toBeDefined();
      expect(auditResult.chainOrder).toEqual([
        'test-planner', 'execution-analyst', 'security-reviewer', 'report-synthesizer',
      ]);
      expect(auditResult.durationMs).toBeGreaterThanOrEqual(0);
      expect(auditResult.completedAt).toBeDefined();
    });

    it('audit chain result is populated with valid structure', async () => {
      const node = createVerifyNode({});
      const state = makeState({
        currentExecResult: { success: true, result: 'Navigated to settings page' },
      });
      const result = await node(state);

      const auditResult = result.auditChainResult as AuditChainResult;
      // Each sub-agent should have a valid output
      for (const key of ['testPlanner', 'executionAnalyst', 'securityReviewer', 'reportSynthesizer'] as const) {
        const output = auditResult[key];
        expect(output.role).toBeDefined();
        expect(output.auditReport).toBeDefined();
        expect(output.auditReport.severity).toMatch(/^(pass|warn|fail|info)$/);
        expect(output.auditReport.summary).toBeDefined();
        expect(output.auditReport.findings).toBeInstanceOf(Array);
      }
    });

    it('verdict remains pass when audit chain returns pass severity', async () => {
      const node = createVerifyNode({});
      const state = makeState({
        currentExecResult: { success: true, result: 'done' },
      });
      const result = await node(state);

      // The real audit chain should produce pass severity for normal goals
      const auditResult = result.auditChainResult as AuditChainResult;
      const execSeverity = auditResult.executionAnalyst.auditReport.severity;

      // If exec analyst says pass, verdict should remain pass
      if (execSeverity === 'pass') {
        expect(result.currentVerdict!.verdict).toBe('pass');
      }
      // Even with warn or info (non-fail), verdict should remain pass
      expect(['pass', 'warn', 'info'].includes(execSeverity)).toBe(true);
      expect(result.currentVerdict!.verdict).toBe('pass');
    });

    it('audit chain stores result even when verdict comes from generateObject', async () => {
      const mockGenerateObject = vi.fn().mockResolvedValue({
        object: { verdict: 'pass', reasoning: 'ok' },
      });

      const node = createVerifyNode({ generateObject: mockGenerateObject });
      const result = await node(makeState());

      // Audit chain should still run and store results
      expect(result.auditChainResult).toBeDefined();
      expect(result.currentVerdict!.verdict).toBe('pass');
    });

    it('audit chain stores goal and targetAppPath from state', async () => {
      const state = makeState({
        goal: 'Custom goal for testing',
        targetAppPath: '/custom/path',
      });
      const node = createVerifyNode({});
      const result = await node(state);

      const auditResult = result.auditChainResult as AuditChainResult;
      expect(auditResult.goal).toBe('Custom goal for testing');
    });
  });
});
