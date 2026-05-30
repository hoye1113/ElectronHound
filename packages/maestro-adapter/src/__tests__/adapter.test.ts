import { describe, it, expect } from 'vitest';
import {
  convertStepToNode,
  convertNodeToStep,
  convertStepsToNodes,
  convertNodesToSteps,
  MaestroNodeSchema,
  MaestroStatusMap,
  EataStatusMap,
  MaestroPhaseMap,
  EataPhaseMap,
  MAESTRO_MCP_SERVER_INFO,
} from '../index.js';
import type { StepRecord, MaestroNode } from '../index.js';

describe('MaestroAdapter', () => {
  // Test data
  const validStep: StepRecord = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    taskId: '550e8400-e29b-41d4-a716-446655440000',
    stepIndex: 0,
    phase: 'observe',
    status: 'success',
    observation: 'Page loaded successfully',
    action: {
      name: 'navigate',
      args: { url: 'https://example.com' },
    },
    result: { loaded: true },
    reasoning: 'Navigate to homepage',
    screenshotPath: '/screenshots/step-0.png',
    accessibilitySnapshotPath: '/snapshots/step-0.json',
    timestamp: '2026-01-01T00:00:00Z',
    duration: 1500,
  };

  const validNode: MaestroNode = {
    type: 'observation',
    command: 'navigate',
    result: 'Page loaded successfully',
    metadata: {
      eataStepId: '550e8400-e29b-41d4-a716-446655440001',
      eataTaskId: '550e8400-e29b-41d4-a716-446655440000',
      stepIndex: 0,
      phase: 'observation',
      status: 'passed',
      timestamp: '2026-01-01T00:00:00Z',
      duration: 1500,
      reasoning: 'Navigate to homepage',
      args: { url: 'https://example.com' },
      screenshotPath: '/screenshots/step-0.png',
      accessibilitySnapshotPath: '/snapshots/step-0.json',
    },
  };

  describe('MaestroNodeSchema', () => {
    it('parses valid node', () => {
      const result = MaestroNodeSchema.parse(validNode);
      expect(result.type).toBe('observation');
      expect(result.command).toBe('navigate');
    });

    it('parses node without optional fields', () => {
      const minimalNode = { type: 'test', command: 'run' };
      const result = MaestroNodeSchema.parse(minimalNode);
      expect(result.type).toBe('test');
      expect(result.result).toBeUndefined();
      expect(result.metadata).toBeUndefined();
    });

    it('rejects missing required fields', () => {
      expect(() => MaestroNodeSchema.parse({ type: 'test' })).toThrow();
      expect(() => MaestroNodeSchema.parse({ command: 'run' })).toThrow();
    });
  });

  describe('Status and Phase Mappings', () => {
    it('has correct MaestroStatusMap entries', () => {
      expect(MaestroStatusMap.success).toBe('passed');
      expect(MaestroStatusMap.retry).toBe('retried');
      expect(MaestroStatusMap.failed).toBe('failed');
      expect(MaestroStatusMap.skipped).toBe('skipped');
    });

    it('has correct EataStatusMap entries', () => {
      expect(EataStatusMap.passed).toBe('success');
      expect(EataStatusMap.retried).toBe('retry');
      expect(EataStatusMap.failed).toBe('failed');
      expect(EataStatusMap.skipped).toBe('skipped');
    });

    it('has correct MaestroPhaseMap entries', () => {
      expect(MaestroPhaseMap.observe).toBe('observation');
      expect(MaestroPhaseMap.plan).toBe('planning');
      expect(MaestroPhaseMap.execute).toBe('execution');
      expect(MaestroPhaseMap.verify).toBe('verification');
    });

    it('has correct EataPhaseMap entries', () => {
      expect(EataPhaseMap.observation).toBe('observe');
      expect(EataPhaseMap.planning).toBe('plan');
      expect(EataPhaseMap.execution).toBe('execute');
      expect(EataPhaseMap.verification).toBe('verify');
    });
  });

  describe('convertStepToNode', () => {
    it('converts a complete step to node', () => {
      const node = convertStepToNode(validStep);

      expect(node.type).toBe('observation');
      expect(node.command).toBe('navigate');
      expect(node.result).toBe('Page loaded successfully');
      expect(node.metadata?.eataStepId).toBe(validStep.id);
      expect(node.metadata?.eataTaskId).toBe(validStep.taskId);
      expect(node.metadata?.stepIndex).toBe(0);
      expect(node.metadata?.phase).toBe('observation');
      expect(node.metadata?.status).toBe('passed');
      expect(node.metadata?.duration).toBe(1500);
    });

    it('maps action.name to command', () => {
      const node = convertStepToNode(validStep);
      expect(node.command).toBe(validStep.action?.name);
    });

    it('maps observation to result', () => {
      const node = convertStepToNode(validStep);
      expect(node.result).toBe(validStep.observation);
    });

    it('falls back to phase for command when no action', () => {
      const stepWithoutAction = { ...validStep, action: undefined };
      const node = convertStepToNode(stepWithoutAction);
      expect(node.command).toBe('observe');
    });

    it('falls back to result when no observation', () => {
      const stepWithoutObservation = { ...validStep, observation: undefined };
      const node = convertStepToNode(stepWithoutObservation);
      expect(node.result).toBe(validStep.result);
    });

    it('preserves reasoning in metadata', () => {
      const node = convertStepToNode(validStep);
      expect(node.metadata?.reasoning).toBe('Navigate to homepage');
    });

    it('preserves action args in metadata', () => {
      const node = convertStepToNode(validStep);
      expect(node.metadata?.args).toEqual({ url: 'https://example.com' });
    });

    it('preserves screenshot path in metadata', () => {
      const node = convertStepToNode(validStep);
      expect(node.metadata?.screenshotPath).toBe('/screenshots/step-0.png');
    });

    it('preserves accessibility snapshot path in metadata', () => {
      const node = convertStepToNode(validStep);
      expect(node.metadata?.accessibilitySnapshotPath).toBe('/snapshots/step-0.json');
    });

    it('handles step without optional fields', () => {
      const minimalStep: StepRecord = {
        id: '550e8400-e29b-41d4-a716-446655440002',
        taskId: '550e8400-e29b-41d4-a716-446655440000',
        stepIndex: 1,
        phase: 'execute',
        status: 'success',
        timestamp: '2026-01-01T00:00:00Z',
        duration: 500,
      };

      const node = convertStepToNode(minimalStep);
      expect(node.command).toBe('execute');
      expect(node.result).toBeUndefined();
      expect(node.metadata?.reasoning).toBeUndefined();
      expect(node.metadata?.args).toBeUndefined();
    });

    it('maps all phases correctly', () => {
      const phases = ['observe', 'plan', 'execute', 'verify'] as const;
      const expectedTypes = ['observation', 'planning', 'execution', 'verification'];

      phases.forEach((phase, index) => {
        const step = { ...validStep, phase };
        const node = convertStepToNode(step);
        expect(node.type).toBe(expectedTypes[index]);
      });
    });

    it('maps all statuses correctly', () => {
      const statuses = ['success', 'retry', 'failed', 'skipped'] as const;
      const expectedStatuses = ['passed', 'retried', 'failed', 'skipped'];

      statuses.forEach((status, index) => {
        const step = { ...validStep, status };
        const node = convertStepToNode(step);
        expect(node.metadata?.status).toBe(expectedStatuses[index]);
      });
    });
  });

  describe('convertNodeToStep', () => {
    it('converts a complete node to step', () => {
      const step = convertNodeToStep(validNode);

      expect(step.id).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(step.taskId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(step.stepIndex).toBe(0);
      expect(step.phase).toBe('observe');
      expect(step.status).toBe('success');
      expect(step.observation).toBe('Page loaded successfully');
      expect(step.action?.name).toBe('navigate');
      expect(step.action?.args).toEqual({ url: 'https://example.com' });
      expect(step.reasoning).toBe('Navigate to homepage');
      expect(step.duration).toBe(1500);
    });

    it('maps command to action.name', () => {
      const step = convertNodeToStep(validNode);
      expect(step.action?.name).toBe('navigate');
    });

    it('maps string result to observation', () => {
      const step = convertNodeToStep(validNode);
      expect(step.observation).toBe('Page loaded successfully');
    });

    it('does not set observation for non-string result', () => {
      const nodeWithObjectResult = { ...validNode, result: { loaded: true } };
      const step = convertNodeToStep(nodeWithObjectResult);
      expect(step.observation).toBeUndefined();
      expect(step.result).toEqual({ loaded: true });
    });

    it('maps type back to phase', () => {
      const step = convertNodeToStep(validNode);
      expect(step.phase).toBe('observe');
    });

    it('maps status back correctly', () => {
      const step = convertNodeToStep(validNode);
      expect(step.status).toBe('success');
    });

    it('generates UUID when metadata missing ids', () => {
      const nodeWithoutIds: MaestroNode = {
        type: 'execution',
        command: 'click',
        result: 'clicked',
      };

      const step = convertNodeToStep(nodeWithoutIds);
      expect(step.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(step.taskId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('defaults stepIndex to 0 when missing', () => {
      const nodeWithoutIndex: MaestroNode = {
        type: 'observation',
        command: 'test',
      };

      const step = convertNodeToStep(nodeWithoutIndex);
      expect(step.stepIndex).toBe(0);
    });

    it('defaults status to success when missing', () => {
      const nodeWithoutStatus: MaestroNode = {
        type: 'observation',
        command: 'test',
        metadata: {},
      };

      const step = convertNodeToStep(nodeWithoutStatus);
      expect(step.status).toBe('success');
    });

    it('generates timestamp when missing', () => {
      const nodeWithoutTimestamp: MaestroNode = {
        type: 'observation',
        command: 'test',
      };

      const step = convertNodeToStep(nodeWithoutTimestamp);
      expect(step.timestamp).toBeDefined();
      expect(() => new Date(step.timestamp)).not.toThrow();
    });

    it('defaults duration to 0 when missing', () => {
      const nodeWithoutDuration: MaestroNode = {
        type: 'observation',
        command: 'test',
      };

      const step = convertNodeToStep(nodeWithoutDuration);
      expect(step.duration).toBe(0);
    });

    it('maps all maestro phases back correctly', () => {
      const phases = ['observation', 'planning', 'execution', 'verification'] as const;
      const expectedPhases = ['observe', 'plan', 'execute', 'verify'];

      phases.forEach((type, index) => {
        const node: MaestroNode = {
          type,
          command: 'test',
          metadata: { status: 'passed' },
        };
        const step = convertNodeToStep(node);
        expect(step.phase).toBe(expectedPhases[index]);
      });
    });

    it('maps all maestro statuses back correctly', () => {
      const statuses = ['passed', 'retried', 'failed', 'skipped'] as const;
      const expectedStatuses = ['success', 'retry', 'failed', 'skipped'];

      statuses.forEach((status, index) => {
        const node: MaestroNode = {
          type: 'observation',
          command: 'test',
          metadata: { status },
        };
        const step = convertNodeToStep(node);
        expect(step.status).toBe(expectedStatuses[index]);
      });
    });
  });

  describe('Round-trip conversion', () => {
    it('preserves essential fields through step -> node -> step', () => {
      const node = convertStepToNode(validStep);
      const roundTripped = convertNodeToStep(node);

      // Essential fields should be preserved
      expect(roundTripped.id).toBe(validStep.id);
      expect(roundTripped.taskId).toBe(validStep.taskId);
      expect(roundTripped.stepIndex).toBe(validStep.stepIndex);
      expect(roundTripped.phase).toBe(validStep.phase);
      expect(roundTripped.status).toBe(validStep.status);
      expect(roundTripped.timestamp).toBe(validStep.timestamp);
      expect(roundTripped.duration).toBe(validStep.duration);

      // Action name should be preserved
      expect(roundTripped.action?.name).toBe(validStep.action?.name);
    });

    it('preserves observation through round-trip', () => {
      const node = convertStepToNode(validStep);
      const roundTripped = convertNodeToStep(node);
      expect(roundTripped.observation).toBe(validStep.observation);
    });

    it('preserves reasoning through round-trip', () => {
      const node = convertStepToNode(validStep);
      const roundTripped = convertNodeToStep(node);
      expect(roundTripped.reasoning).toBe(validStep.reasoning);
    });

    it('preserves action args through round-trip', () => {
      const node = convertStepToNode(validStep);
      const roundTripped = convertNodeToStep(node);
      expect(roundTripped.action?.args).toEqual(validStep.action?.args);
    });

    it('preserves screenshot path through round-trip', () => {
      const node = convertStepToNode(validStep);
      const roundTripped = convertNodeToStep(node);
      expect(roundTripped.screenshotPath).toBe(validStep.screenshotPath);
    });

    it('preserves accessibility snapshot path through round-trip', () => {
      const node = convertStepToNode(validStep);
      const roundTripped = convertNodeToStep(node);
      expect(roundTripped.accessibilitySnapshotPath).toBe(validStep.accessibilitySnapshotPath);
    });

    it('preserves essential fields through node -> step -> node', () => {
      const step = convertNodeToStep(validNode);
      const roundTripped = convertStepToNode(step);

      // Type should be preserved (phase mapping)
      expect(roundTripped.type).toBe(validNode.type);

      // Command should be preserved
      expect(roundTripped.command).toBe(validNode.command);

      // Status should be preserved
      expect(roundTripped.metadata?.status).toBe(validNode.metadata?.status);
    });

    it('handles minimal step round-trip', () => {
      const minimalStep: StepRecord = {
        id: '550e8400-e29b-41d4-a716-446655440003',
        taskId: '550e8400-e29b-41d4-a716-446655440000',
        stepIndex: 5,
        phase: 'plan',
        status: 'retry',
        timestamp: '2026-06-01T12:00:00Z',
        duration: 2000,
      };

      const node = convertStepToNode(minimalStep);
      const roundTripped = convertNodeToStep(node);

      expect(roundTripped.id).toBe(minimalStep.id);
      expect(roundTripped.taskId).toBe(minimalStep.taskId);
      expect(roundTripped.stepIndex).toBe(minimalStep.stepIndex);
      expect(roundTripped.phase).toBe(minimalStep.phase);
      expect(roundTripped.status).toBe(minimalStep.status);
      expect(roundTripped.duration).toBe(minimalStep.duration);
    });
  });

  describe('Batch conversion functions', () => {
    const steps: StepRecord[] = [
      {
        id: '550e8400-e29b-41d4-a716-446655440010',
        taskId: '550e8400-e29b-41d4-a716-446655440000',
        stepIndex: 0,
        phase: 'observe',
        status: 'success',
        observation: 'First step',
        timestamp: '2026-01-01T00:00:00Z',
        duration: 100,
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440011',
        taskId: '550e8400-e29b-41d4-a716-446655440000',
        stepIndex: 1,
        phase: 'execute',
        status: 'success',
        action: { name: 'click', args: { selector: '#btn' } },
        timestamp: '2026-01-01T00:00:01Z',
        duration: 200,
      },
    ];

    it('convertStepsToNodes converts multiple steps', () => {
      const nodes = convertStepsToNodes(steps);
      expect(nodes).toHaveLength(2);
      expect(nodes[0].type).toBe('observation');
      expect(nodes[1].type).toBe('execution');
    });

    it('convertNodesToSteps converts multiple nodes', () => {
      const nodes: MaestroNode[] = [
        { type: 'observation', command: 'look', result: 'saw something' },
        { type: 'execution', command: 'click', result: 'clicked' },
      ];

      const convertedSteps = convertNodesToSteps(nodes);
      expect(convertedSteps).toHaveLength(2);
      expect(convertedSteps[0].phase).toBe('observe');
      expect(convertedSteps[1].phase).toBe('execute');
    });

    it('batch round-trip preserves count', () => {
      const nodes = convertStepsToNodes(steps);
      const roundTripped = convertNodesToSteps(nodes);
      expect(roundTripped).toHaveLength(steps.length);
    });
  });

  describe('MAESTRO_MCP_SERVER_INFO', () => {
    it('has correct server name', () => {
      expect(MAESTRO_MCP_SERVER_INFO.name).toBe('electronhound');
    });

    it('has correct version', () => {
      expect(MAESTRO_MCP_SERVER_INFO.version).toBe('0.3.0');
    });

    it('has tools capability enabled', () => {
      expect(MAESTRO_MCP_SERVER_INFO.capabilities.tools).toBe(true);
    });

    it('has resources and prompts disabled', () => {
      expect(MAESTRO_MCP_SERVER_INFO.capabilities.resources).toBe(false);
      expect(MAESTRO_MCP_SERVER_INFO.capabilities.prompts).toBe(false);
    });
  });
});
