import { describe, it, expect } from 'vitest';
import { generateHTMLReport } from '../services/htmlReport.js';
import type { Task, StepRecord } from '@eata/shared-types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    goal: 'Test the login form',
    targetAppPath: '/test/app',
    llmModel: 'gpt-4o',
    status: 'completed',
    maxSteps: 50,
    stepCount: 2,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:01:00Z',
    ...overrides,
  };
}

function makeStep(overrides: Partial<StepRecord> = {}): StepRecord {
  return {
    id: '550e8400-e29b-41d4-a716-446655440001',
    taskId: '550e8400-e29b-41d4-a716-446655440000',
    stepIndex: 0,
    phase: 'observe',
    status: 'success',
    timestamp: '2026-01-01T00:00:01Z',
    duration: 150,
    ...overrides,
  };
}

describe('generateHTMLReport', () => {
  it('generates valid HTML document', () => {
    const html = generateHTMLReport(makeTask(), []);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
  });

  it('includes task goal in header', () => {
    const html = generateHTMLReport(makeTask({ goal: 'Click the Settings button' }), []);
    expect(html).toContain('Click the Settings button');
  });

  it('includes task status badge', () => {
    const html = generateHTMLReport(makeTask({ status: 'completed' }), []);
    expect(html).toContain('completed');
  });

  it('includes task model info', () => {
    const html = generateHTMLReport(makeTask({ llmModel: 'gpt-4o-mini' }), []);
    expect(html).toContain('gpt-4o-mini');
  });

  it('includes step count', () => {
    const html = generateHTMLReport(makeTask({ stepCount: 5 }), []);
    expect(html).toContain('5');
  });

  it('renders steps in timeline', () => {
    const steps = [
      makeStep({ stepIndex: 0, phase: 'observe', status: 'success' }),
      makeStep({ stepIndex: 1, phase: 'plan', status: 'success', reasoning: 'Click button' }),
    ];
    const html = generateHTMLReport(makeTask(), steps);
    expect(html).toContain('Observe');
    expect(html).toContain('Plan');
  });

  it('renders step observation', () => {
    const steps = [makeStep({ observation: '<button>Submit</button>' })];
    const html = generateHTMLReport(makeTask(), steps);
    expect(html).toContain('Observation');
    expect(html).toContain('&lt;button&gt;Submit&lt;/button&gt;');
  });

  it('renders step action', () => {
    const steps = [makeStep({
      phase: 'execute',
      action: { name: 'browser_click', args: { selector: '#btn' } },
    })];
    const html = generateHTMLReport(makeTask(), steps);
    expect(html).toContain('Action');
    expect(html).toContain('browser_click');
  });

  it('renders step reasoning', () => {
    const steps = [makeStep({ reasoning: 'Need to click the button' })];
    const html = generateHTMLReport(makeTask(), steps);
    expect(html).toContain('Reasoning');
    expect(html).toContain('Need to click the button');
  });

  it('renders screenshot reference', () => {
    const steps = [makeStep({ screenshotPath: '/path/to/screenshot.png' })];
    const html = generateHTMLReport(makeTask(), steps);
    expect(html).toContain('Screenshot');
  });

  it('renders result summary when present', () => {
    const task = makeTask({
      resultSummary: { success: true, summary: 'All tests passed' },
    });
    const html = generateHTMLReport(task, []);
    expect(html).toContain('Result Summary');
    expect(html).toContain('All tests passed');
    expect(html).toContain('Yes');
  });

  it('renders error in result summary', () => {
    const task = makeTask({
      resultSummary: { success: false, summary: 'Failed', error: 'Timeout' },
    });
    const html = generateHTMLReport(task, []);
    expect(html).toContain('Timeout');
  });

  it('escapes HTML in goal', () => {
    const task = makeTask({ goal: '<script>alert("xss")</script>' });
    const html = generateHTMLReport(task, []);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML tags in observation', () => {
    const steps = [makeStep({ observation: '<img onerror="alert(1)">' })];
    const html = generateHTMLReport(makeTask(), steps);
    expect(html).toContain('&lt;img');
    expect(html).toContain('onerror=&quot;alert(1)&quot;');
  });

  it('shows "No steps recorded" when steps array is empty', () => {
    const html = generateHTMLReport(makeTask(), []);
    expect(html).toContain('No steps recorded');
  });

  it('formats duration in ms for short durations', () => {
    const steps = [makeStep({ duration: 500 })];
    const html = generateHTMLReport(makeTask(), steps);
    expect(html).toContain('500ms');
  });

  it('formats duration in seconds', () => {
    const steps = [makeStep({ duration: 3000 })];
    const html = generateHTMLReport(makeTask(), steps);
    expect(html).toContain('3.0s');
  });

  it('formats duration in minutes and seconds', () => {
    const steps = [makeStep({ duration: 125000 })];
    const html = generateHTMLReport(makeTask(), steps);
    expect(html).toContain('2m 5s');
  });

  it('handles different task statuses', () => {
    for (const status of ['queued', 'running', 'completed', 'failed', 'cancelled', 'aborted'] as const) {
      const html = generateHTMLReport(makeTask({ status }), []);
      expect(html).toContain(status);
    }
  });

  it('includes task ID in footer', () => {
    const html = generateHTMLReport(makeTask({ id: 'test-task-id-123' }), []);
    expect(html).toContain('test-task-id-123');
  });
});
