import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import CompareView from '../pages/CompareView';

// ─── Mocks ─────────────────────────────────────────────────────────────

const mockCompareDetailed = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    compare: {
      detailed: (...args: unknown[]) => mockCompareDetailed(...args),
    },
  },
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

// ─── Helpers ───────────────────────────────────────────────────────────

function makeDetailedResponse(overrides: Record<string, unknown> = {}) {
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
    summary: {
      taskA: {
        totalSteps: 5,
        passedSteps: 3,
        failedSteps: 1,
        retriedSteps: 1,
        totalDuration: 5000,
      },
      taskB: {
        totalSteps: 6,
        passedSteps: 4,
        failedSteps: 2,
        retriedSteps: 0,
        totalDuration: 7200,
      },
    },
    actionFrequency: {
      taskA: { click: 3, type: 2 },
      taskB: { click: 4, type: 1, navigate: 1 },
    },
    timelineDiff: [
      {
        stepIndex: 0,
        phase: 'observe',
        taskAStatus: 'success',
        taskBStatus: 'success',
        taskADuration: 100,
        taskBDuration: 120,
        changed: false,
      },
      {
        stepIndex: 1,
        phase: 'verify',
        taskAStatus: 'success',
        taskBStatus: 'failed',
        taskADuration: 200,
        taskBDuration: 300,
        changed: true,
      },
    ],
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
      expect(
        screen.getByText('Please enter both task IDs'),
      ).toBeInTheDocument();
    });

    expect(mockCompareDetailed).not.toHaveBeenCalled();
  });

  it('calls compare detailed API and displays results on success', async () => {
    mockCompareDetailed.mockResolvedValue(
      makeDetailedResponse({
        diff: {
          newFailures: [
            {
              stepIndex: 1,
              phase: 'verify',
              message: 'Verify step 1 went from pass to fail',
            },
          ],
          fixedIssues: [
            {
              stepIndex: 2,
              phase: 'verify',
              message: 'Verify step 2 went from fail to pass',
            },
          ],
          planChanges: [
            { stepIndex: 0, message: 'Plan step 0 action changed' },
          ],
          unchangedCount: 5,
        },
      }),
    );

    render(<CompareView />);

    fireEvent.change(screen.getByLabelText('Task A ID'), {
      target: { value: 'aaa-111' },
    });
    fireEvent.change(screen.getByLabelText('Task B ID'), {
      target: { value: 'bbb-222' },
    });
    fireEvent.click(screen.getByText('Compare'));

    await waitFor(() => {
      expect(screen.getAllByText('New Failures').length).toBeGreaterThanOrEqual(
        1,
      );
      expect(
        screen.getAllByText('Fixed Issues').length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        screen.getAllByText('Plan Changes').length,
      ).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Unchanged')).toBeInTheDocument();
      expect(
        screen.getByText('Verify step 1 went from pass to fail'),
      ).toBeInTheDocument();
    });

    expect(mockCompareDetailed).toHaveBeenCalledWith(['aaa-111', 'bbb-222']);
  });

  it('displays error state when comparison fails', async () => {
    mockCompareDetailed.mockRejectedValue(
      new Error('Task not found: aaa-111'),
    );

    render(<CompareView />);

    fireEvent.change(screen.getByLabelText('Task A ID'), {
      target: { value: 'aaa-111' },
    });
    fireEvent.change(screen.getByLabelText('Task B ID'), {
      target: { value: 'bbb-222' },
    });
    fireEvent.click(screen.getByText('Compare'));

    await waitFor(() => {
      expect(
        screen.getByText('Task not found: aaa-111'),
      ).toBeInTheDocument();
    });
  });

  it('shows loading state while comparing', async () => {
    let resolveCompare: (value: unknown) => void;
    mockCompareDetailed.mockReturnValue(
      new Promise((resolve) => {
        resolveCompare = resolve;
      }),
    );

    render(<CompareView />);

    fireEvent.change(screen.getByLabelText('Task A ID'), {
      target: { value: 'aaa-111' },
    });
    fireEvent.change(screen.getByLabelText('Task B ID'), {
      target: { value: 'bbb-222' },
    });
    fireEvent.click(screen.getByText('Compare'));

    await waitFor(() => {
      expect(screen.getByText('Comparing...')).toBeInTheDocument();
    });

    resolveCompare!(makeDetailedResponse());

    await waitFor(() => {
      expect(screen.queryByText('Comparing...')).not.toBeInTheDocument();
    });
  });

  it('renders status summary card with step counts', async () => {
    mockCompareDetailed.mockResolvedValue(makeDetailedResponse());

    render(<CompareView />);

    fireEvent.change(screen.getByLabelText('Task A ID'), {
      target: { value: 'aaa-111' },
    });
    fireEvent.change(screen.getByLabelText('Task B ID'), {
      target: { value: 'bbb-222' },
    });
    fireEvent.click(screen.getByText('Compare'));

    await waitFor(() => {
      expect(screen.getByText('Status Summary')).toBeInTheDocument();
      // Task A summary
      expect(screen.getByText('5')).toBeInTheDocument(); // totalSteps for task A
      expect(screen.getByText('3')).toBeInTheDocument(); // passedSteps for task A
      expect(screen.getByText('6')).toBeInTheDocument(); // totalSteps for task B
      // Duration
      expect(screen.getByText('Duration: 5.0s')).toBeInTheDocument();
      expect(screen.getByText('Duration: 7.2s')).toBeInTheDocument();
    });
  });

  it('renders step timeline diff table', async () => {
    mockCompareDetailed.mockResolvedValue(makeDetailedResponse());

    render(<CompareView />);

    fireEvent.change(screen.getByLabelText('Task A ID'), {
      target: { value: 'aaa-111' },
    });
    fireEvent.change(screen.getByLabelText('Task B ID'), {
      target: { value: 'bbb-222' },
    });
    fireEvent.click(screen.getByText('Compare'));

    await waitFor(() => {
      expect(screen.getByText('Step Timeline Diff')).toBeInTheDocument();
      // Table headers
      expect(screen.getByText('Step')).toBeInTheDocument();
      expect(screen.getByText('Phase')).toBeInTheDocument();
      expect(screen.getByText('Task A Status')).toBeInTheDocument();
      expect(screen.getByText('Task B Status')).toBeInTheDocument();
      // Step data
      expect(screen.getByText('observe')).toBeInTheDocument();
      expect(screen.getByText('verify')).toBeInTheDocument();
    });
  });

  it('renders action frequency chart', async () => {
    mockCompareDetailed.mockResolvedValue(makeDetailedResponse());

    render(<CompareView />);

    fireEvent.change(screen.getByLabelText('Task A ID'), {
      target: { value: 'aaa-111' },
    });
    fireEvent.change(screen.getByLabelText('Task B ID'), {
      target: { value: 'bbb-222' },
    });
    fireEvent.click(screen.getByText('Compare'));

    await waitFor(() => {
      expect(screen.getByText('Action Frequency')).toBeInTheDocument();
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });
  });

  it('highlights changed steps in timeline diff', async () => {
    mockCompareDetailed.mockResolvedValue(makeDetailedResponse());

    render(<CompareView />);

    fireEvent.change(screen.getByLabelText('Task A ID'), {
      target: { value: 'aaa-111' },
    });
    fireEvent.change(screen.getByLabelText('Task B ID'), {
      target: { value: 'bbb-222' },
    });
    fireEvent.click(screen.getByText('Compare'));

    await waitFor(() => {
      // The changed row should have the "Changed" badge
      const changedBadges = screen.getAllByText('Changed');
      // There's one changed entry in the mock data, plus the header column
      expect(changedBadges.length).toBeGreaterThanOrEqual(1);
    });
  });
});
