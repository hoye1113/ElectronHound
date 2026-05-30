import { ErrorCodes, ErrorDomain, type EataError } from '@eata/shared-types';

interface HttpErrorLike {
  status?: number;
  statusCode?: number;
}

interface TimeoutErrorLike {
  name?: string;
  code?: string;
}

/**
 * Classify an unknown error into a structured EataError.
 *
 * Classification rules:
 * - HTTP 429 → LLM_RATE_LIMIT
 * - HTTP 500+ → LLM_SERVER_ERROR
 * - HTTP 401/403 → LLM_AUTH_FAILED
 * - Timeout / ETIMEDOUT → LLM_TIMEOUT
 * - "context" + "exceeded/length" → LLM_CONTEXT_EXCEEDED
 * - Default → APP_ASSERTION_FAILED
 */
export function classifyError(err: unknown): EataError {
  const message = extractMessage(err);
  const statusCode = extractStatusCode(err);

  // HTTP status-based classification
  if (statusCode === 429) {
    return {
      ...ErrorCodes.LLM_RATE_LIMIT,
      message,
      cause: err,
    };
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      ...ErrorCodes.LLM_AUTH_FAILED,
      message,
      cause: err,
    };
  }

  if (statusCode !== undefined && statusCode >= 500) {
    return {
      ...ErrorCodes.LLM_SERVER_ERROR,
      message,
      cause: err,
    };
  }

  // Timeout detection
  if (isTimeout(err, message)) {
    return {
      ...ErrorCodes.LLM_TIMEOUT,
      message,
      cause: err,
    };
  }

  // Context length exceeded
  if (/context.*(exceed|length|too long|token.*limit)/i.test(message)) {
    return {
      ...ErrorCodes.LLM_CONTEXT_EXCEEDED,
      message,
      cause: err,
    };
  }

  // Default fallback
  return {
    ...ErrorCodes.APP_ASSERTION_FAILED,
    message,
    cause: err,
  };
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

function extractStatusCode(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const obj = err as HttpErrorLike;
    return obj.status ?? obj.statusCode;
  }
  return undefined;
}

function isTimeout(err: unknown, message: string): boolean {
  if (err && typeof err === 'object') {
    const obj = err as TimeoutErrorLike;
    if (obj.name === 'TimeoutError' || obj.code === 'ETIMEDOUT' || obj.code === 'UND_ERR_HEADERS_TIMEOUT') {
      return true;
    }
  }
  return /timeout|timed?\s*out/i.test(message);
}
