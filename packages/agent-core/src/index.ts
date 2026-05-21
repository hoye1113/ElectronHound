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

// Provider factory (v0.3)
export { createProviderInstance } from './provider-factory.js';
export { getGenerateObjectForProvider } from './llm.js';

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

// CDP integration (replaces MCP architecture)
export {
  CDPClient,
  CDPSession,
  CDPTool,
  createCDPTools,
  BrowserSnapshotTool,
  BrowserClickTool,
  BrowserTypeTool,
  BrowserNavigateTool,
  BrowserPressKeyTool,
  BrowserHoverTool,
  BrowserDragTool,
  CDPLaunchTool,
  CDPCloseTool,
  CDPExecuteMainTool,
  CDPTriggerIpcTool,
  CDPMockDialogTool,
} from './tools/cdp.js';
export type {
  CDPConfig,
  CDPSessionInfo,
  CDPRawResult,
  CDPToolParams,
  CDPToolResult,
  CDPContext,
} from './tools/types.js';
