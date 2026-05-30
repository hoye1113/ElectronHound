import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, LLMError, createLLMErrorFromResponse } from '../llm/retry.js';

describe('withRetry', () => {
  // Use real timers by default; individual tests opt into fake timers as needed.

  it('returns result on first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1, timeoutMs: 5000 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 and succeeds on 3rd attempt', async () => {
    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt < 3) {
        throw new LLMError('Server Error', 500, true);
      }
      return 'success';
    });

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
      maxDelayMs: 10,
      timeoutMs: 5000,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on 400 (non-retryable client error)', async () => {
    const fn = vi.fn().mockRejectedValue(new LLMError('Bad Request', 400, false));

    await expect(
      withRetry(fn, { maxRetries: 3, baseDelayMs: 1, timeoutMs: 5000 }),
    ).rejects.toThrow('Bad Request');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 (rate limit) with backoff', async () => {
    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt < 3) {
        throw new LLMError('Rate Limited', 429, true);
      }
      return 'success';
    });

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
      maxDelayMs: 10,
      timeoutMs: 5000,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after max retries are exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new LLMError('Server Error', 503, true));

    await expect(
      withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 10,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow('Server Error');

    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('retries on network TypeError', async () => {
    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt < 2) {
        throw new TypeError('fetch failed');
      }
      return 'success';
    });

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
      timeoutMs: 5000,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 502 and 504', async () => {
    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt === 1) throw new LLMError('Bad Gateway', 502, true);
      if (attempt === 2) throw new LLMError('Gateway Timeout', 504, true);
      return 'success';
    });

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
      maxDelayMs: 10,
      timeoutMs: 5000,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry on generic Error (non-retryable)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('JSON parse error'));

    await expect(
      withRetry(fn, { maxRetries: 3, baseDelayMs: 1, timeoutMs: 5000 }),
    ).rejects.toThrow('JSON parse error');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('applies exponential backoff delays', async () => {
    vi.useFakeTimers();

    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt <= 3) {
        throw new LLMError('Server Error', 500, true);
      }
      return 'success';
    });

    const resultPromise = withRetry(fn, {
      maxRetries: 4,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      timeoutMs: 10000,
    });

    // Advance through retry delays: ~1000ms, ~2000ms, ~4000ms
    await vi.advanceTimersByTimeAsync(10000);
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(4);

    vi.useRealTimers();
  });
});

describe('LLMError', () => {
  it('carries statusCode and retryable flag', () => {
    const err = new LLMError('test', 503, true);
    expect(err.name).toBe('LLMError');
    expect(err.message).toBe('test');
    expect(err.statusCode).toBe(503);
    expect(err.retryable).toBe(true);
  });

  it('marks 4xx as non-retryable', () => {
    const err = new LLMError('bad request', 400, false);
    expect(err.retryable).toBe(false);
  });
});

describe('createLLMErrorFromResponse', () => {
  it('creates retryable error for 500', () => {
    const err = createLLMErrorFromResponse(500, 'Internal Server Error', 'oops');
    expect(err.statusCode).toBe(500);
    expect(err.retryable).toBe(true);
    expect(err.message).toContain('500');
    expect(err.message).toContain('oops');
  });

  it('creates retryable error for 429', () => {
    const err = createLLMErrorFromResponse(429, 'Too Many Requests', '');
    expect(err.statusCode).toBe(429);
    expect(err.retryable).toBe(true);
  });

  it('creates non-retryable error for 400', () => {
    const err = createLLMErrorFromResponse(400, 'Bad Request', 'invalid');
    expect(err.statusCode).toBe(400);
    expect(err.retryable).toBe(false);
  });
});
