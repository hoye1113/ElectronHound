export interface CDPDiscoveryResult {
  port: number;
  webSocketUrl: string;
  browserVersion: string;
}

const CDP_VERSION_PATH = '/json/version';
const DEFAULT_DISCOVERY_TIMEOUT = 10_000;
const POLL_INTERVAL = 500;
const FETCH_TIMEOUT = 250;

/**
 * Poll the CDP endpoint until a response is received or timeout.
 *
 * @param port - The CDP port to poll
 * @param timeout - Maximum wait time in ms (default: 10000)
 * @returns CDPDiscoveryResult with port, webSocketUrl, and browserVersion
 */
export async function discoverCDPPort(
  port: number,
  timeout: number = DEFAULT_DISCOVERY_TIMEOUT,
): Promise<CDPDiscoveryResult> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    try {
      const result = await fetchCDPVersion(port);
      return {
        port,
        webSocketUrl: result.webSocketDebuggerUrl,
        browserVersion: result.Browser,
      };
    } catch {
      // CDP not ready yet, wait and retry
      await sleep(POLL_INTERVAL);
    }
  }

  throw new Error(
    `CDP discovery timed out after ${timeout}ms on port ${port}`,
  );
}

/**
 * Get the WebSocket URL from a CDP endpoint in a single request.
 *
 * @param port - The CDP port
 * @returns The WebSocket debugger URL
 */
export async function getWebSocketUrl(port: number): Promise<string> {
  const result = await fetchCDPVersion(port);
  return result.webSocketDebuggerUrl;
}

/**
 * Fetch and parse the CDP /json/version endpoint.
 */
async function fetchCDPVersion(port: number): Promise<{
  webSocketDebuggerUrl: string;
  Browser: string;
}> {
  const url = `http://localhost:${port}${CDP_VERSION_PATH}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`CDP endpoint returned ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.webSocketDebuggerUrl) {
      throw new Error('CDP response missing webSocketDebuggerUrl');
    }

    return {
      webSocketDebuggerUrl: data.webSocketDebuggerUrl,
      Browser: data.Browser ?? 'unknown',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sleep for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
