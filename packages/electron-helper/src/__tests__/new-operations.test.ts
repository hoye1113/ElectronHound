import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OperationHandler } from '../operation-handler.js';
import type { CDPSession } from '../operation-handler.js';

/**
 * Create a mock CDP session with controllable send/on behavior.
 */
function createMockCdpSession(): CDPSession & {
  sendMock: ReturnType<typeof vi.fn>;
  onMock: ReturnType<typeof vi.fn>;
  eventHandlers: Map<string, (...args: unknown[]) => void>;
} {
  const eventHandlers = new Map<string, (...args: unknown[]) => void>();
  const sendMock = vi.fn();
  const onMock = vi.fn((event: string, callback: (...args: unknown[]) => void) => {
    eventHandlers.set(event, callback);
  });

  return {
    send: sendMock,
    on: onMock,
    sendMock,
    onMock,
    eventHandlers,
  };
}

describe('New CDP Operations', () => {
  let handler: OperationHandler;

  beforeEach(() => {
    handler = new OperationHandler();
  });

  // ── take_screenshot ─────────────────────────────────────────────────────

  describe('take_screenshot', () => {
    it('should return error when CDP session is not set', async () => {
      const result = await handler.handle({ type: 'take_screenshot' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('CDP session not available');
    });

    it('should capture screenshot via CDP and return base64 data', async () => {
      const mockSession = createMockCdpSession();
      mockSession.sendMock.mockResolvedValue({ data: 'iVBORw0KGgoAAAANSUhEUg...' });
      handler.setCdpSession(mockSession);

      const result = await handler.handle({ type: 'take_screenshot' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ screenshot: 'iVBORw0KGgoAAAANSUhEUg...' });
      expect(mockSession.sendMock).toHaveBeenCalledWith('Page.captureScreenshot', { format: 'png', quality: 80 });
    });

    it('should handle CDP send errors', async () => {
      const mockSession = createMockCdpSession();
      mockSession.sendMock.mockRejectedValue(new Error('Page crashed'));
      handler.setCdpSession(mockSession);

      const result = await handler.handle({ type: 'take_screenshot' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Page crashed');
    });
  });

  // ── get_console_logs ────────────────────────────────────────────────────

  describe('get_console_logs', () => {
    it('should return error when CDP session is not set', async () => {
      const result = await handler.handle({ type: 'get_console_logs' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('CDP session not available');
    });

    it('should enable Runtime domain and register console event listener', async () => {
      const mockSession = createMockCdpSession();
      mockSession.sendMock.mockResolvedValue({});
      handler.setCdpSession(mockSession);

      const result = await handler.handle({ type: 'get_console_logs' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('logs');
      expect(mockSession.sendMock).toHaveBeenCalledWith('Runtime.enable');
      expect(mockSession.onMock).toHaveBeenCalledWith('Runtime.consoleAPICalled', expect.any(Function));
    });

    it('should collect console events via the registered handler', async () => {
      const mockSession = createMockCdpSession();
      mockSession.sendMock.mockResolvedValue({});
      handler.setCdpSession(mockSession);

      const result = await handler.handle({ type: 'get_console_logs' });
      const logs = (result.data as { logs: unknown[] }).logs;

      // Simulate a console event after the handler is registered
      const consoleHandler = mockSession.eventHandlers.get('Runtime.consoleAPICalled');
      expect(consoleHandler).toBeDefined();

      consoleHandler!({
        type: 'log',
        args: [{ value: 'hello' }, { value: 'world' }],
        timestamp: 1234567890,
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]).toEqual({
        type: 'log',
        args: ['hello', 'world'],
        timestamp: 1234567890,
      });
    });

    it('should use description when value is not available', async () => {
      const mockSession = createMockCdpSession();
      mockSession.sendMock.mockResolvedValue({});
      handler.setCdpSession(mockSession);

      const result = await handler.handle({ type: 'get_console_logs' });
      const logs = (result.data as { logs: unknown[] }).logs;

      const consoleHandler = mockSession.eventHandlers.get('Runtime.consoleAPICalled')!;
      consoleHandler({
        type: 'error',
        args: [{ description: 'TypeError: undefined is not a function' }],
        timestamp: 99999,
      });

      expect(logs).toHaveLength(1);
      expect((logs[0] as { args: unknown[] }).args).toEqual(['TypeError: undefined is not a function']);
    });
  });

  // ── evaluate_in_page ────────────────────────────────────────────────────

  describe('evaluate_in_page', () => {
    it('should return error when CDP session is not set', async () => {
      const result = await handler.handle({ type: 'evaluate_in_page', payload: { expression: '1+1' } });

      expect(result.success).toBe(false);
      expect(result.error).toBe('CDP session not available');
    });

    it('should return error for missing expression', async () => {
      const mockSession = createMockCdpSession();
      handler.setCdpSession(mockSession);

      const result = await handler.handle({ type: 'evaluate_in_page', payload: {} });

      expect(result.success).toBe(false);
      expect(result.error).toBe('payload.expression must be a non-empty string');
    });

    it('should return error for empty expression', async () => {
      const mockSession = createMockCdpSession();
      handler.setCdpSession(mockSession);

      const result = await handler.handle({ type: 'evaluate_in_page', payload: { expression: '' } });

      expect(result.success).toBe(false);
      expect(result.error).toBe('payload.expression must be a non-empty string');
    });

    it('should evaluate expression and return result', async () => {
      const mockSession = createMockCdpSession();
      mockSession.sendMock.mockResolvedValue({
        result: { type: 'number', value: 42 },
        exceptionDetails: undefined,
      });
      handler.setCdpSession(mockSession);

      const result = await handler.handle({
        type: 'evaluate_in_page',
        payload: { expression: 'document.title' },
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        result: { type: 'number', value: 42 },
        exceptionDetails: undefined,
      });
      expect(mockSession.sendMock).toHaveBeenCalledWith('Runtime.evaluate', {
        expression: 'document.title',
        returnByValue: true,
      });
    });

    it('should return exception details when evaluation fails', async () => {
      const mockSession = createMockCdpSession();
      mockSession.sendMock.mockResolvedValue({
        result: { type: 'undefined' },
        exceptionDetails: { text: 'SyntaxError: Unexpected token' },
      });
      handler.setCdpSession(mockSession);

      const result = await handler.handle({
        type: 'evaluate_in_page',
        payload: { expression: 'function(' },
      });

      expect(result.success).toBe(true);
      expect((result.data as { exceptionDetails: unknown }).exceptionDetails).toEqual({
        text: 'SyntaxError: Unexpected token',
      });
    });
  });

  // ── get_network_requests ────────────────────────────────────────────────

  describe('get_network_requests', () => {
    it('should return error when CDP session is not set', async () => {
      const result = await handler.handle({ type: 'get_network_requests' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('CDP session not available');
    });

    it('should enable Network domain and register request listener', async () => {
      const mockSession = createMockCdpSession();
      mockSession.sendMock.mockResolvedValue({});
      handler.setCdpSession(mockSession);

      const result = await handler.handle({ type: 'get_network_requests' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('requests');
      expect(mockSession.sendMock).toHaveBeenCalledWith('Network.enable');
      expect(mockSession.onMock).toHaveBeenCalledWith('Network.requestWillBeSent', expect.any(Function));
    });

    it('should collect network events via the registered handler', async () => {
      const mockSession = createMockCdpSession();
      mockSession.sendMock.mockResolvedValue({});
      handler.setCdpSession(mockSession);

      const result = await handler.handle({ type: 'get_network_requests' });
      const requests = (result.data as { requests: unknown[] }).requests;

      const networkHandler = mockSession.eventHandlers.get('Network.requestWillBeSent')!;
      networkHandler({
        request: { url: 'https://example.com/api', method: 'GET' },
        type: 'XHR',
        timestamp: 1234567890.123,
      });

      expect(requests).toHaveLength(1);
      expect(requests[0]).toEqual({
        url: 'https://example.com/api',
        method: 'GET',
        type: 'XHR',
        timestamp: 1234567890.123,
      });
    });

    it('should accumulate multiple network events', async () => {
      const mockSession = createMockCdpSession();
      mockSession.sendMock.mockResolvedValue({});
      handler.setCdpSession(mockSession);

      const result = await handler.handle({ type: 'get_network_requests' });
      const requests = (result.data as { requests: unknown[] }).requests;

      const networkHandler = mockSession.eventHandlers.get('Network.requestWillBeSent')!;
      networkHandler({
        request: { url: 'https://a.com', method: 'GET' },
        type: 'Document',
        timestamp: 1,
      });
      networkHandler({
        request: { url: 'https://b.com', method: 'POST' },
        type: 'XHR',
        timestamp: 2,
      });

      expect(requests).toHaveLength(2);
    });
  });

  // ── set_window_bounds ───────────────────────────────────────────────────

  describe('set_window_bounds', () => {
    it('should return error when CDP session is not set', async () => {
      const result = await handler.handle({
        type: 'set_window_bounds',
        payload: { bounds: { x: 0, y: 0, width: 800, height: 600 } },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('CDP session not available');
    });

    it('should return error for missing bounds', async () => {
      const mockSession = createMockCdpSession();
      handler.setCdpSession(mockSession);

      const result = await handler.handle({ type: 'set_window_bounds', payload: {} });

      expect(result.success).toBe(false);
      expect(result.error).toContain('bounds');
    });

    it('should return error for incomplete bounds', async () => {
      const mockSession = createMockCdpSession();
      handler.setCdpSession(mockSession);

      const result = await handler.handle({
        type: 'set_window_bounds',
        payload: { bounds: { x: 0, y: 0 } },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('bounds');
    });

    it('should set window bounds via CDP', async () => {
      const mockSession = createMockCdpSession();
      mockSession.sendMock
        .mockResolvedValueOnce({ windowId: 42 })
        .mockResolvedValueOnce({});
      handler.setCdpSession(mockSession);

      const bounds = { x: 100, y: 200, width: 1024, height: 768 };
      const result = await handler.handle({ type: 'set_window_bounds', payload: { bounds } });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ windowId: 42, bounds });
      expect(mockSession.sendMock).toHaveBeenNthCalledWith(1, 'Browser.getWindowForTarget');
      expect(mockSession.sendMock).toHaveBeenNthCalledWith(2, 'Browser.setWindowBounds', { windowId: 42, bounds });
    });

    it('should handle CDP errors during window bounds setting', async () => {
      const mockSession = createMockCdpSession();
      mockSession.sendMock.mockRejectedValue(new Error('No window'));
      handler.setCdpSession(mockSession);

      const result = await handler.handle({
        type: 'set_window_bounds',
        payload: { bounds: { x: 0, y: 0, width: 800, height: 600 } },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No window');
    });
  });
});
