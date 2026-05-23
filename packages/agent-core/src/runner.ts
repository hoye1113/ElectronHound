import { getMCPClient } from './mcp/client.js';
import { getGenerateObject, getGenerateObjectForProvider } from './llm.js';
import { loadProvidersConfig } from './config-manager.js';
import { AgentLoop } from './runtime/agentLoop.js';
import { SessionManager } from './session/sessionManager.js';
import { createLLMProviderAdapter } from './llm/adapter.js';
import type { RunTestResult } from './runner-types.js';

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
  let generateObject;

  if (options.providerId) {
    // Use the specified provider
    const config = loadProvidersConfig();
    const provider = config.providers.find(p => p.id === options.providerId);
    if (!provider) {
      throw new Error(`Provider '${options.providerId}' not found`);
    }
    generateObject = getGenerateObjectForProvider(provider);
  } else {
    // Fall back to env-based or default provider
    generateObject = getGenerateObject({ model: options.llmModel });
  }

  if (!generateObject) {
    throw new Error('No LLM provider available');
  }

  // Create LLM provider adapter
  const llmProvider = createLLMProviderAdapter({ model: options.llmModel });
  
  if (!llmProvider) {
    throw new Error('Failed to create LLM provider adapter');
  }

  // Create session manager
  const sessionManager = new SessionManager();

  // Create AgentLoop
  const agentLoop = new AgentLoop({
    llmProvider,
    sessionManager,
    maxSteps: options.maxSteps ?? 50,
  });

  const taskId = options.taskId ?? crypto.randomUUID();

  if (options.cdpUrl) {
    const mcp = getMCPClient();
    await mcp.connect({ playwrightCdpUrl: options.cdpUrl });
  }

  // Run the agent loop
  const result = await agentLoop.run(options.goal);

  // Convert AgentLoop result to RunTestResult
  const runTestResult: RunTestResult = {
    goal: options.goal,
    targetAppPath: options.targetAppPath,
    llmModel: options.llmModel ?? 'gpt-4o',
    maxSteps: options.maxSteps ?? 50,
    taskId,
    history: [],
    currentObservation: null,
    currentPlan: null,
    currentExecResult: null,
    currentVerdict: null,
    stepCount: result.report?.stepCount ?? 0,
    stuckCounter: 0,
    status: result.verdict === 'pass' ? 'completed' : result.verdict === 'fail' ? 'failed' : result.verdict === 'stuck' ? 'failed' : 'aborted',
    lastObservationHash: '',
    auditChainResult: null,
  };

  return runTestResult;
}
