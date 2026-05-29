import { bench, describe } from 'vitest';
import { entriesToStepRecords, extractLastStep } from '../packages/agent-core/src/session/entryConverter.js';
import type { SessionEntry } from '../packages/agent-core/src/session/types.js';

/**
 * Generate mock session entries following the deterministic 4-entry-per-step pattern:
 *   Index 0:        role='user',  type='user'      — task prompt
 *   Index 1+4N:     role='assistant', type='assistant' — observe
 *   Index 2+4N:     role='assistant', type='assistant' — plan
 *   Index 3+4N:     role='system',    type='system'    — execute
 *   Index 4+4N:     role='assistant', type='assistant' — verify
 */
function generateMockEntries(stepCount: number): SessionEntry[] {
  const entries: SessionEntry[] = [];
  const now = new Date().toISOString();

  // Index 0: user prompt
  entries.push({
    id: crypto.randomUUID(),
    sessionId: 'bench-session',
    role: 'user',
    content: 'Test the login flow',
    timestamp: now,
    type: 'user',
  });

  for (let i = 0; i < stepCount; i++) {
    const baseTs = new Date(Date.now() + i * 1000).toISOString();

    // Observe
    entries.push({
      id: crypto.randomUUID(),
      sessionId: 'bench-session',
      role: 'assistant',
      content: JSON.stringify({
        summary: `Step ${i} observation`,
        details: `Detailed observation for step ${i}: page loaded successfully`,
        timestamp: baseTs,
      }),
      timestamp: baseTs,
      type: 'assistant',
    });

    // Plan
    entries.push({
      id: crypto.randomUUID(),
      sessionId: 'bench-session',
      role: 'assistant',
      content: JSON.stringify({
        reasoning: `Step ${i} reasoning: need to interact with element`,
        action: 'Click the submit button',
        toolName: 'click',
        toolArgs: { selector: '#submit-btn' },
        expectedOutcome: 'Form submits successfully',
      }),
      timestamp: new Date(Date.now() + i * 1000 + 500).toISOString(),
      type: 'assistant',
    });

    // Execute
    entries.push({
      id: crypto.randomUUID(),
      sessionId: 'bench-session',
      role: 'system',
      content: JSON.stringify({
        success: i % 3 !== 0,
        result: `Step ${i} execution result`,
      }),
      timestamp: new Date(Date.now() + i * 1000 + 800).toISOString(),
      type: 'system',
    });

    // Verify
    entries.push({
      id: crypto.randomUUID(),
      sessionId: 'bench-session',
      role: 'assistant',
      content: JSON.stringify({
        verdict: i % 3 === 0 ? 'fail' : 'pass',
        reasoning: `Step ${i} verification: ${i % 3 === 0 ? 'needs retry' : 'looks good'}`,
      }),
      timestamp: new Date(Date.now() + i * 1000 + 900).toISOString(),
      type: 'assistant',
    });
  }

  return entries;
}

// Pre-generate test data
const entries10 = generateMockEntries(10);
const entries50 = generateMockEntries(50);
const entries100 = generateMockEntries(100);

describe('entriesToStepRecords', () => {
  bench('10 steps', () => {
    entriesToStepRecords(entries10, 'bench-task');
  });

  bench('50 steps', () => {
    entriesToStepRecords(entries50, 'bench-task');
  });

  bench('100 steps', () => {
    entriesToStepRecords(entries100, 'bench-task');
  });
});

describe('extractLastStep', () => {
  const steps10 = entriesToStepRecords(entries10, 'bench-task');
  const steps50 = entriesToStepRecords(entries50, 'bench-task');
  const steps100 = entriesToStepRecords(entries100, 'bench-task');

  bench('from 10 steps', () => {
    extractLastStep(steps10);
  });

  bench('from 50 steps', () => {
    extractLastStep(steps50);
  });

  bench('from 100 steps', () => {
    extractLastStep(steps100);
  });
});
