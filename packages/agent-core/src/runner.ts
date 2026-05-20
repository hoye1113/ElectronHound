import { createTestGraph } from './graph.js';
import { createCheckpointer } from './checkpoint.js';
import { getMCPClient } from './mcp/client.js';
import { getGenerateObject, getGenerateObjectForProvider } from './llm.js';
import { loadProvidersConfig } from './config-manager.js';
import type { TestState } from './state.js';

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
): Promise<typeof TestState.State> {
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

  const graphOptions = generateObject
    ? { plan: { generateObject }, verify: { generateObject } }
    : undefined;
  const graph = createTestGraph(graphOptions);
  const checkpointer = createCheckpointer(
    options.checkpointPath ?? './data/agent-checkpoints.sqlite3',
  );
  const compiled = graph.compile({ checkpointer });

  const taskId = options.taskId ?? crypto.randomUUID();

  if (options.cdpUrl) {
    const mcp = getMCPClient();
    await mcp.connect({ playwrightCdpUrl: options.cdpUrl });
  }

  const initialState = {
    goal: options.goal,
    targetAppPath: options.targetAppPath,
    llmModel: options.llmModel ?? 'gpt-4o',
    maxSteps: options.maxSteps ?? 50,
    taskId,
  };

  const result = await compiled.invoke(initialState, {
    configurable: { thread_id: taskId },
    recursionLimit: 100,
  });

  return result;
}
