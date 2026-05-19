import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { StepRecord } from '@eata/shared-types';
import StepTimeline from '../components/StepTimeline';

const mockStep = (overrides: Partial<StepRecord> = {}): StepRecord => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  taskId: '550e8400-e29b-41d4-a716-446655440001',
  stepIndex: 0,
  phase: 'observe',
  status: 'success',
  observation: 'Page loaded successfully',
  action: { name: 'click', args: { selector: '#login' } },
  timestamp: '2026-05-19T10:00:00Z',
  duration: 150,
  ...overrides,
});

describe('StepTimeline', () => {
  it('renders empty state when no steps', () => {
    render(<StepTimeline steps={[]} currentStepIndex={0} />);
    expect(screen.getByText('Waiting for steps...')).toBeInTheDocument();
  });

  it('renders step count and phase label', () => {
    const steps = [mockStep({ stepIndex: 0, phase: 'observe' })];
    render(<StepTimeline steps={steps} currentStepIndex={0} />);
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Observe')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    const steps = [mockStep({ status: 'success' })];
    render(<StepTimeline steps={steps} currentStepIndex={0} />);
    expect(screen.getByText('Pass')).toBeInTheDocument();
  });

  it('renders retry status correctly', () => {
    const steps = [mockStep({ status: 'retry' })];
    render(<StepTimeline steps={steps} currentStepIndex={0} />);
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('renders failed status correctly', () => {
    const steps = [mockStep({ status: 'failed' })];
    render(<StepTimeline steps={steps} currentStepIndex={0} />);
    expect(screen.getByText('Fail')).toBeInTheDocument();
  });

  it('renders skipped status correctly', () => {
    const steps = [mockStep({ status: 'skipped' })];
    render(<StepTimeline steps={steps} currentStepIndex={0} />);
    expect(screen.getByText('Skip')).toBeInTheDocument();
  });

  it('renders observation text', () => {
    const steps = [mockStep({ observation: 'Found login button' })];
    render(<StepTimeline steps={steps} currentStepIndex={0} />);
    expect(screen.getByText('Found login button')).toBeInTheDocument();
  });

  it('renders action name', () => {
    const steps = [mockStep({ action: { name: 'fill', args: { selector: '#email' } } })];
    render(<StepTimeline steps={steps} currentStepIndex={0} />);
    expect(screen.getByText('→ fill')).toBeInTheDocument();
  });

  it('renders duration', () => {
    const steps = [mockStep({ duration: 250 })];
    render(<StepTimeline steps={steps} currentStepIndex={0} />);
    expect(screen.getByText('250ms')).toBeInTheDocument();
  });

  it('shows running indicator for current step', () => {
    const steps = [
      mockStep({ id: 'step-a' }),
      mockStep({ id: 'step-b' }),
    ];
    render(<StepTimeline steps={steps} currentStepIndex={1} />);
    expect(screen.getByText('Running...')).toBeInTheDocument();
  });

  it('does not show running indicator when currentStepIndex is out of range', () => {
    const steps = [
      mockStep({ id: 'step-a' }),
      mockStep({ id: 'step-b' }),
    ];
    // -1 means no current step
    render(<StepTimeline steps={steps} currentStepIndex={-1} />);
    expect(screen.queryByText('Running...')).not.toBeInTheDocument();
  });

  it('renders all phases with correct labels', () => {
    const phases: StepRecord['phase'][] = ['observe', 'plan', 'execute', 'verify'];
    const labels = ['Observe', 'Plan', 'Execute', 'Verify'];

    phases.forEach((phase, i) => {
      const { unmount, getByText } = render(
        <StepTimeline steps={[mockStep({ phase })]} currentStepIndex={0} />
      );
      expect(getByText(labels[i])).toBeInTheDocument();
      unmount();
    });
  });

  it('renders multiple steps in order', () => {
    const steps = [
      mockStep({ stepIndex: 0, phase: 'observe', id: 'step-1' }),
      mockStep({ stepIndex: 1, phase: 'plan', id: 'step-2' }),
      mockStep({ stepIndex: 2, phase: 'execute', id: 'step-3' }),
    ];
    render(<StepTimeline steps={steps} currentStepIndex={2} />);
    expect(screen.getAllByText(/Step \d/)).toHaveLength(3);
  });
});
