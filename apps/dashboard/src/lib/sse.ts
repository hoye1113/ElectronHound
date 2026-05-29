const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface SSECallbacks {
  onStep?: (data: unknown) => void;
  onLog?: (data: unknown) => void;
  onStatus?: (data: unknown) => void;
  onComplete?: (data: unknown) => void;
  onError?: (data: unknown) => void;
}

/**
 * Safely parse a MessageEvent's data, returning `null` on failure.
 */
function safeParseEventData(e: MessageEvent<string>): unknown {
  try {
    return JSON.parse(e.data);
  } catch (err: unknown) {
    console.warn('[SSE] Failed to parse event data:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export function connectSSE(taskId: string, callbacks: SSECallbacks): EventSource {
  const url = `${API_BASE}/api/stream/tasks/${taskId}`;
  const es = new EventSource(url);

  es.addEventListener('step', (e) => {
    const data = safeParseEventData(e as MessageEvent<string>);
    if (data !== null) callbacks.onStep?.(data);
  });
  es.addEventListener('log', (e) => {
    const data = safeParseEventData(e as MessageEvent<string>);
    if (data !== null) callbacks.onLog?.(data);
  });
  es.addEventListener('status', (e) => {
    const data = safeParseEventData(e as MessageEvent<string>);
    if (data !== null) callbacks.onStatus?.(data);
  });
  es.addEventListener('complete', (e) => {
    const data = safeParseEventData(e as MessageEvent<string>);
    if (data !== null) callbacks.onComplete?.(data);
  });
  es.addEventListener('error', (e) => callbacks.onError?.(e));

  es.onerror = () => {
    console.warn('[SSE] Connection error, EventSource will auto-reconnect');
  };

  return es;
}
