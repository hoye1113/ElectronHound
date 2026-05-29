import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track registered listeners
const listeners: Record<string, ((e: Event) => void)[]> = {};

// Mock EventSource
const mockESInstance = {
  addEventListener: vi.fn((event: string, handler: (e: Event) => void) => {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(handler);
  }),
  close: vi.fn(),
  onerror: null as (() => void) | null,
};

vi.stubGlobal('EventSource', vi.fn(() => mockESInstance));

// Import after mock setup
const { connectSSE } = await import('../lib/sse.js');

function makeMessageEvent(data: string): MessageEvent {
  return new MessageEvent('test', { data });
}

describe('sse.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(listeners)) delete listeners[key];
    mockESInstance.onerror = null;
  });

  describe('connectSSE', () => {
    it('creates EventSource with correct URL', () => {
      connectSSE('task-123', {});
      expect(EventSource).toHaveBeenCalledWith(
        expect.stringContaining('/api/stream/tasks/task-123'),
      );
    });

    it('registers all 5 named event listeners', () => {
      connectSSE('task-123', {});
      expect(mockESInstance.addEventListener).toHaveBeenCalledWith('step', expect.any(Function));
      expect(mockESInstance.addEventListener).toHaveBeenCalledWith('log', expect.any(Function));
      expect(mockESInstance.addEventListener).toHaveBeenCalledWith('status', expect.any(Function));
      expect(mockESInstance.addEventListener).toHaveBeenCalledWith('complete', expect.any(Function));
      expect(mockESInstance.addEventListener).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('calls onStep with parsed data when step event fires', () => {
      const onStep = vi.fn();
      connectSSE('task-123', { onStep });

      listeners['step'][0](makeMessageEvent('{"index":0,"phase":"observe"}'));

      expect(onStep).toHaveBeenCalledWith({ index: 0, phase: 'observe' });
    });

    it('calls onLog with parsed data when log event fires', () => {
      const onLog = vi.fn();
      connectSSE('task-123', { onLog });

      listeners['log'][0](makeMessageEvent('{"message":"test log"}'));

      expect(onLog).toHaveBeenCalledWith({ message: 'test log' });
    });

    it('calls onStatus with parsed data when status event fires', () => {
      const onStatus = vi.fn();
      connectSSE('task-123', { onStatus });

      listeners['status'][0](makeMessageEvent('{"type":"connected"}'));

      expect(onStatus).toHaveBeenCalledWith({ type: 'connected' });
    });

    it('calls onComplete with parsed data when complete event fires', () => {
      const onComplete = vi.fn();
      connectSSE('task-123', { onComplete });

      listeners['complete'][0](makeMessageEvent('{"success":true}'));

      expect(onComplete).toHaveBeenCalledWith({ success: true });
    });

    it('calls onError with raw event (no JSON parsing)', () => {
      const onError = vi.fn();
      connectSSE('task-123', { onError });

      const rawEvent = new Event('error');
      listeners['error'][0](rawEvent);

      expect(onError).toHaveBeenCalledWith(rawEvent);
    });

    it('skips callback when data parsing returns null (invalid JSON)', () => {
      const onStep = vi.fn();
      connectSSE('task-123', { onStep });

      listeners['step'][0](makeMessageEvent('not valid json'));

      expect(onStep).not.toHaveBeenCalled();
    });

    it('does not throw when callback is not provided', () => {
      connectSSE('task-123', {});

      expect(() => {
        listeners['step'][0](makeMessageEvent('{"data":1}'));
        listeners['log'][0](makeMessageEvent('{"data":1}'));
        listeners['status'][0](makeMessageEvent('{"data":1}'));
        listeners['complete'][0](makeMessageEvent('{"data":1}'));
        listeners['error'][0](new Event('error'));
      }).not.toThrow();
    });

    it('returns the EventSource instance', () => {
      const es = connectSSE('task-123', {});
      expect(es).toBe(mockESInstance);
    });

    it('sets onerror handler for auto-reconnect warning', () => {
      connectSSE('task-123', {});
      expect(mockESInstance.onerror).toBeTypeOf('function');
    });
  });
});
