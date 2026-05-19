import { describe, it, expect } from 'vitest';
import {
  guardObservation,
  guardPlan,
  guardExecResult,
  guardVerdict,
  GuardError,
} from '../guards.js';

describe('guards', () => {
  describe('guardObservation', () => {
    const validObservation = {
      ariaTree: '<div>test</div>',
      pageTitle: 'Test Page',
      url: 'http://localhost',
      timestamp: new Date().toISOString(),
    };

    it('accepts valid observation', () => {
      const result = guardObservation(validObservation);
      expect(result.ariaTree).toBe('<div>test</div>');
      expect(result.pageTitle).toBe('Test Page');
    });

    it('rejects missing ariaTree', () => {
      expect(() =>
        guardObservation({ pageTitle: 'x', url: '', timestamp: new Date().toISOString() }),
      ).toThrow(GuardError);
    });

    it('rejects null', () => {
      expect(() => guardObservation(null)).toThrow(GuardError);
    });

    it('rejects non-object', () => {
      expect(() => guardObservation('string')).toThrow(GuardError);
    });
  });

  describe('guardPlan', () => {
    const validPlan = {
      reasoning: 'Click the Settings button',
      toolCall: { name: 'browser_click', args: { element: 'Settings' } },
      expectedOutcome: 'Settings page opens',
    };

    it('accepts valid plan', () => {
      const result = guardPlan(validPlan);
      expect(result.reasoning).toContain('Settings');
      expect(result.toolCall.name).toBe('browser_click');
    });

    it('rejects missing toolCall', () => {
      expect(() =>
        guardPlan({ reasoning: 'x', expectedOutcome: 'y' }),
      ).toThrow(GuardError);
    });

    it('rejects missing reasoning field', () => {
      expect(() =>
        guardPlan({ toolCall: { name: 'a', args: {} }, expectedOutcome: 'y' }),
      ).toThrow(GuardError);
    });
  });

  describe('guardExecResult', () => {
    it('accepts successful result', () => {
      const result = guardExecResult({ success: true, result: 'done' });
      expect(result.success).toBe(true);
    });

    it('accepts failed result', () => {
      const result = guardExecResult({ success: false, result: 'error' });
      expect(result.success).toBe(false);
    });

    it('rejects missing success field', () => {
      expect(() => guardExecResult({ result: 'x' })).toThrow(GuardError);
    });
  });

  describe('guardVerdict', () => {
    it('accepts pass verdict', () => {
      const result = guardVerdict({ verdict: 'pass', reasoning: 'all good' });
      expect(result.verdict).toBe('pass');
    });

    it('accepts retry verdict', () => {
      const result = guardVerdict({ verdict: 'retry', reasoning: 'try again' });
      expect(result.verdict).toBe('retry');
    });

    it('accepts fail verdict', () => {
      const result = guardVerdict({ verdict: 'fail', reasoning: 'bad' });
      expect(result.verdict).toBe('fail');
    });

    it('accepts escalate verdict', () => {
      const result = guardVerdict({ verdict: 'escalate', reasoning: 'need help' });
      expect(result.verdict).toBe('escalate');
    });

    it('rejects invalid verdict value', () => {
      expect(() => guardVerdict({ verdict: 'unknown', reasoning: '?' })).toThrow(GuardError);
    });

    it('rejects missing reasoning', () => {
      expect(() => guardVerdict({ verdict: 'pass' })).toThrow(GuardError);
    });
  });
});
