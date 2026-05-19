import type { TestState } from '../state.js';
import type { ObservationResult } from '@eata/shared-types';
import { getMCPClient } from '../mcp/client.js';

export const observeNode = async (
  state: typeof TestState.State,
): Promise<Partial<typeof TestState.State>> => {
  const mcp = getMCPClient();

  const snapshotResult = await mcp.callTool('playwright', 'browser_snapshot', {});

  const observationResult: ObservationResult = {
    ariaTree: typeof snapshotResult.result === 'string'
      ? snapshotResult.result
      : JSON.stringify(snapshotResult.result),
    pageTitle: '',
    url: '',
    timestamp: new Date().toISOString(),
  };

  const ariaTreeStr = observationResult.ariaTree;
  const currentHash = hashString(ariaTreeStr);

  const stuck = currentHash === state.lastObservationHash && state.lastObservationHash !== '';
  const stuckCounter = stuck ? state.stuckCounter + 1 : 0;

  const newStepCount = state.stepCount + 1;

  const stepRecord = {
    id: crypto.randomUUID(),
    taskId: state.taskId,
    stepIndex: newStepCount - 1,
    phase: 'observe' as const,
    status: 'success' as const,
    observation: observationResult.ariaTree,
    timestamp: new Date().toISOString(),
    duration: 0,
  };

  return {
    currentObservation: observationResult,
    stepCount: newStepCount,
    stuckCounter,
    lastObservationHash: currentHash,
    history: [stepRecord],
  };
};

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return String(hash);
}
