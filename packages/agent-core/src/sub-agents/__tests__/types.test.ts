import { describe, it, expect } from 'vitest';
import type {
  SubAgentRole,
  SubAgentInput,
  SubAgentOutput,
  AuditReport,
  AuditFinding,
  AuditChainResult,
} from '../types.js';

describe('sub-agent types', () => {
  const makeOutput = (role: SubAgentRole): SubAgentOutput => ({
    role,
    auditReport: {
      severity: 'pass',
      summary: `${role} summary`,
      findings: [],
      timestamp: new Date().toISOString(),
    },
    analysis: 'analysis text',
    recommendations: [],
  });

  describe('SubAgentRole', () => {
    it('accepts all 4 valid roles', () => {
      const roles: SubAgentRole[] = [
        'test-planner',
        'execution-analyst',
        'security-reviewer',
        'report-synthesizer',
      ];
      expect(roles).toHaveLength(4);
    });
  });

  describe('SubAgentInput', () => {
    it('requires goal, targetAppPath, and context', () => {
      const input: SubAgentInput = {
        goal: 'Test login flow',
        targetAppPath: '/path/to/app',
        context: { userId: '123' },
      };
      expect(input.goal).toBe('Test login flow');
      expect(input.context).toHaveProperty('userId');
    });

    it('context accepts empty object', () => {
      const input: SubAgentInput = {
        goal: 'g',
        targetAppPath: '/app',
        context: {},
      };
      expect(input.context).toEqual({});
    });
  });

  describe('SubAgentOutput', () => {
    it('carries role and auditReport', () => {
      const output = makeOutput('security-reviewer');
      expect(output.role).toBe('security-reviewer');
      expect(output.auditReport.severity).toBe('pass');
    });

    it('recommendations can be non-empty', () => {
      const output: SubAgentOutput = {
        ...makeOutput('test-planner'),
        recommendations: ['Add retry logic', 'Cover edge case'],
      };
      expect(output.recommendations).toHaveLength(2);
    });
  });

  describe('AuditReport', () => {
    it('accepts all severity levels', () => {
      const severities: AuditReport['severity'][] = ['pass', 'warn', 'fail', 'info'];
      expect(severities).toHaveLength(4);
    });

    it('findings can contain evidence', () => {
      const finding: AuditFinding = {
        category: 'security',
        description: 'XSS in input field',
        severity: 'fail',
        evidence: '<script>alert(1)</script>',
      };
      expect(finding.evidence).toContain('script');
    });
  });

  describe('AuditChainResult', () => {
    it('aggregates all 4 role outputs', () => {
      const result: AuditChainResult = {
        goal: 'Test dashboard',
        testPlanner: makeOutput('test-planner'),
        executionAnalyst: makeOutput('execution-analyst'),
        securityReviewer: makeOutput('security-reviewer'),
        reportSynthesizer: makeOutput('report-synthesizer'),
        chainOrder: [
          'test-planner',
          'execution-analyst',
          'security-reviewer',
          'report-synthesizer',
        ],
        durationMs: 1234,
        completedAt: new Date().toISOString(),
      };
      expect(result.chainOrder).toHaveLength(4);
      expect(result.testPlanner.role).toBe('test-planner');
      expect(result.securityReviewer.role).toBe('security-reviewer');
    });
  });
});
