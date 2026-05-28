import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../sessionManager.js';
import type { SessionWithEntries } from '../types.js';

function makeManager(): SessionManager {
  return new SessionManager(':memory:');
}

describe('SessionManager (SQLite)', () => {
  let sm: SessionManager;

  beforeEach(() => {
    sm = makeManager();
  });

  afterEach(() => {
    sm.close();
  });

  // ── createSession ──────────────────────────────────────────────────────────

  describe('createSession', () => {
    it('creates a session and returns a UUID v4 string', () => {
      const id = sm.createSession('agent-1', 'Test login flow');
      expect(id).toBeTypeOf('string');
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('persists the session so it can be retrieved', () => {
      const id = sm.createSession('agent-1', 'Test login flow');
      const session = sm.getSession(id);
      expect(session).not.toBeNull();
      expect(session!.agentId).toBe('agent-1');
      expect(session!.taskPrompt).toBe('Test login flow');
      expect(session!.createdAt).toBeTypeOf('string');
      expect(session!.entries).toEqual([]);
    });

    it('generates unique IDs for different sessions', () => {
      const id1 = sm.createSession('a', 'task1');
      const id2 = sm.createSession('b', 'task2');
      expect(id1).not.toBe(id2);
    });

    it('stores createdAt as ISO 8601', () => {
      const id = sm.createSession('a', 'task');
      const session = sm.getSession(id);
      expect(session!.createdAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });
  });

  // ── getSession ─────────────────────────────────────────────────────────────

  describe('getSession', () => {
    it('returns null for a non-existent session', () => {
      expect(sm.getSession('non-existent-id')).toBeNull();
    });

    it('returns the full session with zero entries when no entries added', () => {
      const id = sm.createSession('agent-1', 'Task');
      const session = sm.getSession(id);
      expect(session).not.toBeNull();
      expect(session!.id).toBe(id);
      expect(session!.entries).toHaveLength(0);
      expect(session!.compaction).toBeUndefined();
    });

    it('returns all entries ordered by timestamp', () => {
      const id = sm.createSession('agent-1', 'Task');

      sm.addEntry(id, {
        role: 'user',
        content: 'First message',
        type: 'user',
        timestamp: '2025-01-01T00:00:00.000Z',
      });
      sm.addEntry(id, {
        role: 'assistant',
        content: 'Second message',
        type: 'assistant',
        timestamp: '2025-01-01T00:00:01.000Z',
      });

      const session = sm.getSession(id)!;
      expect(session.entries).toHaveLength(2);
      expect(session.entries[0].content).toBe('First message');
      expect(session.entries[1].content).toBe('Second message');
    });

    it('includes compaction when session has been compacted', () => {
      const id = sm.createSession('agent-1', 'Task');
      sm.addEntry(id, { role: 'user', content: 'Hello', type: 'user' });

      sm.compactSession(id, 'The user said hello.', [
        { branchName: 'main', summary: 'Single branch' },
      ]);

      const session = sm.getSession(id)!;
      expect(session.compaction).toBeDefined();
      expect(session.compaction!.summary).toBe('The user said hello.');
      expect(session.compaction!.branchSummaries).toHaveLength(1);
      expect(session.compaction!.branchSummaries[0].branchName).toBe('main');
      expect(session.compaction!.compactedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it('overwrites previous compaction', () => {
      const id = sm.createSession('agent-1', 'Task');
      sm.compactSession(id, 'First summary', []);
      sm.compactSession(id, 'Second summary', [
        { branchName: 'b1', summary: 'Branch 1' },
      ]);

      const session = sm.getSession(id)!;
      expect(session.compaction!.summary).toBe('Second summary');
      expect(session.compaction!.branchSummaries).toHaveLength(1);
      expect(session.compaction!.branchSummaries[0].branchName).toBe('b1');
    });
  });

  // ── addEntry ───────────────────────────────────────────────────────────────

  describe('addEntry', () => {
    it('adds an entry and returns a UUID v4 entry ID', () => {
      const sessionId = sm.createSession('agent-1', 'Task');
      const entryId = sm.addEntry(sessionId, {
        role: 'user',
        content: 'Hello',
        type: 'user',
      });

      expect(entryId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('persists the entry to the database', () => {
      const sessionId = sm.createSession('agent-1', 'Task');
      sm.addEntry(sessionId, {
        role: 'user',
        content: 'Hello, World!',
        type: 'user',
      });

      const session = sm.getSession(sessionId)!;
      expect(session.entries).toHaveLength(1);
      expect(session.entries[0].role).toBe('user');
      expect(session.entries[0].content).toBe('Hello, World!');
      expect(session.entries[0].type).toBe('user');
      expect(session.entries[0].sessionId).toBe(sessionId);
      expect(session.entries[0].timestamp).toBeTypeOf('string');
    });

    it('accepts custom id and timestamp', () => {
      const sessionId = sm.createSession('agent-1', 'Task');
      const entryId = sm.addEntry(sessionId, {
        role: 'system',
        content: 'System prompt',
        type: 'system',
        id: 'my-custom-id',
        timestamp: '2024-06-01T12:00:00.000Z',
      });

      expect(entryId).toBe('my-custom-id');
      const session = sm.getSession(sessionId)!;
      expect(session.entries[0].id).toBe('my-custom-id');
      expect(session.entries[0].timestamp).toBe('2024-06-01T12:00:00.000Z');
    });

    it('supports compaction type entries', () => {
      const sessionId = sm.createSession('agent-1', 'Task');
      sm.addEntry(sessionId, {
        role: 'system',
        content: '[COMPACTION] Summary of previous messages',
        type: 'compaction',
      });

      const session = sm.getSession(sessionId)!;
      expect(session.entries[0].type).toBe('compaction');
    });

    it('adds multiple entries to the same session', () => {
      const sessionId = sm.createSession('agent-1', 'Task');

      sm.addEntry(sessionId, { role: 'user', content: 'Q1', type: 'user' });
      sm.addEntry(sessionId, {
        role: 'assistant',
        content: 'A1',
        type: 'assistant',
      });
      sm.addEntry(sessionId, { role: 'system', content: 'note', type: 'system' });

      const session = sm.getSession(sessionId)!;
      expect(session.entries).toHaveLength(3);
      expect(session.entries.map((e) => e.role)).toEqual([
        'user',
        'assistant',
        'system',
      ]);
    });
  });

  // ── compactSession ─────────────────────────────────────────────────────────

  describe('compactSession', () => {
    it('stores a compaction summary for a session', () => {
      const sessionId = sm.createSession('agent-1', 'Task');
      sm.compactSession(
        sessionId,
        'Session was about testing login.',
        [
          { branchName: 'ui-tests', summary: 'Login page UI checks' },
          { branchName: 'api-tests', summary: 'Auth API checks' },
        ],
      );

      const session = sm.getSession(sessionId)!;
      expect(session.compaction).toBeDefined();
      expect(session.compaction!.summary).toBe(
        'Session was about testing login.',
      );
      expect(session.compaction!.branchSummaries).toHaveLength(2);
      expect(session.compaction!.branchSummaries[0].branchName).toBe('ui-tests');
      expect(session.compaction!.branchSummaries[0].summary).toBe(
        'Login page UI checks',
      );
    });

    it('handles empty branch summaries array', () => {
      const sessionId = sm.createSession('agent-1', 'Task');
      sm.compactSession(sessionId, 'No branches.', []);

      const session = sm.getSession(sessionId)!;
      expect(session.compaction!.summary).toBe('No branches.');
      expect(session.compaction!.branchSummaries).toEqual([]);
    });

    it('compactedAt is ISO 8601', () => {
      const sessionId = sm.createSession('agent-1', 'Task');
      sm.compactSession(sessionId, 's', []);

      const session = sm.getSession(sessionId)!;
      expect(session.compaction!.compactedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });
  });

  // ── deleteSession ──────────────────────────────────────────────────────────

  describe('deleteSession', () => {
    it('deletes a session and its entries', () => {
      const sessionId = sm.createSession('agent-1', 'Task');
      sm.addEntry(sessionId, { role: 'user', content: 'msg', type: 'user' });
      sm.compactSession(sessionId, 'summary', []);

      sm.deleteSession(sessionId);
      expect(sm.getSession(sessionId)).toBeNull();
    });

    it('is idempotent — deleting a non-existent session does not throw', () => {
      expect(() => sm.deleteSession('nonexistent')).not.toThrow();
    });
  });

  // ── Integration: full lifecycle ────────────────────────────────────────────

  it('full lifecycle: create → add entries → compact → retrieve → delete', () => {
    // Create
    const sessionId = sm.createSession('agent-42', 'Full integration test');
    expect(sessionId).toBeTruthy();

    // Add entries
    sm.addEntry(sessionId, {
      role: 'user',
      content: 'Please test the login page',
      type: 'user',
    });
    const entryId2 = sm.addEntry(sessionId, {
      role: 'assistant',
      content: 'I will observe the login page now.',
      type: 'assistant',
    });

    // Verify entries exist
    let session: SessionWithEntries | null = sm.getSession(sessionId);
    expect(session).not.toBeNull();
    expect(session!.entries).toHaveLength(2);

    // Compact
    sm.compactSession(sessionId, 'Login page observation completed.', [
      { branchName: 'observe', summary: 'Page observed successfully' },
    ]);

    // Verify compaction
    session = sm.getSession(sessionId);
    expect(session!.compaction).toBeDefined();
    expect(session!.compaction!.summary).toBe(
      'Login page observation completed.',
    );
    expect(session!.compaction!.branchSummaries).toHaveLength(1);

    // Entries are still present after compaction
    expect(session!.entries).toHaveLength(2);

    // Delete
    sm.deleteSession(sessionId);
    expect(sm.getSession(sessionId)).toBeNull();
  });

  // ── Multiple sessions isolation ────────────────────────────────────────────

  it('isolates entries between different sessions', () => {
    const s1 = sm.createSession('agent-a', 'Task A');
    const s2 = sm.createSession('agent-b', 'Task B');

    sm.addEntry(s1, { role: 'user', content: 'A1', type: 'user' });
    sm.addEntry(s2, { role: 'user', content: 'B1', type: 'user' });

    const session1 = sm.getSession(s1)!;
    const session2 = sm.getSession(s2)!;

    expect(session1.entries).toHaveLength(1);
    expect(session1.entries[0].content).toBe('A1');
    expect(session2.entries).toHaveLength(1);
    expect(session2.entries[0].content).toBe('B1');
  });

  // ── close ──────────────────────────────────────────────────────────────────

  it('close() closes the database', () => {
    const local = makeManager();
    expect(() => local.close()).not.toThrow();
    // Closing again is safe (better-sqlite3 handles this gracefully)
  });
});
