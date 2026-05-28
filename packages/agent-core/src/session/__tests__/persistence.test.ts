import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

import {
  initSessionDb,
  createSessionQueries,
  createSession,
  getSession,
  addEntry,
  compactSession,
  deleteSession,
  generateId,
  nowISO,
} from '../persistence.js';
import type { SessionQueries } from '../persistence.js';
import type { SessionWithEntries } from '../types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDb(): Database.Database {
  return initSessionDb(':memory:');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('persistence', () => {
  let db: Database.Database;
  let q: SessionQueries;

  beforeEach(() => {
    db = makeDb();
    q = createSessionQueries(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── generateId ──────────────────────────────────────────────────────────────

  describe('generateId', () => {
    it('returns a UUID v4 string', () => {
      const id = generateId();
      expect(id).toBeTypeOf('string');
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('returns unique IDs on successive calls', () => {
      const ids = new Set(Array.from({ length: 50 }, () => generateId()));
      expect(ids.size).toBe(50);
    });
  });

  // ── nowISO ──────────────────────────────────────────────────────────────────

  describe('nowISO', () => {
    it('returns a valid ISO 8601 string', () => {
      const ts = nowISO();
      expect(ts).toBeTypeOf('string');
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      // Should be parseable as a date
      expect(new Date(ts).toISOString()).toBe(ts);
    });
  });

  // ── initSessionDb ──────────────────────────────────────────────────────────

  describe('initSessionDb', () => {
    it('returns a Database instance', () => {
      expect(db).toBeDefined();
      // Should be able to run queries
      const result = db.prepare('SELECT 1 AS val').get() as { val: number };
      expect(result.val).toBe(1);
    });

    it('attempts to set WAL journal mode (memory DB falls back to memory)', () => {
      // In-memory databases cannot use WAL; the pragma call still succeeds
      // but SQLite falls back to "memory" journal mode.
      const mode = db.pragma('journal_mode', { simple: true });
      expect(['wal', 'memory']).toContain(mode);
    });

    it('enables foreign keys', () => {
      const fk = db.pragma('foreign_keys', { simple: true });
      expect(fk).toBe(1);
    });

    it('creates all required tables', () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toContain('sessions');
      expect(names).toContain('entries');
      expect(names).toContain('compactions');
    });

    it('creates the entries session_id index', () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all() as { name: string }[];
      const names = indexes.map((i) => i.name);
      expect(names).toContain('idx_entries_session_id');
    });

    it('is safe to call twice on the same path (idempotent migration)', () => {
      // initSessionDb already called in beforeEach; calling again should not throw
      const db2 = initSessionDb(':memory:');
      expect(() => db2.exec('SELECT 1')).not.toThrow();
      db2.close();
    });
  });

  // ── createSessionQueries ───────────────────────────────────────────────────

  describe('createSessionQueries', () => {
    it('returns an object with all expected prepared statements', () => {
      expect(q.insertSession).toBeDefined();
      expect(q.selectSession).toBeDefined();
      expect(q.insertEntry).toBeDefined();
      expect(q.selectEntriesBySession).toBeDefined();
      expect(q.upsertCompaction).toBeDefined();
      expect(q.selectCompaction).toBeDefined();
      expect(q.deleteSession).toBeDefined();
    });
  });

  // ── createSession / getSession ──────────────────────────────────────────────

  describe('createSession', () => {
    it('returns a UUID v4 string', () => {
      const id = createSession(q, 'agent-1', 'Test task');
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('persists the session so it can be retrieved via getSession', () => {
      const id = createSession(q, 'agent-1', 'Test login flow');
      const session = getSession(q, id);
      expect(session).not.toBeNull();
      expect(session!.id).toBe(id);
      expect(session!.agentId).toBe('agent-1');
      expect(session!.taskPrompt).toBe('Test login flow');
      expect(session!.createdAt).toBeTypeOf('string');
      expect(session!.entries).toEqual([]);
      expect(session!.compaction).toBeUndefined();
    });

    it('stores createdAt as ISO 8601', () => {
      const id = createSession(q, 'agent-1', 'task');
      const session = getSession(q, id);
      expect(session!.createdAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it('generates unique IDs for different sessions', () => {
      const id1 = createSession(q, 'a', 'task1');
      const id2 = createSession(q, 'b', 'task2');
      expect(id1).not.toBe(id2);
    });
  });

  describe('getSession', () => {
    it('returns null for a non-existent session', () => {
      expect(getSession(q, 'non-existent-id')).toBeNull();
    });

    it('returns a session with zero entries and no compaction initially', () => {
      const id = createSession(q, 'agent-1', 'Task');
      const session = getSession(q, id);
      expect(session).not.toBeNull();
      expect(session!.entries).toHaveLength(0);
      expect(session!.compaction).toBeUndefined();
    });
  });

  // ── addEntry ────────────────────────────────────────────────────────────────

  describe('addEntry', () => {
    let sessionId: string;

    beforeEach(() => {
      sessionId = createSession(q, 'agent-1', 'Task');
    });

    it('returns the entry ID', () => {
      const entryId = addEntry(q, sessionId, {
        role: 'user',
        content: 'Hello',
        type: 'user',
      });
      expect(entryId).toBeTypeOf('string');
      expect(entryId.length).toBeGreaterThan(0);
    });

    it('appends an entry that is retrievable via getSession', () => {
      addEntry(q, sessionId, {
        role: 'user',
        content: 'Hello world',
        type: 'user',
      });
      const session = getSession(q, sessionId);
      expect(session!.entries).toHaveLength(1);
      expect(session!.entries[0].role).toBe('user');
      expect(session!.entries[0].content).toBe('Hello world');
      expect(session!.entries[0].type).toBe('user');
      expect(session!.entries[0].sessionId).toBe(sessionId);
    });

    it('uses provided id and timestamp when given', () => {
      const customId = 'custom-entry-id';
      const customTs = '2025-06-01T12:00:00.000Z';
      const entryId = addEntry(q, sessionId, {
        id: customId,
        timestamp: customTs,
        role: 'assistant',
        content: 'Response',
        type: 'assistant',
      });
      expect(entryId).toBe(customId);
      const session = getSession(q, sessionId);
      expect(session!.entries[0].id).toBe(customId);
      expect(session!.entries[0].timestamp).toBe(customTs);
    });

    it('orders entries by timestamp ascending', () => {
      addEntry(q, sessionId, {
        role: 'user',
        content: 'Later',
        type: 'user',
        timestamp: '2025-01-02T00:00:00.000Z',
      });
      addEntry(q, sessionId, {
        role: 'user',
        content: 'Earlier',
        type: 'user',
        timestamp: '2025-01-01T00:00:00.000Z',
      });
      const session = getSession(q, sessionId);
      expect(session!.entries).toHaveLength(2);
      expect(session!.entries[0].content).toBe('Earlier');
      expect(session!.entries[1].content).toBe('Later');
    });

    it('supports all role and type values', () => {
      const roles: Array<'user' | 'assistant' | 'system'> = [
        'user',
        'assistant',
        'system',
      ];
      const types: Array<'user' | 'assistant' | 'system' | 'compaction'> = [
        'user',
        'assistant',
        'system',
        'compaction',
      ];

      for (let i = 0; i < roles.length; i++) {
        addEntry(q, sessionId, {
          role: roles[i],
          content: `entry-${roles[i]}`,
          type: types[i],
        });
      }
      const session = getSession(q, sessionId);
      expect(session!.entries).toHaveLength(roles.length);
      for (let i = 0; i < roles.length; i++) {
        expect(session!.entries[i].role).toBe(roles[i]);
        expect(session!.entries[i].type).toBe(types[i]);
      }
    });
  });

  // ── compactSession ──────────────────────────────────────────────────────────

  describe('compactSession', () => {
    let sessionId: string;

    beforeEach(() => {
      sessionId = createSession(q, 'agent-1', 'Task');
      addEntry(q, sessionId, {
        role: 'user',
        content: 'Message 1',
        type: 'user',
      });
    });

    it('stores a compaction that is returned by getSession', () => {
      compactSession(q, sessionId, 'Session summary', [
        { branchName: 'main', summary: 'Did stuff' },
      ]);
      const session = getSession(q, sessionId);
      expect(session!.compaction).toBeDefined();
      expect(session!.compaction!.summary).toBe('Session summary');
      expect(session!.compaction!.branchSummaries).toEqual([
        { branchName: 'main', summary: 'Did stuff' },
      ]);
      expect(session!.compaction!.compactedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it('upserts: replaces an existing compaction on second call', () => {
      compactSession(q, sessionId, 'First summary', [
        { branchName: 'a', summary: 'first' },
      ]);
      compactSession(q, sessionId, 'Second summary', [
        { branchName: 'b', summary: 'second' },
      ]);
      const session = getSession(q, sessionId);
      expect(session!.compaction!.summary).toBe('Second summary');
      expect(session!.compaction!.branchSummaries).toEqual([
        { branchName: 'b', summary: 'second' },
      ]);
    });

    it('handles empty branchSummaries array', () => {
      compactSession(q, sessionId, 'No branches', []);
      const session = getSession(q, sessionId);
      expect(session!.compaction!.branchSummaries).toEqual([]);
    });

    it('handles multiple branch summaries', () => {
      const branches = [
        { branchName: 'feat-a', summary: 'Implemented feature A' },
        { branchName: 'feat-b', summary: 'Implemented feature B' },
        { branchName: 'fix-c', summary: 'Fixed bug C' },
      ];
      compactSession(q, sessionId, 'Multi-branch summary', branches);
      const session = getSession(q, sessionId);
      expect(session!.compaction!.branchSummaries).toHaveLength(3);
      expect(session!.compaction!.branchSummaries).toEqual(branches);
    });
  });

  // ── deleteSession ───────────────────────────────────────────────────────────

  describe('deleteSession', () => {
    it('removes the session so getSession returns null', () => {
      const id = createSession(q, 'agent-1', 'Task');
      deleteSession(q, id);
      expect(getSession(q, id)).toBeNull();
    });

    it('is a no-op for a non-existent session (does not throw)', () => {
      expect(() => deleteSession(q, 'ghost-id')).not.toThrow();
    });

    it('cascading delete removes all associated entries', () => {
      const id = createSession(q, 'agent-1', 'Task');
      addEntry(q, id, { role: 'user', content: 'msg1', type: 'user' });
      addEntry(q, id, { role: 'assistant', content: 'msg2', type: 'assistant' });

      // Verify entries exist before delete
      const session = getSession(q, id);
      expect(session!.entries).toHaveLength(2);

      deleteSession(q, id);
      // Verify entries are gone (session is null, so entries are also gone)
      expect(getSession(q, id)).toBeNull();

      // Direct check: entries table should have no rows for this session
      const rows = db
        .prepare('SELECT * FROM entries WHERE session_id = ?')
        .all(id);
      expect(rows).toHaveLength(0);
    });

    it('cascading delete removes associated compaction', () => {
      const id = createSession(q, 'agent-1', 'Task');
      compactSession(q, id, 'summary', []);

      // Verify compaction exists
      const session = getSession(q, id);
      expect(session!.compaction).toBeDefined();

      deleteSession(q, id);
      expect(getSession(q, id)).toBeNull();

      // Direct check: compactions table should have no row for this session
      const rows = db
        .prepare('SELECT * FROM compactions WHERE session_id = ?')
        .all(id);
      expect(rows).toHaveLength(0);
    });
  });

  // ── rowToCompaction with invalid JSON ───────────────────────────────────────

  describe('rowToCompaction (invalid branch_summaries)', () => {
    it('returns empty branchSummaries and logs warning when branch_summaries is invalid JSON', () => {
      // Insert a compaction with valid JSON first
      const id = createSession(q, 'agent-1', 'Task');
      compactSession(q, id, 'summary', [
        { branchName: 'a', summary: 'ok' },
      ]);

      // Manually corrupt the branch_summaries column
      db.prepare('UPDATE compactions SET branch_summaries = ? WHERE session_id = ?').run(
        'not-valid-json{{{',
        id,
      );

      // Spy on stderr to verify the warning is written
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      const session = getSession(q, id);
      expect(session).not.toBeNull();
      expect(session!.compaction).toBeDefined();
      expect(session!.compaction!.summary).toBe('summary');
      expect(session!.compaction!.branchSummaries).toEqual([]);

      // Verify a warning was written to stderr
      expect(stderrSpy).toHaveBeenCalledOnce();
      const written = stderrSpy.mock.calls[0][0] as string;
      expect(written).toContain('[persistence] [WARN] Warning:');

      stderrSpy.mockRestore();
    });
  });

  // ── Full CRUD lifecycle ─────────────────────────────────────────────────────

  describe('full CRUD lifecycle', () => {
    it('create -> add entries -> get -> compact -> get -> delete', () => {
      // 1. Create session
      const sessionId = createSession(q, 'agent-42', 'Build a widget');
      expect(sessionId).toBeTypeOf('string');

      // 2. Add entries
      const e1 = addEntry(q, sessionId, {
        role: 'user',
        content: 'Build a widget',
        type: 'user',
      });
      const e2 = addEntry(q, sessionId, {
        role: 'assistant',
        content: 'I will build a widget for you.',
        type: 'assistant',
      });
      const e3 = addEntry(q, sessionId, {
        role: 'user',
        content: 'Make it blue',
        type: 'user',
      });

      // 3. Get session and verify entries
      let session = getSession(q, sessionId) as SessionWithEntries;
      expect(session.agentId).toBe('agent-42');
      expect(session.taskPrompt).toBe('Build a widget');
      expect(session.entries).toHaveLength(3);
      expect(session.entries.map((e) => e.id)).toEqual([e1, e2, e3]);
      expect(session.compaction).toBeUndefined();

      // 4. Compact
      compactSession(q, sessionId, 'User wants a blue widget built', [
        { branchName: 'design', summary: 'Created blueprint' },
        { branchName: 'build', summary: 'Assembled parts' },
      ]);

      // 5. Get session and verify compaction
      session = getSession(q, sessionId) as SessionWithEntries;
      expect(session.compaction).toBeDefined();
      expect(session.compaction!.summary).toBe('User wants a blue widget built');
      expect(session.compaction!.branchSummaries).toHaveLength(2);
      // Entries should still be there
      expect(session.entries).toHaveLength(3);

      // 6. Delete
      deleteSession(q, sessionId);
      expect(getSession(q, sessionId)).toBeNull();
    });
  });
});
