export enum ErrorDomain {
  LLM = 'LLM',
  MCP = 'MCP',
  APP = 'APP',
  SYS = 'SYS',
}

export interface EataError {
  code: string;        // e.g., 'EATA-LLM-001'
  domain: ErrorDomain;
  message: string;
  cause?: unknown;
  retryable: boolean;
}

// Pre-defined error codes
export const ErrorCodes = {
  // LLM errors (001-099)
  LLM_TIMEOUT: { code: 'EATA-LLM-001', domain: ErrorDomain.LLM, retryable: true },
  LLM_RATE_LIMIT: { code: 'EATA-LLM-002', domain: ErrorDomain.LLM, retryable: true },
  LLM_CONTEXT_EXCEEDED: { code: 'EATA-LLM-003', domain: ErrorDomain.LLM, retryable: false },
  LLM_AUTH_FAILED: { code: 'EATA-LLM-004', domain: ErrorDomain.LLM, retryable: false },
  LLM_SERVER_ERROR: { code: 'EATA-LLM-005', domain: ErrorDomain.LLM, retryable: true },

  // MCP errors (100-199)
  MCP_ELECTRON_NOT_STARTED: { code: 'EATA-MCP-100', domain: ErrorDomain.MCP, retryable: false },
  MCP_CDP_DISCONNECTED: { code: 'EATA-MCP-101', domain: ErrorDomain.MCP, retryable: false },
  MCP_BRIDGE_TIMEOUT: { code: 'EATA-MCP-102', domain: ErrorDomain.MCP, retryable: true },
  MCP_TOOL_NOT_FOUND: { code: 'EATA-MCP-103', domain: ErrorDomain.MCP, retryable: false },

  // App errors (200-299)
  APP_ASSERTION_FAILED: { code: 'EATA-APP-200', domain: ErrorDomain.APP, retryable: false },
  APP_GOAL_NOT_ACHIEVED: { code: 'EATA-APP-201', domain: ErrorDomain.APP, retryable: false },
  APP_STATE_DRIFT: { code: 'EATA-APP-202', domain: ErrorDomain.APP, retryable: true },

  // System errors (300-399)
  SYS_DISK_FULL: { code: 'EATA-SYS-300', domain: ErrorDomain.SYS, retryable: false },
  SYS_CONFIG_MISSING: { code: 'EATA-SYS-301', domain: ErrorDomain.SYS, retryable: false },
} as const;

export type ErrorCodeKey = keyof typeof ErrorCodes;
