const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface SSECallbacks {
  onStep?: (data: unknown) => void;
  onLog?: (data: unknown) => void;
  onStatus?: (data: unknown) => void;
  onComplete?: (data: unknown) => void;
  onError?: (data: unknown) => void;
}

export function connectSSE(taskId: string, callbacks: SSECallbacks): EventSource {
  const url = `${API_BASE}/api/stream/tasks/${taskId}`;
  const es = new EventSource(url);

  es.addEventListener('step', (e) => callbacks.onStep?.(JSON.parse((e as MessageEvent).data)));
  es.addEventListener('log', (e) => callbacks.onLog?.(JSON.parse((e as MessageEvent).data)));
  es.addEventListener('status', (e) => callbacks.onStatus?.(JSON.parse((e as MessageEvent).data)));
  es.addEventListener('complete', (e) => callbacks.onComplete?.(JSON.parse((e as MessageEvent).data)));
  es.addEventListener('error', (e) => callbacks.onError?.(e));

  es.onerror = () => {
    // Auto-reconnect is built into EventSource
  };

  return es;
}
