export type { CreateTaskRequest, TaskStatus, Task } from './task.js';
export { TaskSchema, CreateTaskRequestSchema, TaskStatusEnum, TaskPriorityEnum } from './task.js';

export type { StepPhase, StepStatus, StepRecord } from './step.js';
export { StepRecordSchema, StepPhaseEnum, StepStatusEnum } from './step.js';

export type { Manifest, TimelineEntry } from './report.js';
export { ManifestSchema, TimelineEntrySchema } from './report.js';

export type { FeedbackPattern } from './feedback.js';
export { FeedbackPatternSchema } from './feedback.js';

export type { JsonRpcNotification, JsonRpcControl } from './ipc.js';
export { JsonRpcNotificationSchema, JsonRpcControlSchema } from './ipc.js';

export type {
  ObservationResult,
  PlanResult,
  ExecResult,
  VerdictResult,
  SafetyReport,
  PerformanceReport,
  AccessibilityReport,
} from './agent-state.js';
export {
  ObservationResultSchema,
  PlanResultSchema,
  ExecResultSchema,
  VerdictResultSchema,
  SafetyReportSchema,
  PerformanceReportSchema,
  AccessibilityReportSchema,
} from './agent-state.js';

// Provider schemas (v0.3)
export * from './provider.js';

// Error types and codes
export { ErrorDomain, ErrorCodes } from './errors.js';
export type { EataError, ErrorCodeKey } from './errors.js';

// Trust level system for execute_main permission grading (PR-15)
export {
  TrustLevelSchema,
  TrustConfigSchema,
  READONLY_TRUST_CONFIG,
  APP_CONTEXT_TRUST_CONFIG,
  HOST_FULL_TRUST_CONFIG,
  TRUST_CONFIGS,
} from './trust.js';
export type { TrustLevel, TrustConfig } from './trust.js';

// Electron version compatibility matrix (PR-16)
export {
  ElectronVersionSchema,
  CompatibilityResultSchema,
  SUPPORTED_ELECTRON_VERSIONS,
  ELECTRON_VERSION_RANGE,
  FEATURE_VERSION_MAP,
  parseElectronVersion,
  isVersionSupported,
  isFeatureSupported,
  checkCompatibility,
  getAvailableFeatures,
} from './electron-compat.js';
export type { ElectronVersion, CompatibilityResult } from './electron-compat.js';

// Maestro adapter types and functions (PR-20)
export {
  MaestroNodeSchema,
  MaestroStatusMap,
  EataStatusMap,
  MaestroPhaseMap,
  EataPhaseMap,
  convertStepToNode,
  convertNodeToStep,
} from './maestroAdapter.js';
export type { MaestroNode } from './maestroAdapter.js';
