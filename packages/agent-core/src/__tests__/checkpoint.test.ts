import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CheckpointManager } from '../session/checkpointManager.js';
import type { AgentCheckpoint } from '../session/checkpointManager.js';

function makeCheckpoint(overrides: Partial<AgentCheckpoint> = {}): AgentCheckpoint {
  return {
    sessionId: 'test-session-001',
    currentStep: 3,
    maxSteps: 20,
    taskPrompt: 'Test the login flow',
    config: { maxSteps: 20, stuckThreshold: 3 },
    lastObservation: { summary: 'App is running', details: {} },
    lastPlan: { toolName: 'browser_click', action: 'Click login button' },
    lastExecutionResult: { success: true, result: null },
    sessionEntries: [
      {
        id: 'entry-1',
        sessionId: 'test-session-001',
        role: 'user',
        content: 'Test the login flow',
        timestamp: '2026-01-01T00:00:00.000Z',
        type: 'user',
      },
    ],
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('CheckpointManager', () => {
  let cm: CheckpointManager;

  beforeEach(() => {
    cm = new CheckpointManager(':memory:');
  });

  afterEach(() => {
    cm.close();
  });

  it('should save and retrieve a checkpoint by session ID', () => {
    const checkpoint = makeCheckpoint();
    cm.save(checkpoint);

    const retrieved = cm.get('test-session-001');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.sessionId).toBe('test-session-001');
    expect(retrieved!.currentStep).toBe(3);
    expect(retrieved!.taskPrompt).toBe('Test the login flow');
    expect(retrieved!.sessionEntries).toHaveLength(1);
  });

  it('should return null for non-existent session ID', () => {
    const result = cm.get('non-existent-id');
    expect(result).toBeNull();
  });

  it('should overwrite existing checkpoint on save with same session ID', () => {
    const checkpoint = makeCheckpoint();
    cm.save(checkpoint);

    const updated = makeCheckpoint({ currentStep: 7, taskPrompt: 'Updated task' });
    cm.save(updated);

    const retrieved = cm.get('test-session-001');
    expect(retrieved!.currentStep).toBe(7);
    expect(retrieved!.taskPrompt).toBe('Updated task');
  });

  it('should delete a checkpoint and return true; return false for non-existent', () => {
    cm.save(makeCheckpoint());

    const deleted = cm.delete('test-session-001');
    expect(deleted).toBe(true);
    expect(cm.get('test-session-001')).toBeNull();

    const notFound = cm.delete('test-session-001');
    expect(notFound).toBe(false);
  });

  it('should list all checkpoints ordered by most recently updated', () => {
    cm.save(makeCheckpoint({ sessionId: 'session-a', currentStep: 1 }));
    cm.save(makeCheckpoint({ sessionId: 'session-b', currentStep: 5 }));

    const all = cm.list();
    expect(all).toHaveLength(2);
    // Most recently updated comes first (session-b was saved last)
    expect(all[0].sessionId).toBe('session-b');
    expect(all[1].sessionId).toBe('session-a');
  });
});
