import { describe, it, expect } from 'vitest';
import { entriesToStepRecords, extractLastStep } from '../entryConverter.js';
import { fingerprintObservation } from '../../runtime/stuckDetection.js';
import type { SessionEntry } from '../types.js';
import type { Observation } from '../../runtime/types.js';

// ── Test fixtures ──────────────────────────────────────────────────────────

function makeUserEntry(sessionId = 'test-session'): SessionEntry {
  return {
    id: crypto.randomUUID(),
    sessionId,
    role: 'user',
    type: 'user',
    content: 'Test the login page',
    timestamp: '2026-05-28T00:00:00.000Z',
  };
}

function makeObserveEntry(
  sessionId = 'test-session',
  overrides?: Partial<Observation>,
): SessionEntry {
  const obs: Observation = {
    summary: 'Login page visible',
    details: { url: 'https://example.com/login' },
    timestamp: '2026-05-28T00:00:01.000Z',
    ...overrides,
  };
  return {
    id: crypto.randomUUID(),
    sessionId,
    role: 'assistant',
    type: 'assistant',
    content: JSON.stringify(obs),
    timestamp: '2026-05-28T00:00:01.000Z',
  };
}

function makePlanEntry(sessionId = 'test-session'): SessionEntry {
  return {
    id: crypto.randomUUID(),
    sessionId,
    role: 'assistant',
    type: 'assistant',
    content: JSON.stringify({
      reasoning: 'Need to click the login button',
      action: 'Click login',
      toolName: 'click',
      toolArgs: { selector: '#login-btn' },
      expectedOutcome: 'Login form appears',
    }),
    timestamp: '2026-05-28T00:00:02.000Z',
  };
}

function makeExecuteEntry(
  sessionId = 'test-session',
  success = true,
): SessionEntry {
  return {
    id: crypto.randomUUID(),
    sessionId,
    role: 'system',
    type: 'system',
    content: JSON.stringify({
      success,
      result: success ? 'Clicked successfully' : 'Element not found',
      ...(success ? {} : { error: 'Element not found' }),
    }),
    timestamp: '2026-05-28T00:00:03.000Z',
  };
}

function makeVerifyEntry(
  sessionId = 'test-session',
  verdict: 'pass' | 'retry' | 'fail' | 'stuck' = 'pass',
  reasoning = 'Login form appeared as expected',
): SessionEntry {
  return {
    id: crypto.randomUUID(),
    sessionId,
    role: 'assistant',
    type: 'assistant',
    content: JSON.stringify({ verdict, reasoning }),
    timestamp: '2026-05-28T00:00:04.000Z',
  };
}

/** Build a full step (observe + plan + execute + verify). */
function makeStep(
  sessionId = 'test-session',
  verdict: 'pass' | 'retry' | 'fail' | 'stuck' = 'pass',
  stepTimestampBase = 0,
): SessionEntry[] {
  const base = stepTimestampBase * 4;
  return [
    {
      ...makeObserveEntry(sessionId),
      timestamp: `2026-05-28T00:00:${String(1 + base).padStart(2, '0')}.000Z`,
    },
    {
      ...makePlanEntry(sessionId),
      timestamp: `2026-05-28T00:00:${String(2 + base).padStart(2, '0')}.000Z`,
    },
    {
      ...makeExecuteEntry(sessionId),
      timestamp: `2026-05-28T00:00:${String(3 + base).padStart(2, '0')}.000Z`,
    },
    {
      ...makeVerifyEntry(sessionId, verdict),
      timestamp: `2026-05-28T00:00:${String(4 + base).padStart(2, '0')}.000Z`,
    },
  ];
}

// ── entriesToStepRecords ───────────────────────────────────────────────────

describe('entriesToStepRecords', () => {
  const TASK_ID = '550e8400-e29b-41d4-a716-446655440000';

  it('returns empty array for empty entries', () => {
    expect(entriesToStepRecords([], TASK_ID)).toEqual([]);
  });

  it('returns empty array when only user entry exists (no steps)', () => {
    const entries = [makeUserEntry()];
    expect(entriesToStepRecords(entries, TASK_ID)).toEqual([]);
  });

  it('returns empty array for fewer than 5 entries (incomplete step)', () => {
    const entries = [
      makeUserEntry(),
      makeObserveEntry(),
      makePlanEntry(),
      makeExecuteEntry(),
      // Missing verify entry
    ];
    expect(entriesToStepRecords(entries, TASK_ID)).toEqual([]);
  });

  it('converts one complete step into 1 StepRecord', () => {
    const entries = [makeUserEntry(), ...makeStep()];
    const steps = entriesToStepRecords(entries, TASK_ID);

    expect(steps).toHaveLength(1);
    expect(steps[0].taskId).toBe(TASK_ID);
    expect(steps[0].stepIndex).toBe(0);
    expect(steps[0].phase).toBe('verify');
  });

  it('converts two complete steps into 2 StepRecords with correct stepIndex', () => {
    const entries = [
      makeUserEntry(),
      ...makeStep('test-session', 'pass', 0),
      ...makeStep('test-session', 'fail', 1),
    ];
    const steps = entriesToStepRecords(entries, TASK_ID);

    expect(steps).toHaveLength(2);
    expect(steps[0].stepIndex).toBe(0);
    expect(steps[0].status).toBe('success');
    expect(steps[1].stepIndex).toBe(1);
    expect(steps[1].status).toBe('failed');
  });

  it('drops incomplete trailing chunk (2 extra entries after last full step)', () => {
    const entries = [
      makeUserEntry(),
      ...makeStep(),
      // Incomplete second step — only observe + plan
      makeObserveEntry(),
      makePlanEntry(),
    ];
    const steps = entriesToStepRecords(entries, TASK_ID);

    expect(steps).toHaveLength(1);
  });

  it('drops incomplete trailing chunk (3 extra entries)', () => {
    const entries = [
      makeUserEntry(),
      ...makeStep(),
      // Incomplete second step — observe + plan + execute
      makeObserveEntry(),
      makePlanEntry(),
      makeExecuteEntry(),
    ];
    const steps = entriesToStepRecords(entries, TASK_ID);

    expect(steps).toHaveLength(1);
  });

  // ── Verdict → Status mapping ──────────────────────────────────────────

  it('maps verdict "pass" to status "success"', () => {
    const entries = [makeUserEntry(), ...makeStep('test-session', 'pass')];
    const steps = entriesToStepRecords(entries, TASK_ID);
    expect(steps[0].status).toBe('success');
  });

  it('maps verdict "retry" to status "retry"', () => {
    const entries = [makeUserEntry(), ...makeStep('test-session', 'retry')];
    const steps = entriesToStepRecords(entries, TASK_ID);
    expect(steps[0].status).toBe('retry');
  });

  it('maps verdict "fail" to status "failed"', () => {
    const entries = [makeUserEntry(), ...makeStep('test-session', 'fail')];
    const steps = entriesToStepRecords(entries, TASK_ID);
    expect(steps[0].status).toBe('failed');
  });

  it('maps verdict "stuck" to status "failed"', () => {
    const entries = [makeUserEntry(), ...makeStep('test-session', 'stuck')];
    const steps = entriesToStepRecords(entries, TASK_ID);
    expect(steps[0].status).toBe('failed');
  });

  // ── StepRecord field mapping ──────────────────────────────────────────

  it('populates observation field from observe entry JSON', () => {
    const entries = [makeUserEntry(), ...makeStep()];
    const steps = entriesToStepRecords(entries, TASK_ID);

    expect(steps[0].observation).toBeDefined();
    const parsed = JSON.parse(steps[0].observation!);
    expect(parsed.summary).toBe('Login page visible');
    expect(parsed.details).toEqual({ url: 'https://example.com/login' });
  });

  it('populates action field from plan entry toolName/toolArgs', () => {
    const entries = [makeUserEntry(), ...makeStep()];
    const steps = entriesToStepRecords(entries, TASK_ID);

    expect(steps[0].action).toEqual({
      name: 'click',
      args: { selector: '#login-btn' },
    });
  });

  it('populates result field from execute entry (full ExecutionResult)', () => {
    const entries = [makeUserEntry(), ...makeStep()];
    const steps = entriesToStepRecords(entries, TASK_ID);

    expect(steps[0].result).toEqual({
      success: true,
      result: 'Clicked successfully',
    });
  });

  it('populates reasoning field from plan entry', () => {
    const entries = [makeUserEntry(), ...makeStep()];
    const steps = entriesToStepRecords(entries, TASK_ID);

    // reasoning stores plan reasoning (not verdict reasoning)
    expect(steps[0].reasoning).toBe('Need to click the login button');
  });

  it('calculates duration from observe timestamp to verify timestamp', () => {
    const entries = [makeUserEntry(), ...makeStep()];
    const steps = entriesToStepRecords(entries, TASK_ID);

    // Observe at :01, Verify at :04 → 3000ms
    expect(steps[0].duration).toBe(3000);
  });

  it('uses verify entry timestamp as StepRecord timestamp', () => {
    const entries = [makeUserEntry(), ...makeStep()];
    const steps = entriesToStepRecords(entries, TASK_ID);

    expect(steps[0].timestamp).toBe('2026-05-28T00:00:04.000Z');
  });

  it('generates unique UUID v4 IDs for each StepRecord', () => {
    const entries = [
      makeUserEntry(),
      ...makeStep('test-session', 'pass', 0),
      ...makeStep('test-session', 'pass', 1),
    ];
    const steps = entriesToStepRecords(entries, TASK_ID);

    expect(steps[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(steps[1].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(steps[0].id).not.toBe(steps[1].id);
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  it('handles malformed observe JSON gracefully', () => {
    const entries: SessionEntry[] = [
      makeUserEntry(),
      {
        id: crypto.randomUUID(),
        sessionId: 'test-session',
        role: 'assistant',
        type: 'assistant',
        content: 'not valid json',
        timestamp: '2026-05-28T00:00:01.000Z',
      },
      makePlanEntry(),
      makeExecuteEntry(),
      makeVerifyEntry(),
    ];
    const steps = entriesToStepRecords(entries, TASK_ID);

    expect(steps).toHaveLength(1);
    expect(steps[0].observation).toBeUndefined();
    // Other fields should still be populated
    expect(steps[0].action).toBeDefined();
    expect(steps[0].result).toBeDefined();
  });

  it('handles malformed plan JSON gracefully', () => {
    const entries: SessionEntry[] = [
      makeUserEntry(),
      makeObserveEntry(),
      {
        id: crypto.randomUUID(),
        sessionId: 'test-session',
        role: 'assistant',
        type: 'assistant',
        content: 'not valid json',
        timestamp: '2026-05-28T00:00:02.000Z',
      },
      makeExecuteEntry(),
      makeVerifyEntry(),
    ];
    const steps = entriesToStepRecords(entries, TASK_ID);

    expect(steps).toHaveLength(1);
    expect(steps[0].action).toBeUndefined();
  });

  it('handles malformed execute JSON gracefully', () => {
    const entries: SessionEntry[] = [
      makeUserEntry(),
      makeObserveEntry(),
      makePlanEntry(),
      {
        id: crypto.randomUUID(),
        sessionId: 'test-session',
        role: 'system',
        type: 'system',
        content: 'not valid json',
        timestamp: '2026-05-28T00:00:03.000Z',
      },
      makeVerifyEntry(),
    ];
    const steps = entriesToStepRecords(entries, TASK_ID);

    expect(steps).toHaveLength(1);
    expect(steps[0].result).toBeUndefined();
  });

  it('handles malformed verify JSON gracefully (defaults to failed status)', () => {
    const entries: SessionEntry[] = [
      makeUserEntry(),
      makeObserveEntry(),
      makePlanEntry(),
      makeExecuteEntry(),
      {
        id: crypto.randomUUID(),
        sessionId: 'test-session',
        role: 'assistant',
        type: 'assistant',
        content: 'not valid json',
        timestamp: '2026-05-28T00:00:04.000Z',
      },
    ];
    const steps = entriesToStepRecords(entries, TASK_ID);

    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe('failed');
    // reasoning comes from plan entry (not verdict), so it's still populated
    expect(steps[0].reasoning).toBe('Need to click the login button');
  });

  it('returns 0 duration when timestamps are malformed', () => {
    const entries: SessionEntry[] = [
      makeUserEntry(),
      { ...makeObserveEntry(), timestamp: 'bad-timestamp' },
      makePlanEntry(),
      makeExecuteEntry(),
      { ...makeVerifyEntry(), timestamp: 'also-bad' },
    ];
    const steps = entriesToStepRecords(entries, TASK_ID);

    expect(steps).toHaveLength(1);
    expect(steps[0].duration).toBe(0);
  });

  it('returns 0 duration when verify timestamp is before observe timestamp', () => {
    const entries: SessionEntry[] = [
      makeUserEntry(),
      { ...makeObserveEntry(), timestamp: '2026-05-28T00:00:10.000Z' },
      makePlanEntry(),
      makeExecuteEntry(),
      { ...makeVerifyEntry(), timestamp: '2026-05-28T00:00:05.000Z' },
    ];
    const steps = entriesToStepRecords(entries, TASK_ID);

    expect(steps).toHaveLength(1);
    expect(steps[0].duration).toBe(0);
  });

  it('defaults to "failed" status when verdict JSON has unknown value', () => {
    const entries: SessionEntry[] = [
      makeUserEntry(),
      makeObserveEntry(),
      makePlanEntry(),
      makeExecuteEntry(),
      {
        id: crypto.randomUUID(),
        sessionId: 'test-session',
        role: 'assistant',
        type: 'assistant',
        content: JSON.stringify({ verdict: 'unknown_value', reasoning: 'test' }),
        timestamp: '2026-05-28T00:00:04.000Z',
      },
    ];
    const steps = entriesToStepRecords(entries, TASK_ID);

    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe('failed');
  });
});

// ── extractLastStep ────────────────────────────────────────────────────────

describe('extractLastStep', () => {
  const TASK_ID = '550e8400-e29b-41d4-a716-446655440000';

  it('returns all nulls and empty hash for empty steps array', () => {
    const result = extractLastStep([]);

    expect(result.observation).toBeNull();
    expect(result.plan).toBeNull();
    expect(result.execution).toBeNull();
    expect(result.observationHash).toBe('');
  });

  it('extracts observation from the last step', () => {
    const entries = [makeUserEntry(), ...makeStep()];
    const steps = entriesToStepRecords(entries, TASK_ID);
    const result = extractLastStep(steps);

    expect(result.observation).not.toBeNull();
    expect(result.observation!.summary).toBe('Login page visible');
    expect(result.observation!.details).toEqual({
      url: 'https://example.com/login',
    });
  });

  it('extracts plan from the last step', () => {
    const entries = [makeUserEntry(), ...makeStep()];
    const steps = entriesToStepRecords(entries, TASK_ID);
    const result = extractLastStep(steps);

    expect(result.plan).not.toBeNull();
    expect(result.plan!.toolName).toBe('click');
    expect(result.plan!.toolArgs).toEqual({ selector: '#login-btn' });
    expect(result.plan!.reasoning).toBe('Need to click the login button');
  });

  it('extracts execution result from the last step', () => {
    const entries = [makeUserEntry(), ...makeStep()];
    const steps = entriesToStepRecords(entries, TASK_ID);
    const result = extractLastStep(steps);

    expect(result.execution).not.toBeNull();
    expect(result.execution!.success).toBe(true);
    expect(result.execution!.result).toBe('Clicked successfully');
  });

  it('computes observationHash using fingerprintObservation', () => {
    const obs: Observation = {
      summary: 'Login page visible',
      details: { url: 'https://example.com/login' },
      timestamp: '2026-05-28T00:00:01.000Z',
    };
    const expectedHash = fingerprintObservation(obs);

    const entries = [makeUserEntry(), ...makeStep()];
    const steps = entriesToStepRecords(entries, TASK_ID);
    const result = extractLastStep(steps);

    expect(result.observationHash).toBe(expectedHash);
  });

  it('extracts from the LAST step when multiple steps exist', () => {
    const entries = [
      makeUserEntry(),
      ...makeStep('test-session', 'pass', 0),
      ...makeStep('test-session', 'fail', 1),
    ];
    const steps = entriesToStepRecords(entries, TASK_ID);
    const result = extractLastStep(steps);

    // The last step (index 1) should have a different observation
    expect(result.observation).not.toBeNull();
    expect(steps).toHaveLength(2);
  });

  it('handles failed execution result correctly', () => {
    const entries = [
      makeUserEntry(),
      makeObserveEntry(),
      makePlanEntry(),
      makeExecuteEntry('test-session', false), // failed execution
      makeVerifyEntry('test-session', 'fail', 'Element not found'),
    ];
    const steps = entriesToStepRecords(entries, TASK_ID);

    // Verify the raw StepRecord result field stores the full ExecutionResult
    expect(steps[0].result).toEqual({
      success: false,
      result: 'Element not found',
      error: 'Element not found',
    });

    const result = extractLastStep(steps);
    expect(result.execution).not.toBeNull();
    expect(result.execution!.success).toBe(false);
    expect(result.execution!.error).toBe('Element not found');
  });
});
