/**
 * Structured Error System for ElectronHound
 *
 * Provides error codes, solution links, and context information
 * to help developers quickly diagnose and fix issues.
 */

// ─── Error Codes ──────────────────────────────────────────────────────

export enum ErrorCode {
  // Configuration errors (E1xxx)
  CONFIG_NOT_FOUND = 'E1001',
  CONFIG_INVALID = 'E1002',
  CONFIG_PARSE_ERROR = 'E1003',
  CONFIG_WRITE_ERROR = 'E1004',
  CONFIG_VALIDATION_FAILED = 'E1005',

  // Provider errors (E2xxx)
  PROVIDER_NOT_FOUND = 'E2001',
  PROVIDER_API_KEY_MISSING = 'E2002',
  PROVIDER_CONNECTION_FAILED = 'E2003',
  PROVIDER_RATE_LIMITED = 'E2004',
  PROVIDER_INVALID_RESPONSE = 'E2005',
  PROVIDER_QUOTA_EXCEEDED = 'E2006',

  // Task errors (E3xxx)
  TASK_VALIDATION_FAILED = 'E3001',
  TASK_NOT_FOUND = 'E3002',
  TASK_CANCELLED = 'E3003',
  TASK_TIMEOUT = 'E3004',
  TASK_EXECUTION_FAILED = 'E3005',
  TASK_MAX_STEPS_EXCEEDED = 'E3006',

  // Agent errors (E4xxx)
  AGENT_GUARD_FAILED = 'E4001',
  AGENT_GRAPH_ERROR = 'E4002',
  AGENT_STATE_ERROR = 'E4003',
  AGENT_LLM_ERROR = 'E4004',

  // MCP errors (E5xxx)
  MCP_CONNECTION_FAILED = 'E5001',
  MCP_TOOL_CALL_FAILED = 'E5002',
  MCP_SERVER_NOT_FOUND = 'E5003',
  MCP_TIMEOUT = 'E5004',

  // System errors (E6xxx)
  SYSTEM_FILE_NOT_FOUND = 'E6001',
  SYSTEM_PERMISSION_DENIED = 'E6002',
  SYSTEM_DISK_FULL = 'E6003',
  SYSTEM_NETWORK_ERROR = 'E6004',
  SYSTEM_DATABASE_ERROR = 'E6005',

  // CLI errors (E7xxx)
  CLI_INVALID_ARGS = 'E7001',
  CLI_MISSING_REQUIRED_ARG = 'E7002',
  CLI_UNKNOWN_COMMAND = 'E7003',
  CLI_HELP_REQUESTED = 'E7004',
}

// ─── Error Metadata ───────────────────────────────────────────────────

export interface ErrorMetadata {
  code: ErrorCode;
  message: string;
  solution?: string;
  docsUrl?: string;
  context?: Record<string, unknown>;
  recoverable?: boolean;
  retryable?: boolean;
}

const ERROR_SOLUTIONS: Record<ErrorCode, { solution: string; docsUrl?: string }> = {
  [ErrorCode.CONFIG_NOT_FOUND]: {
    solution: 'Run "eata config init" to create a default configuration file.',
    docsUrl: 'https://github.com/hoye-git/ElectronHound/blob/master/docs/configuration.md',
  },
  [ErrorCode.CONFIG_INVALID]: {
    solution: 'Check the configuration file format. Run "eata config validate" to see specific issues.',
    docsUrl: 'https://github.com/hoye-git/ElectronHound/blob/master/docs/configuration.md',
  },
  [ErrorCode.CONFIG_PARSE_ERROR]: {
    solution: 'Ensure the configuration file is valid JSON. Run "eata config validate" for details.',
  },
  [ErrorCode.CONFIG_WRITE_ERROR]: {
    solution: 'Check file permissions and disk space in the config directory (~/.eata/).',
  },
  [ErrorCode.CONFIG_VALIDATION_FAILED]: {
    solution: 'Review the validation errors and fix the configuration values.',
  },

  [ErrorCode.PROVIDER_NOT_FOUND]: {
    solution: 'Run "eata provider list" to see available providers, or "eata provider add" to add one.',
    docsUrl: 'https://github.com/hoye-git/ElectronHound/blob/master/docs/providers.md',
  },
  [ErrorCode.PROVIDER_API_KEY_MISSING]: {
    solution: 'Set the API key via "eata provider set-key <provider-id>" or set the OPENAI_API_KEY environment variable.',
    docsUrl: 'https://github.com/hoye-git/ElectronHound/blob/master/docs/providers.md#api-keys',
  },
  [ErrorCode.PROVIDER_CONNECTION_FAILED]: {
    solution: 'Check your internet connection and verify the provider base URL is correct.',
  },
  [ErrorCode.PROVIDER_RATE_LIMITED]: {
    solution: 'Wait a moment and retry. Consider upgrading your API plan or using a different provider.',
    retryable: true,
  } as { solution: string; docsUrl?: string; retryable?: boolean },
  [ErrorCode.PROVIDER_INVALID_RESPONSE]: {
    solution: 'The LLM returned an unexpected response. Try again or switch to a different model.',
    retryable: true,
  } as { solution: string; docsUrl?: string; retryable?: boolean },
  [ErrorCode.PROVIDER_QUOTA_EXCEEDED]: {
    solution: 'API quota exceeded. Check your billing or switch to a different provider.',
  },

  [ErrorCode.TASK_VALIDATION_FAILED]: {
    solution: 'Check the task parameters. Run "eata task create --help" for valid options.',
  },
  [ErrorCode.TASK_NOT_FOUND]: {
    solution: 'Verify the task ID. Run "eata task list" to see available tasks.',
  },
  [ErrorCode.TASK_CANCELLED]: {
    solution: 'The task was cancelled. Run "eata task create" to start a new one.',
  },
  [ErrorCode.TASK_TIMEOUT]: {
    solution: 'The task timed out. Increase maxSteps or check if the target app is responsive.',
  },
  [ErrorCode.TASK_EXECUTION_FAILED]: {
    solution: 'Check the task logs for details. Run "eata task logs <task-id>" for more information.',
  },
  [ErrorCode.TASK_MAX_STEPS_EXCEEDED]: {
    solution: 'The task exceeded the maximum number of steps. Increase maxSteps or simplify the goal.',
  },

  [ErrorCode.AGENT_GUARD_FAILED]: {
    solution: 'The LLM output failed validation. This is usually a model issue - try again or use a different model.',
    retryable: true,
  } as { solution: string; docsUrl?: string; retryable?: boolean },
  [ErrorCode.AGENT_GRAPH_ERROR]: {
    solution: 'An error occurred in the agent graph. Check the logs for details.',
  },
  [ErrorCode.AGENT_STATE_ERROR]: {
    solution: 'The agent state is corrupted. Try restarting the task.',
  },
  [ErrorCode.AGENT_LLM_ERROR]: {
    solution: 'Failed to communicate with the LLM. Check your API key and provider configuration.',
  },

  [ErrorCode.MCP_CONNECTION_FAILED]: {
    solution: 'Failed to connect to the MCP server. Ensure the server is running and accessible.',
  },
  [ErrorCode.MCP_TOOL_CALL_FAILED]: {
    solution: 'The MCP tool call failed. Check the tool parameters and server logs.',
  },
  [ErrorCode.MCP_SERVER_NOT_FOUND]: {
    solution: 'The MCP server is not configured. Run "eata mcp setup" to configure it.',
  },
  [ErrorCode.MCP_TIMEOUT]: {
    solution: 'The MCP server did not respond in time. Check if the server is running.',
    retryable: true,
  } as { solution: string; docsUrl?: string; retryable?: boolean },

  [ErrorCode.SYSTEM_FILE_NOT_FOUND]: {
    solution: 'Check that the file path is correct and the file exists.',
  },
  [ErrorCode.SYSTEM_PERMISSION_DENIED]: {
    solution: 'Check file permissions. You may need to run with elevated privileges.',
  },
  [ErrorCode.SYSTEM_DISK_FULL]: {
    solution: 'Free up disk space and try again.',
  },
  [ErrorCode.SYSTEM_NETWORK_ERROR]: {
    solution: 'Check your internet connection and try again.',
    retryable: true,
  } as { solution: string; docsUrl?: string; retryable?: boolean },
  [ErrorCode.SYSTEM_DATABASE_ERROR]: {
    solution: 'Database error occurred. Try running "eata db repair" to fix the database.',
  },

  [ErrorCode.CLI_INVALID_ARGS]: {
    solution: 'Run the command with --help to see valid arguments.',
  },
  [ErrorCode.CLI_MISSING_REQUIRED_ARG]: {
    solution: 'A required argument is missing. Run the command with --help for usage.',
  },
  [ErrorCode.CLI_UNKNOWN_COMMAND]: {
    solution: 'Run "eata --help" to see available commands.',
  },
  [ErrorCode.CLI_HELP_REQUESTED]: {
    solution: 'Displaying help information.',
  },
};

// ─── Structured Error Class ───────────────────────────────────────────

export class EataError extends Error {
  public readonly code: ErrorCode;
  public readonly solution?: string;
  public readonly docsUrl?: string;
  public readonly context?: Record<string, unknown>;
  public readonly recoverable: boolean;
  public readonly retryable: boolean;
  public readonly timestamp: Date;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      cause?: Error;
      context?: Record<string, unknown>;
      solution?: string;
      docsUrl?: string;
    },
  ) {
    const meta = ERROR_SOLUTIONS[code];
    super(message, { cause: options?.cause });

    this.name = 'EataError';
    this.code = code;
    this.solution = options?.solution ?? meta?.solution;
    this.docsUrl = options?.docsUrl ?? meta?.docsUrl;
    this.context = options?.context;
    this.recoverable = meta?.solution?.includes('retry') ?? false;
    this.retryable = (meta as { retryable?: boolean })?.retryable ?? false;
    this.timestamp = new Date();
  }

  /**
   * Format the error for display to the user.
   */
  format(): string {
    const lines: string[] = [];

    // Error header
    lines.push(`\n${'='.repeat(60)}`);
    lines.push(`Error [${this.code}]: ${this.message}`);
    lines.push('='.repeat(60));

    // Context information
    if (this.context && Object.keys(this.context).length > 0) {
      lines.push('\nContext:');
      for (const [key, value] of Object.entries(this.context)) {
        lines.push(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
      }
    }

    // Solution
    if (this.solution) {
      lines.push(`\nSolution: ${this.solution}`);
    }

    // Documentation link
    if (this.docsUrl) {
      lines.push(`\nDocumentation: ${this.docsUrl}`);
    }

    // Retry hint
    if (this.retryable) {
      lines.push('\nThis error may be temporary. You can retry the operation.');
    }

    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  /**
   * Convert to JSON for logging/serialization.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      solution: this.solution,
      docsUrl: this.docsUrl,
      context: this.context,
      recoverable: this.recoverable,
      retryable: this.retryable,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

// ─── Error Factory Functions ──────────────────────────────────────────

export function createConfigError(
  code: ErrorCode,
  message: string,
  context?: Record<string, unknown>,
  cause?: Error,
): EataError {
  return new EataError(code, message, { context, cause });
}

export function createProviderError(
  code: ErrorCode,
  message: string,
  providerId?: string,
  cause?: Error,
): EataError {
  return new EataError(code, message, {
    context: providerId ? { providerId } : undefined,
    cause,
  });
}

export function createTaskError(
  code: ErrorCode,
  message: string,
  taskId?: string,
  cause?: Error,
): EataError {
  return new EataError(code, message, {
    context: taskId ? { taskId } : undefined,
    cause,
  });
}

export function createAgentError(
  code: ErrorCode,
  message: string,
  phase?: string,
  cause?: Error,
): EataError {
  return new EataError(code, message, {
    context: phase ? { phase } : undefined,
    cause,
  });
}

export function createMCPError(
  code: ErrorCode,
  message: string,
  serverId?: string,
  cause?: Error,
): EataError {
  return new EataError(code, message, {
    context: serverId ? { serverId } : undefined,
    cause,
  });
}

export function createSystemError(
  code: ErrorCode,
  message: string,
  path?: string,
  cause?: Error,
): EataError {
  return new EataError(code, message, {
    context: path ? { path } : undefined,
    cause,
  });
}

export function createCLIError(
  code: ErrorCode,
  message: string,
  command?: string,
  cause?: Error,
): EataError {
  return new EataError(code, message, {
    context: command ? { command } : undefined,
    cause,
  });
}

// ─── Error Utilities ──────────────────────────────────────────────────

/**
 * Check if an error is an EataError.
 */
export function isEataError(error: unknown): error is EataError {
  return error instanceof EataError;
}

/**
 * Wrap an unknown error into an EataError.
 */
export function wrapError(
  error: unknown,
  code: ErrorCode,
  message?: string,
): EataError {
  if (isEataError(error)) return error;

  const cause = error instanceof Error ? error : new Error(String(error));
  return new EataError(code, message ?? cause.message, { cause });
}

/**
 * Format any error for display.
 */
export function formatError(error: unknown): string {
  if (isEataError(error)) {
    return error.format();
  }

  if (error instanceof Error) {
    return `\nError: ${error.message}\n`;
  }

  return `\nError: ${String(error)}\n`;
}
