import { createTestGraph } from './graph.js';
import { createCheckpointer } from './checkpoint.js';
import { getMCPClient } from './mcp/client.js';
import { getGenerateObject } from './llm.js';
import type { TestState } from './state.js';

export interface RunTestOptions {
  goal: string;
  targetAppPath: string;
  llmModel?: string;
  maxSteps?: number;
  taskId?: string;
  checkpointPath?: string;
  cdpUrl?: string;
}

export async function runTest(
  options: RunTestOptions,
): Promise<typeof TestState.State> {
  const generateObject = getGenerateObject({ model: options.llmModel });
  const graphOptions = generateObject
    ? { plan: { generateObject }, verify: { generateObject } } as const
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
  });

  return result;
}
