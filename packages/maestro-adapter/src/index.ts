/**
 * @eata/maestro-adapter
 *
 * Adapter for mapping EATA data structures to recastory-maestro format.
 * Enables ElectronHound to register as an MCP Server for maestro orchestration.
 */

import {
  convertStepToNode,
  convertNodeToStep,
  MaestroNodeSchema,
  MaestroStatusMap,
  EataStatusMap,
  MaestroPhaseMap,
  EataPhaseMap,
} from '@eata/shared-types';
import type { MaestroNode } from '@eata/shared-types';
import type { StepRecord, StepPhase, StepStatus } from '@eata/shared-types';

export {
  // Types
  MaestroNodeSchema,
  type MaestroNode,

  // Conversion functions
  convertStepToNode,
  convertNodeToStep,

  // Status and phase mappings
  MaestroStatusMap,
  EataStatusMap,
  MaestroPhaseMap,
  EataPhaseMap,
};

// Re-export StepRecord type for convenience
export type { StepRecord, StepPhase, StepStatus };

/**
 * Maestro MCP Server registration info.
 * Used when registering EATA as an MCP Server with maestro.
 */
export const MAESTRO_MCP_SERVER_INFO = {
  name: 'electronhound',
  version: '0.3.0',
  description: 'AI-powered testing agent for Electron applications',
  capabilities: {
    tools: true,
    resources: false,
    prompts: false,
  },
} as const;

/**
 * Batch convert multiple EATA steps to maestro nodes.
 */
export function convertStepsToNodes(steps: StepRecord[]): MaestroNode[] {
  return steps.map(convertStepToNode);
}

/**
 * Batch convert multiple maestro nodes to EATA steps.
 */
export function convertNodesToSteps(nodes: MaestroNode[]): StepRecord[] {
  return nodes.map(convertNodeToStep);
}
