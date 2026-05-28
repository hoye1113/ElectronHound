// ── Core runner ──────────────────────────────────────────────────────────
export { runTest } from './runner.js';
export type { RunTestOptions } from './runner.js';
export type { RunTestResult } from './runner-types.js';

// ── MCP client ──────────────────────────────────────────────────────────
export { getMCPClient, setMCPClient, MCPClient } from './mcp/client.js';
export type {
  MCPToolCall,
  MCPToolResult,
  MCPClientConfig,
  MCPServerConfig,
} from './mcp/client.js';

// ── Guards ──────────────────────────────────────────────────────────────
export { guardObservation, guardPlan, guardExecResult, guardVerdict, GuardError } from './guards.js';

// ── Config management (v0.3) ─────────────────────────────────────────────
export {
  loadProvidersConfig,
  saveProvidersConfig,
  addProvider,
  updateProvider,
  deleteProvider,
  setActiveProvider,
  getActiveProviderConfig,
} from './config-manager.js';

// ── LLM Provider (native-fetch, replaces Vercel AI SDK) ──────────────────
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

// ── Provider types ──────────────────────────────────────────────────────
export type { LLMProviderConfig, ProvidersConfig, LLMProviderType } from './llm-types.js';
export { BUILTIN_TEMPLATES } from './llm-types.js';

// ── Agent loop runtime ──────────────────────────────────────────────────
export { AgentLoop } from './runtime/index.js';
export type {
  AgentLoopConfig,
  AgentLoopState,
  Observation,
  Plan,
  ExecutionResult,
  Verdict,
  VerdictValue,
  Report,
  AgentRunResult,
} from './runtime/index.js';

// ── Session management ──────────────────────────────────────────────────
export { SessionManager } from './session/index.js';
export type {
  SessionEntry,
  CompactionEntry,
  BranchSummaryEntry,
  SessionWithEntries,
} from './session/index.js';

// ── Sub-agent types and implementations (audit chain) ────────────────────
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

// ── Few-shot examples ────────────────────────────────────────────────────
export { loadExamples } from './prompts/few-shot/index.js';
export type { FewShotExample, FewShotContext } from './prompts/few-shot/index.js';

// ── Developer Experience (DX) modules ────────────────────────────────────
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
