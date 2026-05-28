import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discoverCDPPort, getWebSocketUrl } from '../cdp-discovery.js';

const mockFetch = vi.fn();

describe('CDP Discovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('discoverCDPPort', () => {
    it('should successfully discover CDP endpoint with valid JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            Browser: 'Chrome/120.0.6099.0',
            webSocketDebuggerUrl:
              'ws://127.0.0.1:9222/devtools/browser/abc123',
          }),
      });

      const result = await discoverCDPPort(9222, 5000);
      expect(result.port).toBe(9222);
      expect(result.webSocketUrl).toBe(
        'ws://127.0.0.1:9222/devtools/browser/abc123',
      );
      expect(result.browserVersion).toBe('Chrome/120.0.6099.0');
    });

    it('should timeout when no response is available', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const promise = discoverCDPPort(9222, 1000);
      const assertion = expect(promise).rejects.toThrow(
        'CDP discovery timed out after 1000ms on port 9222',
      );
      await vi.advanceTimersByTimeAsync(1500);
      await assertion;
    });

    it('should handle malformed response by retrying until timeout', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ Browser: 'test' }),
      });

      const promise = discoverCDPPort(9222, 2000);
      const assertion = expect(promise).rejects.toThrow('CDP discovery timed out');
      await vi.advanceTimersByTimeAsync(2500);
      await assertion;
    });

    it('should handle HTTP error responses by retrying until timeout', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const promise = discoverCDPPort(9222, 2000);
      const assertion = expect(promise).rejects.toThrow('CDP discovery timed out');
      await vi.advanceTimersByTimeAsync(2500);
      await assertion;
    });

    it('should poll multiple times before success', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              Browser: 'Chrome/121.0.0.0',
              webSocketDebuggerUrl:
                'ws://127.0.0.1:9222/devtools/browser/xyz',
            }),
        });

      const promise = discoverCDPPort(9222, 5000);
      await vi.advanceTimersByTimeAsync(1500);

      const result = await promise;
      expect(result.browserVersion).toBe('Chrome/121.0.0.0');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('getWebSocketUrl', () => {
    it('should return WebSocket URL from CDP endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            Browser: 'Chrome/120.0.0.0',
            webSocketDebuggerUrl:
              'ws://127.0.0.1:9222/devtools/browser/test',
          }),
      });

      const url = await getWebSocketUrl(9222);
      expect(url).toBe('ws://127.0.0.1:9222/devtools/browser/test');
    });

    it('should throw when endpoint returns error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      await expect(getWebSocketUrl(9222)).rejects.toThrow(
        'CDP endpoint returned 503',
      );
    });
  });
});
