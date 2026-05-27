/**
 * Structured Logger for ElectronHound
 *
 * Provides structured logging with levels, formatted output,
 * and context information for better debugging experience.
 */

import { isEataError } from './errors.js';

// ─── Log Levels ───────────────────────────────────────────────────────

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
  SILENT = 6,
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.TRACE]: 'TRACE',
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL',
  [LogLevel.SILENT]: 'SILENT',
};

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.TRACE]: '\x1b[90m',   // Gray
  [LogLevel.DEBUG]: '\x1b[36m',   // Cyan
  [LogLevel.INFO]: '\x1b[32m',    // Green
  [LogLevel.WARN]: '\x1b[33m',    // Yellow
  [LogLevel.ERROR]: '\x1b[31m',   // Red
  [LogLevel.FATAL]: '\x1b[35m',   // Magenta
  [LogLevel.SILENT]: '',
};

const RESET_COLOR = '\x1b[0m';

// ─── Log Entry Types ──────────────────────────────────────────────────

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: Error;
  source?: string;
  duration?: number;
}

export type LogFormatter = (entry: LogEntry) => string;

// ─── Logger Configuration ─────────────────────────────────────────────

export interface LoggerConfig {
  level: LogLevel;
  colors: boolean;
  timestamps: boolean;
  json: boolean;
  source: string;
  formatter?: LogFormatter;
  destination?: (message: string) => void;
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  colors: true,
  timestamps: true,
  json: false,
  source: 'eata',
  destination: (msg: string) => process.stdout.write(msg + '\n'),
};

// ─── Logger Class ─────────────────────────────────────────────────────

export class Logger {
  private config: LoggerConfig;
  private context: Record<string, unknown>;

  constructor(config?: Partial<LoggerConfig>, context?: Record<string, unknown>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.context = context ?? {};
  }

  /**
   * Create a child logger with additional context.
   */
  child(context: Record<string, unknown>): Logger {
    return new Logger(this.config, { ...this.context, ...context });
  }

  /**
   * Set the log level.
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Get the current log level.
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Log a trace message.
   */
  trace(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, context);
  }

  /**
   * Log a debug message.
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an info message.
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message.
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message.
   */
  error(message: string, errorOrContext?: Error | Record<string, unknown>): void {
    if (errorOrContext instanceof Error) {
      this.log(LogLevel.ERROR, message, undefined, errorOrContext);
    } else {
      this.log(LogLevel.ERROR, message, errorOrContext);
    }
  }

  /**
   * Log a fatal message.
   */
  fatal(message: string, error?: Error): void {
    this.log(LogLevel.FATAL, message, undefined, error);
  }

  /**
   * Start a timer and return a function to log the duration.
   */
  timer(label: string): () => void {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.debug(`${label} completed`, { duration: `${duration.toFixed(2)}ms` });
    };
  }

  /**
   * Log with a specific level.
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
  ): void {
    if (level < this.config.level) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context: { ...this.context, ...context },
      error,
      source: this.config.source,
    };

    const formatted = this.config.json
      ? this.formatJSON(entry)
      : this.config.formatter
        ? this.config.formatter(entry)
        : this.formatDefault(entry);

    this.config.destination?.(formatted);
  }

  /**
   * Format a log entry as JSON.
   */
  private formatJSON(entry: LogEntry): string {
    const obj: Record<string, unknown> = {
      timestamp: entry.timestamp.toISOString(),
      level: LOG_LEVEL_NAMES[entry.level],
      message: entry.message,
      source: entry.source,
    };

    if (entry.context && Object.keys(entry.context).length > 0) {
      obj.context = entry.context;
    }

    if (entry.error) {
      obj.error = {
        name: entry.error.name,
        message: entry.error.message,
        stack: entry.error.stack,
      };
      if (isEataError(entry.error)) {
        obj.error.code = entry.error.code;
        obj.error.solution = entry.error.solution;
      }
    }

    if (entry.duration !== undefined) {
      obj.duration = entry.duration;
    }

    return JSON.stringify(obj);
  }

  /**
   * Format a log entry for human-readable output.
   */
  private formatDefault(entry: LogEntry): string {
    const parts: string[] = [];

    // Timestamp
    if (this.config.timestamps) {
      const ts = this.formatTimestamp(entry.timestamp);
      parts.push(this.colorize(LogLevel.TRACE, ts));
    }

    // Level
    const levelStr = LOG_LEVEL_NAMES[entry.level].padEnd(5);
    parts.push(this.colorize(entry.level, `[${levelStr}]`));

    // Source
    if (entry.source) {
      parts.push(this.colorize(LogLevel.TRACE, `<${entry.source}>`));
    }

    // Message
    parts.push(entry.message);

    // Context
    if (entry.context && Object.keys(entry.context).length > 0) {
      const ctxStr = this.formatContext(entry.context);
      parts.push(this.colorize(LogLevel.TRACE, ctxStr));
    }

    // Duration
    if (entry.duration !== undefined) {
      parts.push(this.colorize(LogLevel.TRACE, `(${entry.duration}ms)`));
    }

    let line = parts.join(' ');

    // Error details
    if (entry.error) {
      line += '\n' + this.formatErrorDetails(entry.error);
    }

    return line;
  }

  /**
   * Format timestamp.
   */
  private formatTimestamp(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
  }

  /**
   * Format context object.
   */
  private formatContext(context: Record<string, unknown>): string {
    const entries = Object.entries(context)
      .map(([key, value]) => {
        const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return `${key}=${val}`;
      })
      .join(', ');
    return `{${entries}}`;
  }

  /**
   * Format error details.
   */
  private formatErrorDetails(error: Error): string {
    const lines: string[] = [];
    const indent = '  ';

    if (isEataError(error)) {
      lines.push(`${indent}Error Code: ${error.code}`);
      if (error.solution) {
        lines.push(`${indent}Solution: ${error.solution}`);
      }
      if (error.docsUrl) {
        lines.push(`${indent}Docs: ${error.docsUrl}`);
      }
      if (error.context) {
        lines.push(`${indent}Context: ${JSON.stringify(error.context)}`);
      }
    } else {
      lines.push(`${indent}Error: ${error.message}`);
    }

    if (error.stack) {
      const stackLines = error.stack.split('\n').slice(1, 4);
      lines.push(`${indent}Stack:`);
      for (const line of stackLines) {
        lines.push(`${indent}${indent}${line.trim()}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Apply color to text if colors are enabled.
   */
  private colorize(level: LogLevel, text: string): string {
    if (!this.config.colors) return text;
    const color = LOG_LEVEL_COLORS[level];
    return color ? `${color}${text}${RESET_COLOR}` : text;
  }
}

// ─── Singleton Logger ─────────────────────────────────────────────────

let defaultLogger: Logger | null = null;

/**
 * Get or create the default logger.
 */
export function getLogger(config?: Partial<LoggerConfig>): Logger {
  if (!defaultLogger || config) {
    defaultLogger = new Logger(config);
  }
  return defaultLogger;
}

/**
 * Create a new logger with specific configuration.
 */
export function createLogger(config: Partial<LoggerConfig>): Logger {
  return new Logger(config);
}

/**
 * Parse log level from string.
 */
export function parseLogLevel(level: string): LogLevel {
  const normalized = level.toUpperCase();
  switch (normalized) {
    case 'TRACE': return LogLevel.TRACE;
    case 'DEBUG': return LogLevel.DEBUG;
    case 'INFO': return LogLevel.INFO;
    case 'WARN': return LogLevel.WARN;
    case 'ERROR': return LogLevel.ERROR;
    case 'FATAL': return LogLevel.FATAL;
    case 'SILENT': return LogLevel.SILENT;
    default: return LogLevel.INFO;
  }
}

/**
 * Get human-readable log level name.
 */
export function getLogLevelName(level: LogLevel): string {
  return LOG_LEVEL_NAMES[level];
}
