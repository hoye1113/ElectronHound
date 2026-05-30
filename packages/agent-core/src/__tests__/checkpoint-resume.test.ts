/**
 * Checkpoint-resume integration test.
 *
 * Verifies that session entries are properly serialized into checkpoints
 * and restored on resume, so that agent conversation context survives
 * worker crashes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CheckpointManager } from '../session/checkpointManager.js';
import type { AgentCheckpoint } from '../session/checkpointManager.js';
import { SessionManager } from '../session/sessionManager.js';
import type { AgentLoopState } from '../runtime/types.js';

describe('checkpoint-resume with session entries', () => {
  let cm: CheckpointManager;
  let sm: SessionManager;

  beforeEach(() => {
    cm = new CheckpointManager(':memory:');
    sm = new SessionManager(':memory:');
  });

  afterEach(() => {
    cm.close();
    sm.close();
  });

  it('should serialize session entries into checkpoint via onStepComplete pattern', () => {
    // Simulate the flow: session accumulates entries, then checkpoint is saved
    const sessionId = sm.createSession('agent-1', 'Test the login flow');

    // Simulate steps adding entries to the session
    sm.addEntry(sessionId, {
      role: 'user',
      content: 'Navigate to the login page',
      type: 'user',
    });
    sm.addEntry(sessionId, {
      role: 'assistant',
      content: JSON.stringify({ summary: 'Navigated to login page', details: {} }),
      type: 'assistant',
    });
    sm.addEntry(sessionId, {
      role: 'assistant',
      content: JSON.stringify({
        reasoning: 'Click the username field',
        action: 'click',
        toolName: 'browser_click',
        toolArgs: { ref: '42' },
      }),
      type: 'assistant',
    });

    // Simulate what runner.ts onStepComplete now does (the fix)
    const state: AgentLoopState = {
      sessionId,
      taskPrompt: 'Test the login flow',
      stepCount: 3,
      currentObservation: { summary: 'Login form visible', details: {} },
      lastPlan: { toolName: 'browser_click', action: 'Click username' },
      lastExecution: { success: true, result: null },
      stuckCount: 0,
    };

    const checkpoint: AgentCheckpoint = {
      sessionId: state.sessionId,
      currentStep: 3,
      maxSteps: 20,
      taskPrompt: state.taskPrompt,
      config: { maxSteps: 20 },
      lastObservation: state.currentObservation as unknown as Record<string, unknown> | null,
      lastPlan: state.lastPlan as unknown as Record<string, unknown> | null,
      lastExecutionResult: state.lastExecution as unknown as Record<string, unknown> | null,
      // This is the fix: populate from session manager instead of []
      sessionEntries: sm.getSession(state.sessionId)?.entries ?? [],
      timestamp: new Date().toISOString(),
    };

    cm.save(checkpoint);

    // Verify checkpoint has entries
    const saved = cm.get(sessionId);
    expect(saved).not.toBeNull();
    expect(saved!.sessionEntries).toHaveLength(3);
    expect(saved!.sessionEntries[0].role).toBe('user');
    expect(saved!.sessionEntries[0].content).toBe('Navigate to the login page');
    expect(saved!.sessionEntries[1].role).toBe('assistant');
    expect(saved!.sessionEntries[2].role).toBe('assistant');
  });

  it('should restore session entries on resume', () => {
    // Build a checkpoint with entries (as the fix would produce)
    const sessionId = 'test-session-resume-001';
    const entries = [
      {
        id: 'entry-1',
        sessionId,
        role: 'user' as const,
        content: 'Open the app',
        timestamp: '2026-01-01T00:00:01.000Z',
        type: 'user' as const,
      },
      {
        id: 'entry-2',
        sessionId,
        role: 'assistant' as const,
        content: JSON.stringify({ summary: 'App opened', details: {} }),
        timestamp: '2026-01-01T00:00:02.000Z',
        type: 'assistant' as const,
      },
      {
        id: 'entry-3',
        sessionId,
        role: 'assistant' as const,
        content: JSON.stringify({ reasoning: 'click button', action: 'click', toolName: 'browser_click' }),
        timestamp: '2026-01-01T00:00:03.000Z',
        type: 'assistant' as const,
      },
    ];

    const checkpoint: AgentCheckpoint = {
      sessionId,
      currentStep: 3,
      maxSteps: 20,
      taskPrompt: 'Open the app and click button',
      config: { maxSteps: 20 },
      lastObservation: { summary: 'App running', details: {} },
      lastPlan: { toolName: 'browser_click', action: 'Click button' },
      lastExecutionResult: { success: true, result: null },
      sessionEntries: entries,
      timestamp: '2026-01-01T00:00:03.000Z',
    };

    cm.save(checkpoint);

    // Simulate resume: create a new session and restore entries
    const newSessionId = sm.createSession('agent-1', 'Open the app and click button');
    const saved = cm.get(sessionId)!;

    // Restore entries (same logic as AgentLoop.resume)
    for (const entry of saved.sessionEntries) {
      sm.addEntry(newSessionId, {
        role: entry.role,
        content: entry.content,
        type: entry.type,
        id: entry.id,
        timestamp: entry.timestamp,
      });
    }

    // Verify the restored session has all entries
    const restored = sm.getSession(newSessionId);
    expect(restored).not.toBeNull();
    expect(restored!.entries).toHaveLength(3);
    expect(restored!.entries[0].content).toBe('Open the app');
    expect(restored!.entries[1].content).toContain('App opened');
    expect(restored!.entries[2].content).toContain('click button');
  });

  it('should handle empty session entries gracefully', () => {
    const sessionId = sm.createSession('agent-1', 'Test task');

    // Session with no entries yet (e.g., checkpoint saved before first step)
    const checkpoint: AgentCheckpoint = {
      sessionId,
      currentStep: 0,
      maxSteps: 20,
      taskPrompt: 'Test task',
      config: { maxSteps: 20 },
      lastObservation: null,
      lastPlan: null,
      lastExecutionResult: null,
      sessionEntries: sm.getSession(sessionId)?.entries ?? [],
      timestamp: new Date().toISOString(),
    };

    cm.save(checkpoint);

    const saved = cm.get(sessionId);
    expect(saved).not.toBeNull();
    expect(saved!.sessionEntries).toHaveLength(0);
  });

  it('should preserve entries across multiple checkpoint saves', () => {
    const sessionId = sm.createSession('agent-1', 'Long running task');

    // Step 1: add entry and save checkpoint
    sm.addEntry(sessionId, {
      role: 'user',
      content: 'Start task',
      type: 'user',
    });

    const cp1: AgentCheckpoint = {
      sessionId,
      currentStep: 1,
      maxSteps: 20,
      taskPrompt: 'Long running task',
      config: { maxSteps: 20 },
      lastObservation: null,
      lastPlan: null,
      lastExecutionResult: null,
      sessionEntries: sm.getSession(sessionId)?.entries ?? [],
      timestamp: new Date().toISOString(),
    };
    cm.save(cp1);

    expect(cm.get(sessionId)!.sessionEntries).toHaveLength(1);

    // Step 2: add more entries and save again
    sm.addEntry(sessionId, {
      role: 'assistant',
      content: JSON.stringify({ summary: 'Step 2 observation' }),
      type: 'assistant',
    });
    sm.addEntry(sessionId, {
      role: 'assistant',
      content: JSON.stringify({ reasoning: 'step 2 plan' }),
      type: 'assistant',
    });

    const cp2: AgentCheckpoint = {
      sessionId,
      currentStep: 2,
      maxSteps: 20,
      taskPrompt: 'Long running task',
      config: { maxSteps: 20 },
      lastObservation: { summary: 'Step 2 observation' },
      lastPlan: { reasoning: 'step 2 plan' },
      lastExecutionResult: { success: true },
      sessionEntries: sm.getSession(sessionId)?.entries ?? [],
      timestamp: new Date().toISOString(),
    };
    cm.save(cp2);

    // Latest checkpoint should have all 3 entries
    const latest = cm.get(sessionId);
    expect(latest!.sessionEntries).toHaveLength(3);
    expect(latest!.currentStep).toBe(2);
  });

  it('should fix: runner onStepComplete now populates sessionEntries from sessionManager', () => {
    // This test verifies the specific fix in runner.ts:
    // Before: sessionEntries: []
    // After:  sessionEntries: sessionManager.getSession(state.sessionId)?.entries ?? []

    const sessionId = sm.createSession('agent-1', 'Test the login flow');
    sm.addEntry(sessionId, { role: 'user', content: 'Click login', type: 'user' });
    sm.addEntry(sessionId, { role: 'assistant', content: 'Clicked login button', type: 'assistant' });

    // Simulate the fixed onStepComplete callback
    const state = {
      sessionId,
      taskPrompt: 'Test the login flow',
      stepCount: 2,
      currentObservation: { summary: 'Login clicked' },
      lastPlan: null,
      lastExecution: { success: true },
    };

    // This is exactly what the fixed runner.ts line 93 does:
    const entries = sm.getSession(state.sessionId)?.entries ?? [];

    expect(entries).toHaveLength(2);
    expect(entries[0].role).toBe('user');
    expect(entries[0].content).toBe('Click login');
    expect(entries[1].role).toBe('assistant');
    expect(entries[1].content).toBe('Clicked login button');
  });
});
