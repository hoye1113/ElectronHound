import type { TestState } from '../state.js';
import type { ExecResult } from '@eata/shared-types';
import { getMCPClient } from '../mcp/client.js';

export const executeNode = async (
  state: typeof TestState.State,
): Promise<Partial<typeof TestState.State>> => {
  const plan = state.currentPlan;
  if (!plan?.toolCall) {
    const errorResult: ExecResult = { success: false, result: 'No plan or toolCall available' };
    return { currentExecResult: errorResult };
  }

  const { name, args } = plan.toolCall;

  const server: 'playwright' | 'electron' = name.startsWith('browser_') ? 'playwright' : 'electron';

  const mcp = getMCPClient();

  try {
    const toolResult = await mcp.callTool(server, name, args);

    const execResult: ExecResult = {
      success: toolResult.success,
      result: toolResult.result,
    };

    const stepRecord = {
      id: crypto.randomUUID(),
      taskId: state.taskId,
      stepIndex: state.stepCount,
      phase: 'execute' as const,
      status: execResult.success ? 'success' as const : 'failed' as const,
      action: { name, args },
      result: execResult.result,
      timestamp: new Date().toISOString(),
      duration: 0,
    };

    return {
      currentExecResult: execResult,
      history: [stepRecord],
    };
  } catch (err) {
    const execResult: ExecResult = {
      success: false,
      result: String(err),
    };

    const stepRecord = {
      id: crypto.randomUUID(),
      taskId: state.taskId,
      stepIndex: state.stepCount,
      phase: 'execute' as const,
      status: 'failed' as const,
      action: { name, args },
      result: String(err),
      timestamp: new Date().toISOString(),
      duration: 0,
    };

    return {
      currentExecResult: execResult,
      history: [stepRecord],
    };
  }
};
