import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { discoverCDPPort, getWebSocketUrl } from '../cdp-discovery.js';

describe('CDP Discovery', () => {
  let server: Server;
  let port: number;

  beforeEach(() => {
    // Create a server on a random available port
    server = createServer();
    return new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          port = address.port;
        }
        resolve();
      });
    });
  });

  afterEach(() => {
    // Remove all request listeners to prevent stale handlers between tests
    server.removeAllListeners('request');
    // Close any pending connections before closing the server
    if ('closeAllConnections' in server) {
      (server as Server & { closeAllConnections: () => void }).closeAllConnections();
    }
    return new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('discoverCDPPort', () => {
    it('should successfully discover CDP endpoint with valid JSON response', async () => {
      const cdpResponse = JSON.stringify({
        Browser: 'Chrome/120.0.6099.0',
        webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/abc123`,
      });

      server.on('request', (req, res) => {
        if (req.url === '/json/version') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(cdpResponse);
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      const result = await discoverCDPPort(port, 5000);

      expect(result.port).toBe(port);
      expect(result.webSocketUrl).toBe(`ws://127.0.0.1:${port}/devtools/browser/abc123`);
      expect(result.browserVersion).toBe('Chrome/120.0.6099.0');
    });

    it('should timeout when no response is available', async () => {
      // Server is running but never responds to /json/version
      await expect(discoverCDPPort(port, 1000)).rejects.toThrow(
        `CDP discovery timed out after 1000ms on port ${port}`,
      );
    });

    it('should handle malformed response by retrying until timeout', async () => {
      server.on('request', (req, res) => {
        if (req.url === '/json/version') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          // Missing webSocketDebuggerUrl — causes retry
          res.end(JSON.stringify({ Browser: 'test' }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      // discoverCDPPort retries on all errors, so malformed response leads to timeout
      await expect(discoverCDPPort(port, 2000)).rejects.toThrow(
        'CDP discovery timed out',
      );
    });

    it('should handle HTTP error responses by retrying until timeout', async () => {
      server.on('request', (req, res) => {
        res.writeHead(500);
        res.end();
      });

      await expect(discoverCDPPort(port, 2000)).rejects.toThrow(
        'CDP discovery timed out',
      );
    });

    it('should poll multiple times before success', async () => {
      let requestCount = 0;

      server.on('request', (req, res) => {
        requestCount++;
        if (req.url === '/json/version') {
          if (requestCount < 3) {
            // First two requests: destroy connection to simulate not-ready
            res.destroy();
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              Browser: 'Chrome/121.0.0.0',
              webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/xyz`,
            }),
          );
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      const result = await discoverCDPPort(port, 5000);
      expect(result.browserVersion).toBe('Chrome/121.0.0.0');
      expect(requestCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('getWebSocketUrl', () => {
    it('should return WebSocket URL from CDP endpoint', async () => {
      server.on('request', (req, res) => {
        if (req.url === '/json/version') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              Browser: 'Chrome/120.0.0.0',
              webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/test`,
            }),
          );
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      const url = await getWebSocketUrl(port);
      expect(url).toBe(`ws://127.0.0.1:${port}/devtools/browser/test`);
    });

    it('should throw when endpoint returns error', async () => {
      server.on('request', (req, res) => {
        res.writeHead(503);
        res.end();
      });

      await expect(getWebSocketUrl(port)).rejects.toThrow(
        'CDP endpoint returned 503',
      );
    });
  });
});
