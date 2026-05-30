/**
 * LLM Retry Mechanism with Exponential Backoff
 *
 * Provides transparent retry logic for LLM API calls that fail due to
 * transient errors (5xx, rate limits, network errors, timeouts).
 *
 * Non-retryable errors (4xx except 429) are thrown immediately.
 */

/**
 * Custom error class for LLM API failures.
 * Carries the HTTP status code so retry logic can classify the error.
 */
export class LLMError extends Error {
  constructor(
    message: string,
    /** HTTP status code. 0 for network/timeout errors without an HTTP response. */
    public readonly statusCode: number,
    /** Whether this error is retryable based on its status code. */
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * Configuration for the retry mechanism.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (not counting the initial call). @default 3 */
  maxRetries: number;
  /** Base delay in milliseconds before the first retry. @default 1000 */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds. @default 30000 */
  maxDelayMs: number;
  /** Per-attempt timeout in milliseconds. @default 30000 */
  timeoutMs: number;
  /** HTTP status codes that should trigger a retry. @default [429, 500, 502, 503, 504] */
  retryableStatusCodes: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  timeoutMs: 30000,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

/**
 * Sleep for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determine whether an error is retryable.
 *
 * - LLMError: check statusCode against the config's retryableStatusCodes
 * - AbortError / timeout: retryable (treated as transient)
 * - Network errors (TypeError in fetch): retryable
 * - Everything else: not retryable
 */
function isRetryableError(err: unknown, config: RetryConfig): boolean {
  if (err instanceof LLMError) {
    return err.retryable;
  }

  // AbortError from AbortSignal.timeout or manual abort
  if (err instanceof DOMException && err.name === 'AbortError') {
    return true;
  }

  // Network-level failures from fetch (e.g., DNS resolution, connection refused)
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return true;
  }

  return false;
}

/**
 * Wrap an async function with retry logic using exponential backoff and jitter.
 *
 * On each retryable failure, waits `min(baseDelay * 2^attempt, maxDelay)`
 * plus a random jitter of up to 10% of the computed delay, then retries.
 *
 * Non-retryable errors (4xx except 429) are re-thrown immediately.
 * After all retries are exhausted, the last error is re-thrown.
 *
 * @param fn The async function to wrap.
 * @param config Optional partial retry configuration overrides.
 * @returns The result of `fn()`.
 * @throws The last error from `fn()` if all retries are exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>,
): Promise<T> {
  const cfg: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      // Apply per-attempt timeout with proper cleanup
      const result = await new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new LLMError(`LLM call timed out after ${cfg.timeoutMs}ms`, 0, true)),
          cfg.timeoutMs,
        );
        // Allow the timer to not keep the process alive
        if (typeof timer === 'object' && 'unref' in timer) {
          timer.unref();
        }

        fn().then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (err) => {
            clearTimeout(timer);
            reject(err);
          },
        );
      });
      return result;
    } catch (err: unknown) {
      // Not retryable — throw immediately
      if (!isRetryableError(err, cfg)) {
        throw err;
      }

      // Last attempt — re-throw
      if (attempt >= cfg.maxRetries) {
        throw err;
      }

      // Wait with exponential backoff + jitter
      const delay = computeDelay(attempt, cfg);
      await sleep(delay);
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error('withRetry: unexpected fall-through');
}

/**
 * Compute delay for a given attempt using exponential backoff + jitter.
 *
 * delay = min(baseDelay * 2^attempt, maxDelay) + random(0, baseDelay * 2^attempt * 0.1)
 */
function computeDelay(attempt: number, config: RetryConfig): number {
  const exponential = config.baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, config.maxDelayMs);
  const jitter = Math.random() * capped * 0.1;
  return capped + jitter;
}

/**
 * Create an LLMError from a fetch Response.
 */
export function createLLMErrorFromResponse(status: number, statusText: string, body: string): LLMError {
  const retryable = DEFAULT_RETRY_CONFIG.retryableStatusCodes.includes(status);
  const message = `LLM API error: ${status} ${statusText}${body ? ` - ${body}` : ''}`;
  return new LLMError(message, status, retryable);
}
