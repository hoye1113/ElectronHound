import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../sessionManager.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it('addEntry and getEntries work', () => {
    manager.addEntry({
      id: '1',
      type: 'user',
      content: 'Hello',
      timestamp: '2024-01-01T00:00:00Z',
    });
    expect(manager.getEntries()).toHaveLength(1);
  });

  it('getEntries returns a copy', () => {
    manager.addEntry({
      id: '1',
      type: 'user',
      content: 'Hello',
      timestamp: '2024-01-01T00:00:00Z',
    });
    const entries = manager.getEntries();
    entries.pop();
    expect(manager.getEntries()).toHaveLength(1);
  });

  it('serializeConversation formats correctly', () => {
    manager.addEntry({
      id: '1',
      type: 'user',
      content: 'Hello',
      timestamp: '2024-01-01T00:00:00Z',
    });
    manager.addEntry({
      id: '2',
      type: 'assistant',
      content: 'Hi',
      timestamp: '2024-01-01T00:00:01Z',
    });
    expect(manager.serializeConversation()).toBe('[user] Hello\n[assistant] Hi');
  });

  it('serializeConversation with empty entries', () => {
    expect(manager.serializeConversation()).toBe('');
  });

  it('extractFileOperations extracts files', () => {
    manager.addEntry({
      id: '1',
      type: 'compaction',
      summary: 'Summary',
      readFiles: ['a.ts', 'b.ts'],
      modifiedFiles: ['c.ts'],
      tokenCount: 100,
      timestamp: '2024-01-01T00:00:00Z',
    });
    const ops = manager.extractFileOperations();
    expect(ops.read).toEqual(['a.ts', 'b.ts']);
    expect(ops.modified).toEqual(['c.ts']);
  });

  it('extractFileOperations with no matching entries', () => {
    manager.addEntry({
      id: '1',
      type: 'user',
      content: 'Hello',
      timestamp: '2024-01-01T00:00:00Z',
    });
    const ops = manager.extractFileOperations();
    expect(ops.read).toEqual([]);
    expect(ops.modified).toEqual([]);
  });

  it('clear removes all entries', () => {
    manager.addEntry({
      id: '1',
      type: 'user',
      content: 'Hello',
      timestamp: '2024-01-01T00:00:00Z',
    });
    manager.clear();
    expect(manager.getEntries()).toHaveLength(0);
  });
});
