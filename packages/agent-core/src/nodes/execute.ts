import type { TestState } from '../state.js';
import type { ExecResult } from '@eata/shared-types';
import { getMCPClient } from '../mcp/client.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Capture a screenshot via Playwright MCP and save it to disk.
 * Returns the saved file path, or undefined if screenshot failed.
 */
async function captureScreenshot(
  taskId: string,
  stepIndex: number,
): Promise<string | undefined> {
  const mcp = getMCPClient();

  try {
    const screenshotResult = await mcp.callTool(
      'playwright',
      'browser_screenshot',
      {},
    );

    if (!screenshotResult.success) {
      return undefined;
    }

    // Playwright MCP returns: { content: [{ type: 'image', data: '<base64>', mimeType: 'image/png' }] }
    // In mock mode it returns a string
    const result = screenshotResult.result as
      | { content?: Array<{ type?: string; data?: string; mimeType?: string }> }
      | string;

    let base64Data: string | undefined;

    if (typeof result === 'string') {
      // Mock mode or plain string result
      base64Data = result;
    } else if (result && typeof result === 'object' && Array.isArray(result.content)) {
      const imageContent = result.content.find(
        (c) => c.type === 'image' && c.data,
      );
      base64Data = imageContent?.data;
    }

    if (!base64Data) {
      return undefined;
    }

    // Save screenshot to disk
    const dataDir = process.env.EATA_DATA_DIR || 'data';
    const screenshotsDir = join(dataDir, 'reports', taskId, 'screenshots');
    mkdirSync(screenshotsDir, { recursive: true });

    const filename = `step-${stepIndex}-execute.png`;
    const filepath = join(screenshotsDir, filename);

    const buffer = Buffer.from(base64Data, 'base64');
    writeFileSync(filepath, buffer);

    return filepath;
  } catch {
    // Screenshot failure - gracefully skip
    return undefined;
  }
}

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

    // Capture screenshot after tool execution (browser tools only)
    let screenshotPath: string | undefined;
    if (server === 'playwright') {
      screenshotPath = await captureScreenshot(state.taskId, state.stepCount);
    }

    const execResult: ExecResult = {
      success: toolResult.success,
      result: toolResult.result,
      screenshot: screenshotPath,
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
