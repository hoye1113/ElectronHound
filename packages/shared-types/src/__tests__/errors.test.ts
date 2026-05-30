import { describe, it, expect } from 'vitest';
import { ErrorDomain, ErrorCodes, type EataError } from '../errors.js';

describe('ErrorDomain', () => {
  it('has four domains', () => {
    expect(ErrorDomain.LLM).toBe('LLM');
    expect(ErrorDomain.MCP).toBe('MCP');
    expect(ErrorDomain.APP).toBe('APP');
    expect(ErrorDomain.SYS).toBe('SYS');
  });
});

describe('ErrorCodes', () => {
  it('LLM codes have correct domain and format', () => {
    expect(ErrorCodes.LLM_TIMEOUT.code).toBe('EATA-LLM-001');
    expect(ErrorCodes.LLM_TIMEOUT.domain).toBe(ErrorDomain.LLM);
    expect(ErrorCodes.LLM_TIMEOUT.retryable).toBe(true);

    expect(ErrorCodes.LLM_RATE_LIMIT.code).toBe('EATA-LLM-002');
    expect(ErrorCodes.LLM_RATE_LIMIT.retryable).toBe(true);

    expect(ErrorCodes.LLM_CONTEXT_EXCEEDED.code).toBe('EATA-LLM-003');
    expect(ErrorCodes.LLM_CONTEXT_EXCEEDED.retryable).toBe(false);

    expect(ErrorCodes.LLM_AUTH_FAILED.code).toBe('EATA-LLM-004');
    expect(ErrorCodes.LLM_AUTH_FAILED.retryable).toBe(false);

    expect(ErrorCodes.LLM_SERVER_ERROR.code).toBe('EATA-LLM-005');
    expect(ErrorCodes.LLM_SERVER_ERROR.retryable).toBe(true);
  });

  it('MCP codes have correct domain', () => {
    expect(ErrorCodes.MCP_ELECTRON_NOT_STARTED.code).toBe('EATA-MCP-100');
    expect(ErrorCodes.MCP_ELECTRON_NOT_STARTED.domain).toBe(ErrorDomain.MCP);

    expect(ErrorCodes.MCP_CDP_DISCONNECTED.code).toBe('EATA-MCP-101');
    expect(ErrorCodes.MCP_BRIDGE_TIMEOUT.code).toBe('EATA-MCP-102');
    expect(ErrorCodes.MCP_TOOL_NOT_FOUND.code).toBe('EATA-MCP-103');
  });

  it('APP codes have correct domain', () => {
    expect(ErrorCodes.APP_ASSERTION_FAILED.code).toBe('EATA-APP-200');
    expect(ErrorCodes.APP_ASSERTION_FAILED.domain).toBe(ErrorDomain.APP);

    expect(ErrorCodes.APP_GOAL_NOT_ACHIEVED.code).toBe('EATA-APP-201');
    expect(ErrorCodes.APP_STATE_DRIFT.code).toBe('EATA-APP-202');
    expect(ErrorCodes.APP_STATE_DRIFT.retryable).toBe(true);
  });

  it('SYS codes have correct domain', () => {
    expect(ErrorCodes.SYS_DISK_FULL.code).toBe('EATA-SYS-300');
    expect(ErrorCodes.SYS_DISK_FULL.domain).toBe(ErrorDomain.SYS);

    expect(ErrorCodes.SYS_CONFIG_MISSING.code).toBe('EATA-SYS-301');
    expect(ErrorCodes.SYS_CONFIG_MISSING.retryable).toBe(false);
  });

  it('all codes follow EATA-XXX-NNN format', () => {
    for (const entry of Object.values(ErrorCodes)) {
      expect(entry.code).toMatch(/^EATA-(LLM|MCP|APP|SYS)-\d{3}$/);
    }
  });

  it('EataError interface can be constructed from ErrorCodes', () => {
    const err: EataError = {
      ...ErrorCodes.LLM_TIMEOUT,
      message: 'Request timed out',
    };
    expect(err.code).toBe('EATA-LLM-001');
    expect(err.domain).toBe(ErrorDomain.LLM);
    expect(err.message).toBe('Request timed out');
    expect(err.retryable).toBe(true);
    expect(err.cause).toBeUndefined();
  });
});
