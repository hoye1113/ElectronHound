import { describe, it, expect } from 'vitest';
import { classifyError } from '../classifier.js';
import { ErrorDomain } from '@eata/shared-types';

describe('classifyError', () => {
  it('maps HTTP 429 to LLM_RATE_LIMIT', () => {
    const err = Object.assign(new Error('Too Many Requests'), { status: 429 });
    const result = classifyError(err);

    expect(result.code).toBe('EATA-LLM-002');
    expect(result.domain).toBe(ErrorDomain.LLM);
    expect(result.retryable).toBe(true);
    expect(result.message).toBe('Too Many Requests');
    expect(result.cause).toBe(err);
  });

  it('maps HTTP 500 to LLM_SERVER_ERROR', () => {
    const err = Object.assign(new Error('Internal Server Error'), { status: 500 });
    const result = classifyError(err);

    expect(result.code).toBe('EATA-LLM-005');
    expect(result.domain).toBe(ErrorDomain.LLM);
    expect(result.retryable).toBe(true);
    expect(result.cause).toBe(err);
  });

  it('maps HTTP 502 to LLM_SERVER_ERROR', () => {
    const err = Object.assign(new Error('Bad Gateway'), { statusCode: 502 });
    const result = classifyError(err);

    expect(result.code).toBe('EATA-LLM-005');
    expect(result.retryable).toBe(true);
  });

  it('maps HTTP 401 to LLM_AUTH_FAILED', () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    const result = classifyError(err);

    expect(result.code).toBe('EATA-LLM-004');
    expect(result.retryable).toBe(false);
  });

  it('maps HTTP 403 to LLM_AUTH_FAILED', () => {
    const err = Object.assign(new Error('Forbidden'), { status: 403 });
    const result = classifyError(err);

    expect(result.code).toBe('EATA-LLM-004');
    expect(result.retryable).toBe(false);
  });

  it('maps timeout error to LLM_TIMEOUT', () => {
    const err = Object.assign(new Error('Request timed out'), { code: 'ETIMEDOUT' });
    const result = classifyError(err);

    expect(result.code).toBe('EATA-LLM-001');
    expect(result.domain).toBe(ErrorDomain.LLM);
    expect(result.retryable).toBe(true);
  });

  it('maps TimeoutError name to LLM_TIMEOUT', () => {
    const err = Object.assign(new Error('Connection timeout'), { name: 'TimeoutError' });
    const result = classifyError(err);

    expect(result.code).toBe('EATA-LLM-001');
    expect(result.retryable).toBe(true);
  });

  it('maps timeout in message to LLM_TIMEOUT', () => {
    const err = new Error('The operation has timed out');
    const result = classifyError(err);

    expect(result.code).toBe('EATA-LLM-001');
    expect(result.retryable).toBe(true);
  });

  it('maps context exceeded to LLM_CONTEXT_EXCEEDED', () => {
    const err = new Error('context length exceeded maximum of 4096 tokens');
    const result = classifyError(err);

    expect(result.code).toBe('EATA-LLM-003');
    expect(result.domain).toBe(ErrorDomain.LLM);
    expect(result.retryable).toBe(false);
  });

  it('maps generic error to APP_ASSERTION_FAILED', () => {
    const err = new Error('Something went wrong');
    const result = classifyError(err);

    expect(result.code).toBe('EATA-APP-200');
    expect(result.domain).toBe(ErrorDomain.APP);
    expect(result.retryable).toBe(false);
    expect(result.message).toBe('Something went wrong');
    expect(result.cause).toBe(err);
  });

  it('handles string errors', () => {
    const result = classifyError('plain string error');

    expect(result.code).toBe('EATA-APP-200');
    expect(result.message).toBe('plain string error');
  });

  it('handles non-Error objects with message', () => {
    const result = classifyError({ message: 'object error' });

    expect(result.code).toBe('EATA-APP-200');
    expect(result.message).toBe('object error');
  });
});
