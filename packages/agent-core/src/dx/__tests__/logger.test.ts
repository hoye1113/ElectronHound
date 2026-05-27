import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LogLevel,
  Logger,
  getLogger,
  createLogger,
  parseLogLevel,
  getLogLevelName,
} from '../logger.js';

describe('Logger', () => {
  let mockDestination: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDestination = vi.fn();
  });

  describe('LogLevel', () => {
    it('should have correct numeric values', () => {
      expect(LogLevel.TRACE).toBe(0);
      expect(LogLevel.DEBUG).toBe(1);
      expect(LogLevel.INFO).toBe(2);
      expect(LogLevel.WARN).toBe(3);
      expect(LogLevel.ERROR).toBe(4);
      expect(LogLevel.FATAL).toBe(5);
      expect(LogLevel.SILENT).toBe(6);
    });
  });

  describe('Logger Class', () => {
    it('should create logger with default config', () => {
      const logger = new Logger({ destination: mockDestination });
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('should create logger with custom level', () => {
      const logger = new Logger({ level: LogLevel.DEBUG, destination: mockDestination });
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should log messages at or above configured level', () => {
      const logger = new Logger({ level: LogLevel.WARN, destination: mockDestination });
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(mockDestination).toHaveBeenCalledTimes(2);
    });

    it('should log trace messages', () => {
      const logger = new Logger({ level: LogLevel.TRACE, destination: mockDestination });
      logger.trace('Trace message');
      expect(mockDestination).toHaveBeenCalledTimes(1);
    });

    it('should log debug messages', () => {
      const logger = new Logger({ level: LogLevel.DEBUG, destination: mockDestination });
      logger.debug('Debug message');
      expect(mockDestination).toHaveBeenCalledTimes(1);
    });

    it('should log info messages', () => {
      const logger = new Logger({ level: LogLevel.INFO, destination: mockDestination });
      logger.info('Info message');
      expect(mockDestination).toHaveBeenCalledTimes(1);
    });

    it('should log warn messages', () => {
      const logger = new Logger({ level: LogLevel.WARN, destination: mockDestination });
      logger.warn('Warn message');
      expect(mockDestination).toHaveBeenCalledTimes(1);
    });

    it('should log error messages', () => {
      const logger = new Logger({ level: LogLevel.ERROR, destination: mockDestination });
      logger.error('Error message');
      expect(mockDestination).toHaveBeenCalledTimes(1);
    });

    it('should log fatal messages', () => {
      const logger = new Logger({ level: LogLevel.FATAL, destination: mockDestination });
      logger.fatal('Fatal message');
      expect(mockDestination).toHaveBeenCalledTimes(1);
    });

    it('should include context in log output', () => {
      const logger = new Logger({ destination: mockDestination });
      logger.info('Message', { key: 'value' });
      const output = mockDestination.mock.calls[0][0];
      expect(output).toContain('key=value');
    });

    it('should include error details', () => {
      const logger = new Logger({ destination: mockDestination });
      const error = new Error('Test error');
      logger.error('Error occurred', error);
      const output = mockDestination.mock.calls[0][0];
      expect(output).toContain('Test error');
    });

    it('should create child logger with additional context', () => {
      const logger = new Logger({ destination: mockDestination });
      const child = logger.child({ component: 'test' });
      child.info('Child message');
      const output = mockDestination.mock.calls[0][0];
      expect(output).toContain('component=test');
    });

    it('should set log level', () => {
      const logger = new Logger({ destination: mockDestination });
      logger.setLevel(LogLevel.DEBUG);
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should create timer', () => {
      const logger = new Logger({ level: LogLevel.DEBUG, destination: mockDestination });
      const endTimer = logger.timer('test-operation');
      endTimer();
      const output = mockDestination.mock.calls[0][0];
      expect(output).toContain('test-operation');
    });

    it('should format JSON output', () => {
      const logger = new Logger({ json: true, destination: mockDestination });
      logger.info('JSON message', { key: 'value' });
      const output = mockDestination.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe('INFO');
      expect(parsed.message).toBe('JSON message');
      expect(parsed.context.key).toBe('value');
    });
  });

  describe('parseLogLevel', () => {
    it('should parse valid log levels', () => {
      expect(parseLogLevel('TRACE')).toBe(LogLevel.TRACE);
      expect(parseLogLevel('DEBUG')).toBe(LogLevel.DEBUG);
      expect(parseLogLevel('INFO')).toBe(LogLevel.INFO);
      expect(parseLogLevel('WARN')).toBe(LogLevel.WARN);
      expect(parseLogLevel('ERROR')).toBe(LogLevel.ERROR);
      expect(parseLogLevel('FATAL')).toBe(LogLevel.FATAL);
      expect(parseLogLevel('SILENT')).toBe(LogLevel.SILENT);
    });

    it('should handle case insensitive input', () => {
      expect(parseLogLevel('trace')).toBe(LogLevel.TRACE);
      expect(parseLogLevel('Debug')).toBe(LogLevel.DEBUG);
      expect(parseLogLevel('info')).toBe(LogLevel.INFO);
    });

    it('should default to INFO for unknown levels', () => {
      expect(parseLogLevel('unknown')).toBe(LogLevel.INFO);
    });
  });

  describe('getLogLevelName', () => {
    it('should return correct names', () => {
      expect(getLogLevelName(LogLevel.TRACE)).toBe('TRACE');
      expect(getLogLevelName(LogLevel.DEBUG)).toBe('DEBUG');
      expect(getLogLevelName(LogLevel.INFO)).toBe('INFO');
      expect(getLogLevelName(LogLevel.WARN)).toBe('WARN');
      expect(getLogLevelName(LogLevel.ERROR)).toBe('ERROR');
      expect(getLogLevelName(LogLevel.FATAL)).toBe('FATAL');
      expect(getLogLevelName(LogLevel.SILENT)).toBe('SILENT');
    });
  });

  describe('getLogger and createLogger', () => {
    it('should create logger with createLogger', () => {
      const logger = createLogger({ destination: mockDestination });
      expect(logger).toBeInstanceOf(Logger);
    });

    it('should get singleton logger with getLogger', () => {
      // First call creates the singleton
      const logger1 = getLogger();
      // Second call returns the same singleton (ignoring config)
      const logger2 = getLogger();
      expect(logger1).toBe(logger2);
    });
  });
});
