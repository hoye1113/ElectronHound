import { MCPClient } from './mcp/client.js';
import { createLLMProviderAdapter, createLLMProviderAdapterForProvider } from './llm/adapter.js';
import { loadProvidersConfig } from './config-manager.js';
import { AgentLoop } from './runtime/agentLoop.js';
import { SessionManager } from './session/sessionManager.js';
import { entriesToStepRecords, extractLastStep } from './session/entryConverter.js';
import { runAuditChain } from './sub-agents/audit-chain.js';
import type { RunTestResult } from './runner-types.js';
import { toErrorMessage } from './utils/error.js';
import { createStderrLogger } from './utils/logger.js';

const logger = createStderrLogger('runner');

export interface RunTestOptions {
  goal: string;
  targetAppPath: string;
  llmModel?: string;
  maxSteps?: number;
  taskId?: string;
  checkpointPath?: string;
  cdpUrl?: string;
  providerId?: string;
}

export async function runTest(
  options: RunTestOptions,
): Promise<RunTestResult> {
  // Resolve LLM provider
  let llmProvider;

  if (options.providerId) {
    // Use the specified provider
    const config = loadProvidersConfig();
    const provider = config.providers.find(p => p.id === options.providerId);
    if (!provider) {
      throw new Error(`Provider '${options.providerId}' not found`);
    }
    llmProvider = createLLMProviderAdapterForProvider(provider);
  } else {
    // Fall back to env-based or default provider
    llmProvider = createLLMProviderAdapter({ model: options.llmModel });
  }

  if (!llmProvider) {
    throw new Error('No LLM provider available — set OPENAI_API_KEY or configure a provider');
  }

  // Resolve MCP client (for tool execution)
  let mcpClient;
  if (options.cdpUrl) {
    // Legacy: connect to an already-running CDP endpoint
    const mcp = new MCPClient();
    await mcp.connect({ playwrightCdpUrl: options.cdpUrl });
    mcpClient = mcp;
  } else if (options.targetAppPath) {
    // Launch the Electron app via electron-bridge-mcp
    const mcp = new MCPClient();
    await mcp.connect({ electron: { appPath: options.targetAppPath } });
    mcpClient = mcp;
  }

  // Create session manager
  const sessionManager = new SessionManager(options.checkpointPath);

  // Create AgentLoop
  const agentLoop = new AgentLoop({
    llmProvider,
    sessionManager,
    mcpClient,
    maxSteps: options.maxSteps ?? 50,
  });

  const taskId = options.taskId ?? crypto.randomUUID();

  // Run the agent loop (include target app path in the goal for context)
  const goalWithContext = `Target app path: ${options.targetAppPath}\nGoal: ${options.goal}`;
  const result = await agentLoop.run(goalWithContext);

  // Read session entries and convert to StepRecords
  const session = sessionManager.getSession(result.sessionId);
  const history = session ? entriesToStepRecords(session.entries, taskId) : [];
  const lastStep = history.length > 0 ? extractLastStep(history) : null;

  // Run audit chain (4-role sub-agent pipeline)
  let auditChainResult = null;
  try {
    auditChainResult = await runAuditChain({
      goal: options.goal,
      targetAppPath: options.targetAppPath,
      context: { history, stepCount: result.report?.stepCount ?? 0 },
    });
  } catch (err: unknown) {
    logger.warn(`Audit chain failed: ${toErrorMessage(err)}`);
  }

  // Convert AgentLoop result to RunTestResult (backward-compatible with worker-entry.ts)
  const runTestResult: RunTestResult = {
    goal: options.goal,
    targetAppPath: options.targetAppPath,
    llmModel: options.llmModel ?? 'gpt-4o',
    maxSteps: options.maxSteps ?? 50,
    taskId,
    history,
    currentObservation: lastStep?.observation ?? null,
    currentPlan: lastStep?.plan ?? null,
    currentExecResult: lastStep?.execution ?? null,
    currentVerdict: result.verdict
      ? { verdict: result.verdict, reasoning: result.report?.reasoning ?? '' }
      : null,
    stepCount: result.report?.stepCount ?? 0,
    stuckCounter: result.verdict === 'stuck' ? 3 : 0,
    status: result.verdict === 'pass'
      ? 'completed'
      : result.verdict === 'fail'
        ? 'failed'
        : result.verdict === 'stuck'
          ? 'failed'
          : 'aborted',
    lastObservationHash: lastStep?.observationHash ?? '',
    auditChainResult,
  };

  return runTestResult;
}
