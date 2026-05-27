/**
 * Developer Experience (DX) Module for ElectronHound
 *
 * Exports all DX utilities for error handling, logging,
 * progress tracking, configuration wizard, and CLI help.
 */

// Error handling
export {
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
} from './errors.js';
export type { ErrorMetadata } from './errors.js';

// Logging
export {
  LogLevel,
  Logger,
  getLogger,
  createLogger,
  parseLogLevel,
  getLogLevelName,
} from './logger.js';
export type { LogEntry, LogFormatter, LoggerConfig } from './logger.js';

// Progress tracking
export {
  ProgressBar,
  Spinner,
  ProgressTracker,
  getProgressTracker,
  formatStepProgress,
  formatStepSummary,
  formatDuration,
} from './progress.js';
export type {
  ProgressBarOptions,
  SpinnerOptions,
  TaskProgress,
  StepProgressOptions,
} from './progress.js';

// Configuration wizard
export {
  ConfigWizard,
  runConfigWizard,
} from './config-wizard.js';
export type { WizardOptions, WizardResult } from './config-wizard.js';

// CLI help
export {
  CLIHelp,
  createCLIHelp,
  COMMANDS,
  resolveCommandAlias,
} from './cli-help.js';
export type { CommandInfo, CLIHelpOptions } from './cli-help.js';
