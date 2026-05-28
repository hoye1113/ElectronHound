export { createTestGraph } from './graph.js';
export { createCheckpointer } from './checkpoint.js';
export { runTest } from './runner.js';
export type { RunTestOptions } from './runner.js';
export { TestState } from './state.js';
export { getMCPClient, setMCPClient, MCPClient } from './mcp/client.js';
export type {
  MCPToolCall,
  MCPToolResult,
  MCPClientConfig,
  MCPServerConfig,
} from './mcp/client.js';
export { guardObservation, guardPlan, guardExecResult, guardVerdict, GuardError } from './guards.js';
export { observeNode } from './nodes/observe.js';
export { createPlanNode } from './nodes/plan.js';
export type { PlanNodeOptions } from './nodes/plan.js';
export { executeNode } from './nodes/execute.js';
export { createVerifyNode } from './nodes/verify.js';
export type { VerifyNodeOptions } from './nodes/verify.js';
export { abortNode } from './nodes/abort.js';
export { reportNode } from './nodes/report.js';
export {
  createReportGraph,
  ReportState,
  createSafetyNode,
  safetyNode,
  createPerformanceNode,
  performanceNode,
  createAccessibilityNode,
  accessibilityNode,
  createPatternNode,
  patternNode,
  createSummarizeNode,
  summarizeNode,
  PatternStore,
} from './report-graph/index.js';
export type {
  ReportGraphOptions,
  SafetyNodeOptions,
  PerformanceNodeOptions,
  AccessibilityNodeOptions,
  PatternNodeOptions,
} from './report-graph/index.js';

// Config management (v0.3)
export {
  loadProvidersConfig,
  saveProvidersConfig,
  addProvider,
  updateProvider,
  deleteProvider,
  setActiveProvider,
  getActiveProviderConfig,
} from './config-manager.js';

// LLM Provider (native-fetch, replaces Vercel AI SDK)
export {
  createOpenAIProvider,
  createLLMProviderAdapter,
  createLLMProviderAdapterForProvider,
  createProviderInstance,
  testProviderConnection,
  getGenerateObjectForProvider,
  createProvider,
  OpenAIProvider,
  createOpenAI,
  AnthropicProvider,
  createAnthropic,
  GoogleProvider,
  createGoogle,
  OllamaProvider,
  createOllama,
} from './llm/index.js';
export type {
  GenerateObjectOptions,
  GenerateTextOptions,
  CustomLLMProvider,
  LLMProvider,
  GenerateOptions,
  UnifiedGenerateObjectOptions,
  ProviderConfig,
  ProviderType,
} from './llm/index.js';

// Provider types
export type { LLMProviderConfig, ProvidersConfig, LLMProviderType } from './llm-types.js';
export { BUILTIN_TEMPLATES } from './llm-types.js';

// Sub-agent types and implementations (audit chain)
export type {
  SubAgentRole,
  SubAgentInput,
  SubAgentOutput,
  AuditReport,
  AuditFinding,
  AuditChainResult,
} from './sub-agents/index.js';
export {
  TestPlanner,
  ExecutionAnalyst,
  SecurityReviewer,
  ReportSynthesizer,
  runAuditChain,
} from './sub-agents/index.js';

// Few-shot examples
export { loadExamples } from './prompts/few-shot/index.js';
export type { FewShotExample, FewShotContext } from './prompts/few-shot/index.js';

// Developer Experience (DX) modules
export {
  // Error handling
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
  // Logging
  LogLevel,
  Logger,
  getLogger,
  createLogger,
  parseLogLevel,
  getLogLevelName,
  // Progress tracking
  ProgressBar,
  Spinner,
  ProgressTracker,
  getProgressTracker,
  formatStepProgress,
  formatStepSummary,
  formatDuration,
  // Configuration wizard
  ConfigWizard,
  runConfigWizard,
  // CLI help
  CLIHelp,
  createCLIHelp,
  COMMANDS,
  resolveCommandAlias,
} from './dx/index.js';
export type {
  ErrorMetadata,
  LogEntry,
  LogFormatter,
  LoggerConfig,
  ProgressBarOptions,
  SpinnerOptions,
  TaskProgress,
  StepProgressOptions,
  WizardOptions,
  WizardResult,
  CommandInfo,
  CLIHelpOptions,
} from './dx/index.js';
