import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import CompareView from '../pages/CompareView';

// ─── Mocks ─────────────────────────────────────────────────────────────

const mockCompareRun = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    compare: {
      run: (...args: unknown[]) => mockCompareRun(...args),
    },
  },
}));

// ─── Helpers ───────────────────────────────────────────────────────────

function makeCompareResponse(overrides: Record<string, unknown> = {}) {
  return {
    taskA: { id: 'aaa-111', goal: 'Test login', status: 'completed' },
    taskB: { id: 'bbb-222', goal: 'Test login', status: 'completed' },
    stepsA: [],
    stepsB: [],
    diff: {
      newFailures: [],
      fixedIssues: [],
      planChanges: [],
      unchangedCount: 0,
    },
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('CompareView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the page with input fields and compare button', () => {
    render(<CompareView />);

    expect(screen.getByText('Compare Tasks')).toBeInTheDocument();
    expect(screen.getByLabelText('Task A ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Task B ID')).toBeInTheDocument();
    expect(screen.getByText('Compare')).toBeInTheDocument();
  });

  it('shows error when submitting with empty fields', async () => {
    render(<CompareView />);

    fireEvent.click(screen.getByText('Compare'));

    await waitFor(() => {
      expect(screen.getByText('Please enter both task IDs')).toBeInTheDocument();
    });

    expect(mockCompareRun).not.toHaveBeenCalled();
  });

  it('calls compare API and displays results on success', async () => {
    mockCompareRun.mockResolvedValue(
      makeCompareResponse({
        diff: {
          newFailures: [{ stepIndex: 1, phase: 'verify', message: 'Verify step 1 went from pass to fail' }],
          fixedIssues: [{ stepIndex: 2, phase: 'verify', message: 'Verify step 2 went from fail to pass' }],
          planChanges: [{ stepIndex: 0, message: 'Plan step 0 action changed' }],
          unchangedCount: 5,
        },
      }),
    );

    render(<CompareView />);

    fireEvent.change(screen.getByLabelText('Task A ID'), { target: { value: 'aaa-111' } });
    fireEvent.change(screen.getByLabelText('Task B ID'), { target: { value: 'bbb-222' } });
    fireEvent.click(screen.getByText('Compare'));

    await waitFor(() => {
      expect(screen.getAllByText('New Failures').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Fixed Issues').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Plan Changes').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Unchanged')).toBeInTheDocument();
      expect(screen.getByText('Verify step 1 went from pass to fail')).toBeInTheDocument();
    });

    // Verify the counts are rendered (multiple "1" elements expected for newFailures, fixedIssues, planChanges)
    const countElements = screen.getAllByText('1');
    expect(countElements.length).toBeGreaterThanOrEqual(3); // newFailures, fixedIssues, planChanges all have count 1

    expect(mockCompareRun).toHaveBeenCalledWith(['aaa-111', 'bbb-222']);
  });

  it('displays error state when comparison fails', async () => {
    mockCompareRun.mockRejectedValue(new Error('Task not found: aaa-111'));

    render(<CompareView />);

    fireEvent.change(screen.getByLabelText('Task A ID'), { target: { value: 'aaa-111' } });
    fireEvent.change(screen.getByLabelText('Task B ID'), { target: { value: 'bbb-222' } });
    fireEvent.click(screen.getByText('Compare'));

    await waitFor(() => {
      expect(screen.getByText('Task not found: aaa-111')).toBeInTheDocument();
    });
  });

  it('shows loading state while comparing', async () => {
    let resolveCompare: (value: unknown) => void;
    mockCompareRun.mockReturnValue(
      new Promise((resolve) => {
        resolveCompare = resolve;
      }),
    );

    render(<CompareView />);

    fireEvent.change(screen.getByLabelText('Task A ID'), { target: { value: 'aaa-111' } });
    fireEvent.change(screen.getByLabelText('Task B ID'), { target: { value: 'bbb-222' } });
    fireEvent.click(screen.getByText('Compare'));

    await waitFor(() => {
      expect(screen.getByText('Comparing...')).toBeInTheDocument();
    });

    resolveCompare!(makeCompareResponse());

    await waitFor(() => {
      expect(screen.queryByText('Comparing...')).not.toBeInTheDocument();
    });
  });
});
