import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  EataError,
  isEataError,
  wrapError,
  formatError,
  createConfigError,
  createProviderError,
  createTaskError,
  createAgentError,
  createMCPError,
  createSystemError,
  createCLIError,
} from '../errors.js';

describe('Error System', () => {
  describe('ErrorCode', () => {
    it('should have all error codes defined', () => {
      expect(ErrorCode.CONFIG_NOT_FOUND).toBe('E1001');
      expect(ErrorCode.PROVIDER_NOT_FOUND).toBe('E2001');
      expect(ErrorCode.TASK_VALIDATION_FAILED).toBe('E3001');
      expect(ErrorCode.AGENT_GUARD_FAILED).toBe('E4001');
      expect(ErrorCode.MCP_CONNECTION_FAILED).toBe('E5001');
      expect(ErrorCode.SYSTEM_FILE_NOT_FOUND).toBe('E6001');
      expect(ErrorCode.CLI_INVALID_ARGS).toBe('E7001');
    });
  });

  describe('EataError', () => {
    it('should create error with code and message', () => {
      const error = new EataError(ErrorCode.CONFIG_NOT_FOUND, 'Config file not found');
      expect(error.code).toBe(ErrorCode.CONFIG_NOT_FOUND);
      expect(error.message).toBe('Config file not found');
      expect(error.name).toBe('EataError');
    });

    it('should include solution from metadata', () => {
      const error = new EataError(ErrorCode.CONFIG_NOT_FOUND, 'Config not found');
      expect(error.solution).toContain('eata config init');
    });

    it('should include docs URL from metadata', () => {
      const error = new EataError(ErrorCode.CONFIG_NOT_FOUND, 'Config not found');
      expect(error.docsUrl).toContain('github.com');
    });

    it('should allow custom solution', () => {
      const error = new EataError(ErrorCode.CONFIG_NOT_FOUND, 'Custom message', {
        solution: 'Custom solution',
      });
      expect(error.solution).toBe('Custom solution');
    });

    it('should include context', () => {
      const error = new EataError(ErrorCode.CONFIG_NOT_FOUND, 'Message', {
        context: { path: '/test/path' },
      });
      expect(error.context).toEqual({ path: '/test/path' });
    });

    it('should format error for display', () => {
      const error = new EataError(ErrorCode.CONFIG_NOT_FOUND, 'Config not found');
      const formatted = error.format();
      expect(formatted).toContain('Error [E1001]');
      expect(formatted).toContain('Config not found');
      expect(formatted).toContain('Solution:');
    });

    it('should convert to JSON', () => {
      const error = new EataError(ErrorCode.CONFIG_NOT_FOUND, 'Config not found');
      const json = error.toJSON();
      expect(json.code).toBe('E1001');
      expect(json.message).toBe('Config not found');
      expect(json.name).toBe('EataError');
    });

    it('should set retryable flag for retryable errors', () => {
      const error = new EataError(ErrorCode.PROVIDER_RATE_LIMITED, 'Rate limited');
      expect(error.retryable).toBe(true);
    });
  });

  describe('isEataError', () => {
    it('should return true for EataError instances', () => {
      const error = new EataError(ErrorCode.CONFIG_NOT_FOUND, 'Test');
      expect(isEataError(error)).toBe(true);
    });

    it('should return false for regular errors', () => {
      const error = new Error('Regular error');
      expect(isEataError(error)).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isEataError('string')).toBe(false);
      expect(isEataError(null)).toBe(false);
      expect(isEataError(undefined)).toBe(false);
    });
  });

  describe('wrapError', () => {
    it('should return EataError as-is', () => {
      const original = new EataError(ErrorCode.CONFIG_NOT_FOUND, 'Original');
      const wrapped = wrapError(original, ErrorCode.TASK_VALIDATION_FAILED);
      expect(wrapped).toBe(original);
    });

    it('should wrap regular Error', () => {
      const original = new Error('Regular error');
      const wrapped = wrapError(original, ErrorCode.TASK_VALIDATION_FAILED);
      expect(isEataError(wrapped)).toBe(true);
      expect(wrapped.code).toBe(ErrorCode.TASK_VALIDATION_FAILED);
      expect(wrapped.cause).toBe(original);
    });

    it('should wrap non-Error values', () => {
      const wrapped = wrapError('string error', ErrorCode.TASK_VALIDATION_FAILED);
      expect(isEataError(wrapped)).toBe(true);
      expect(wrapped.message).toBe('string error');
    });
  });

  describe('formatError', () => {
    it('should format EataError', () => {
      const error = new EataError(ErrorCode.CONFIG_NOT_FOUND, 'Test');
      const formatted = formatError(error);
      expect(formatted).toContain('Error [E1001]');
    });

    it('should format regular Error', () => {
      const error = new Error('Regular error');
      const formatted = formatError(error);
      expect(formatted).toContain('Error: Regular error');
    });

    it('should format non-Error values', () => {
      const formatted = formatError('string error');
      expect(formatted).toContain('Error: string error');
    });
  });

  describe('Error Factory Functions', () => {
    it('should create config error', () => {
      const error = createConfigError(ErrorCode.CONFIG_NOT_FOUND, 'Test', { path: '/test' });
      expect(error.code).toBe(ErrorCode.CONFIG_NOT_FOUND);
      expect(error.context).toEqual({ path: '/test' });
    });

    it('should create provider error', () => {
      const error = createProviderError(ErrorCode.PROVIDER_NOT_FOUND, 'Test', 'openai');
      expect(error.code).toBe(ErrorCode.PROVIDER_NOT_FOUND);
      expect(error.context).toEqual({ providerId: 'openai' });
    });

    it('should create task error', () => {
      const error = createTaskError(ErrorCode.TASK_NOT_FOUND, 'Test', 'task-123');
      expect(error.code).toBe(ErrorCode.TASK_NOT_FOUND);
      expect(error.context).toEqual({ taskId: 'task-123' });
    });

    it('should create agent error', () => {
      const error = createAgentError(ErrorCode.AGENT_GUARD_FAILED, 'Test', 'observe');
      expect(error.code).toBe(ErrorCode.AGENT_GUARD_FAILED);
      expect(error.context).toEqual({ phase: 'observe' });
    });

    it('should create MCP error', () => {
      const error = createMCPError(ErrorCode.MCP_CONNECTION_FAILED, 'Test', 'server-1');
      expect(error.code).toBe(ErrorCode.MCP_CONNECTION_FAILED);
      expect(error.context).toEqual({ serverId: 'server-1' });
    });

    it('should create system error', () => {
      const error = createSystemError(ErrorCode.SYSTEM_FILE_NOT_FOUND, 'Test', '/path');
      expect(error.code).toBe(ErrorCode.SYSTEM_FILE_NOT_FOUND);
      expect(error.context).toEqual({ path: '/path' });
    });

    it('should create CLI error', () => {
      const error = createCLIError(ErrorCode.CLI_INVALID_ARGS, 'Test', 'run');
      expect(error.code).toBe(ErrorCode.CLI_INVALID_ARGS);
      expect(error.context).toEqual({ command: 'run' });
    });
  });
});
