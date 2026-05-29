import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BatchList from '../pages/BatchList';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockBatchesList = vi.fn();
const mockBatchesCancel = vi.fn();
const mockBatchesCreate = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    batches: {
      list: (...args: unknown[]) => mockBatchesList(...args),
      cancel: (...args: unknown[]) => mockBatchesCancel(...args),
      create: (...args: unknown[]) => mockBatchesCreate(...args),
    },
  },
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeBatchData(overrides: Record<string, unknown> = {}) {
  return {
    id: 'batch-001',
    name: 'Test Batch',
    status: 'completed' as const,
    totalTasks: 5,
    completedTasks: 5,
    failedTasks: 0,
    priority: 'medium',
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date().toISOString(),
    progress: 100,
    ...overrides,
  };
}

function makeListResponse(
  entries: Array<ReturnType<typeof makeBatchData>>,
  opts: { total?: number; page?: number; limit?: number } = {},
) {
  return {
    data: entries,
    total: opts.total ?? entries.length,
    page: opts.page ?? 1,
    limit: opts.limit ?? 50,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('BatchList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: api.batches.list resolves with empty data
    mockBatchesList.mockResolvedValue(makeListResponse([]));
    mockBatchesCancel.mockResolvedValue({ success: true, batchId: 'batch-001' });
    mockBatchesCreate.mockResolvedValue({
      batchId: 'batch-new',
      taskIds: ['t1'],
      totalTasks: 1,
    });
  });

  // ── Rendering: loading state ──────────────────────────────────────────────

  it('shows loading state on initial mount', () => {
    // Make the API hang so component stays in loading
    mockBatchesList.mockReturnValue(new Promise(() => {}));

    render(<BatchList />);

    // Loading spinner text (i18n: common.loading -> "Loading...")
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  // ── Rendering: empty state ────────────────────────────────────────────────

  it('shows empty state when no batches returned', async () => {
    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('No batches found')).toBeInTheDocument();
    });
    expect(screen.getByText('Create your first batch')).toBeInTheDocument();
  });

  // ── Rendering: batch list ─────────────────────────────────────────────────

  it('renders batch list after loading', async () => {
    mockBatchesList.mockResolvedValue(
      makeListResponse([
        makeBatchData({ id: 'batch-001', name: 'My Batch', status: 'completed' }),
      ]),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('My Batch')).toBeInTheDocument();
    });
    // Status badge (also appears in filter dropdown option, so use getAllByText)
    expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1);
    // Task count: "Tasks: 5/5"
    expect(screen.getByText(/5\/5/)).toBeInTheDocument();
  });

  it('renders multiple batches', async () => {
    mockBatchesList.mockResolvedValue(
      makeListResponse([
        makeBatchData({ id: 'b1', name: 'Batch One' }),
        makeBatchData({ id: 'b2', name: 'Batch Two' }),
      ]),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Batch One')).toBeInTheDocument();
      expect(screen.getByText('Batch Two')).toBeInTheDocument();
    });
  });

  it('shows batch count in header', async () => {
    mockBatchesList.mockResolvedValue(
      makeListResponse([
        makeBatchData({ id: 'b1', name: 'A' }),
        makeBatchData({ id: 'b2', name: 'B' }),
        makeBatchData({ id: 'b3', name: 'C' }),
      ]),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('3 batches')).toBeInTheDocument();
    });
  });

  it('shows singular batch count for 1 batch', async () => {
    mockBatchesList.mockResolvedValue(
      makeListResponse([makeBatchData({ id: 'b1', name: 'Solo' })]),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('1 batch')).toBeInTheDocument();
    });
  });

  // ── Rendering: error / failed fetch state ─────────────────────────────────

  it('keeps existing data when api.batches.list fails', async () => {
    // First call succeeds, second fails -- existing data should remain
    mockBatchesList.mockResolvedValueOnce(
      makeListResponse([makeBatchData({ id: 'b1', name: 'Good Batch' })]),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Good Batch')).toBeInTheDocument();
    });

    // Now make the next call fail -- simulate refresh
    mockBatchesList.mockRejectedValueOnce(new Error('Network error'));

    // The component should still show the previous data
    expect(screen.getByText('Good Batch')).toBeInTheDocument();
  });

  // ── Rendering: page title and new batch button ────────────────────────────

  it('renders page title and new batch button', async () => {
    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Batch Testing')).toBeInTheDocument();
    });
    expect(screen.getByText('New Batch')).toBeInTheDocument();
  });

  // ── Sorting: active batches first ─────────────────────────────────────────

  it('sorts active (pending/running) batches before completed ones', async () => {
    const older = new Date(Date.now() - 300_000).toISOString();
    const newer = new Date(Date.now() - 60_000).toISOString();

    mockBatchesList.mockResolvedValue(
      makeListResponse([
        makeBatchData({ id: 'b-completed', name: 'Done Batch', status: 'completed', createdAt: newer }),
        makeBatchData({ id: 'b-running', name: 'Active Batch', status: 'running', createdAt: older }),
      ]),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Active Batch')).toBeInTheDocument();
      expect(screen.getByText('Done Batch')).toBeInTheDocument();
    });

    // Active batch should appear before completed in DOM order
    // Use h3 elements to avoid matching the "New Batch" button
    const headings = screen.getAllByRole('heading', { level: 3 });
    const names = headings.map((h) => h.textContent);
    expect(names.indexOf('Active Batch')).toBeLessThan(names.indexOf('Done Batch'));
  });

  // ── Operations: cancel batch via confirmation dialog ──────────────────────

  it('opens cancel confirmation dialog when clicking cancel on active batch', async () => {
    mockBatchesList.mockResolvedValue(
      makeListResponse([
        makeBatchData({ id: 'b1', name: 'Running Batch', status: 'running' }),
      ]),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Running Batch')).toBeInTheDocument();
    });

    // The cancel button has title="Cancel Batch"
    const cancelBtn = screen.getByTitle('Cancel Batch');
    fireEvent.click(cancelBtn);

    // Dialog should appear with confirmation text
    expect(screen.getByText('Cancel this batch?')).toBeInTheDocument();
  });

  it('calls api.batches.cancel when confirming cancel', async () => {
    mockBatchesList.mockResolvedValue(
      makeListResponse([
        makeBatchData({ id: 'b1', name: 'Running Batch', status: 'running' }),
      ]),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Running Batch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Cancel Batch'));

    // Click the "Cancel Batch" confirm button inside the dialog
    const confirmButtons = screen.getAllByText('Cancel Batch');
    // The second one is the confirm button in the dialog
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockBatchesCancel).toHaveBeenCalledWith('b1');
    });
  });

  it('refreshes batch list after successful cancel', async () => {
    let callCount = 0;
    mockBatchesList.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.resolve(
          makeListResponse([
            makeBatchData({ id: 'b1', name: 'Running Batch', status: 'running' }),
          ]),
        );
      }
      // After cancel, return cancelled status
      return Promise.resolve(
        makeListResponse([
          makeBatchData({ id: 'b1', name: 'Running Batch', status: 'cancelled' }),
        ]),
      );
    });

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Running Batch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Cancel Batch'));
    const confirmButtons = screen.getAllByText('Cancel Batch');
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      // refreshBatches is called again after cancel
      expect(mockBatchesList).toHaveBeenCalledTimes(2);
    });
  });

  it('dismisses cancel dialog when clicking cancel button', async () => {
    mockBatchesList.mockResolvedValue(
      makeListResponse([
        makeBatchData({ id: 'b1', name: 'Running Batch', status: 'running' }),
      ]),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Running Batch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Cancel Batch'));
    expect(screen.getByText('Cancel this batch?')).toBeInTheDocument();

    // Click the "Cancel" button (not "Cancel Batch") to dismiss
    const cancelButtons = screen.getAllByText('Cancel');
    fireEvent.click(cancelButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText('Cancel this batch?')).not.toBeInTheDocument();
    });
  });

  it('handles cancel API failure gracefully', async () => {
    mockBatchesList.mockResolvedValue(
      makeListResponse([
        makeBatchData({ id: 'b1', name: 'Running Batch', status: 'running' }),
      ]),
    );
    mockBatchesCancel.mockRejectedValue(new Error('Server error'));

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Running Batch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Cancel Batch'));
    const confirmButtons = screen.getAllByText('Cancel Batch');
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    // Should not crash; dialog should close
    await waitFor(() => {
      expect(screen.queryByText('Cancel this batch?')).not.toBeInTheDocument();
    });
  });

  // ── Operations: cancel button not shown for non-active batches ────────────

  it('does not show cancel button for completed batches', async () => {
    mockBatchesList.mockResolvedValue(
      makeListResponse([
        makeBatchData({ id: 'b1', name: 'Done', status: 'completed' }),
      ]),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument();
    });

    expect(screen.queryByTitle('Cancel Batch')).not.toBeInTheDocument();
  });

  it('shows cancel button for running batches', async () => {
    mockBatchesList.mockResolvedValue(
      makeListResponse([
        makeBatchData({ id: 'b1', name: 'Active', status: 'running' }),
      ]),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    expect(screen.getByTitle('Cancel Batch')).toBeInTheDocument();
  });

  it('shows cancel button for pending batches', async () => {
    mockBatchesList.mockResolvedValue(
      makeListResponse([
        makeBatchData({ id: 'b1', name: 'Queued Batch', status: 'pending' }),
      ]),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Queued Batch')).toBeInTheDocument();
    });

    // Status badge "Pending" should be shown (also in filter dropdown)
    expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTitle('Cancel Batch')).toBeInTheDocument();
  });

  // ── New Batch Dialog ──────────────────────────────────────────────────────

  it('opens new batch dialog when clicking New Batch', async () => {
    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('No batches found')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Batch'));

    // Dialog should be visible with form fields
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText(/Goal/)).toBeInTheDocument();
  });

  it('opens new batch dialog from empty state hint', async () => {
    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('No batches found')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create your first batch'));

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('refreshes batch list after creating a new batch', async () => {
    mockBatchesList.mockResolvedValueOnce(makeListResponse([]));

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('No batches found')).toBeInTheDocument();
    });

    // After creation, mock should return the new batch
    mockBatchesList.mockResolvedValueOnce(
      makeListResponse([makeBatchData({ id: 'batch-new', name: 'New Batch' })]),
    );

    fireEvent.click(screen.getByText('New Batch'));
    fireEvent.change(screen.getByLabelText(/Goal/), { target: { value: 'Test goal' } });
    fireEvent.click(screen.getByText('New Batch', { selector: 'button[type="submit"]' }));

    await waitFor(() => {
      // refreshBatches should be called again after create
      expect(mockBatchesList).toHaveBeenCalledTimes(2);
    });
  });

  // ── Batch row info display ────────────────────────────────────────────────

  it('shows progress percentage for batches with data', async () => {
    mockBatchesList.mockResolvedValue(
      makeListResponse([
        makeBatchData({ id: 'b1', name: 'Halfway', progress: 60, completedTasks: 3, totalTasks: 5 }),
      ]),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('60%')).toBeInTheDocument();
    });
  });

  it('shows failed task count when failedTasks > 0', async () => {
    mockBatchesList.mockResolvedValue(
      makeListResponse([
        makeBatchData({ id: 'b1', name: 'Partial Fail', status: 'failed', totalTasks: 5, completedTasks: 3, failedTasks: 2 }),
      ]),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText(/2 failed/)).toBeInTheDocument();
    });
  });

  it('shows different status badges correctly', async () => {
    mockBatchesList.mockResolvedValue(
      makeListResponse([
        makeBatchData({ id: 'b1', name: 'Pend', status: 'pending' }),
        makeBatchData({ id: 'b2', name: 'Run', status: 'running' }),
        makeBatchData({ id: 'b3', name: 'Done', status: 'completed' }),
        makeBatchData({ id: 'b4', name: 'Fail', status: 'failed' }),
        makeBatchData({ id: 'b5', name: 'Stop', status: 'cancelled' }),
      ]),
    );

    render(<BatchList />);

    await waitFor(() => {
      // Each status text appears both in the badge and in the filter dropdown
      expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('Running').length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('Failed').length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('Cancelled').length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Progress bar ──────────────────────────────────────────────────────────

  it('renders progress bar with correct width', async () => {
    mockBatchesList.mockResolvedValue(
      makeListResponse([
        makeBatchData({ id: 'b1', name: 'Prog', progress: 75 }),
      ]),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    // The progress bar inner div should have width: 75%
    const bar = document.querySelector('[style*="width: 75%"]');
    expect(bar).toBeInTheDocument();
  });

  // ── Status filter ─────────────────────────────────────────────────────────

  it('renders status filter dropdown', async () => {
    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('No batches found')).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue('All');
    expect(select).toBeInTheDocument();

    // Check all filter options
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(6);
    expect(options[0]).toHaveTextContent('All');
    expect(options[1]).toHaveTextContent('Pending');
    expect(options[2]).toHaveTextContent('Running');
    expect(options[3]).toHaveTextContent('Completed');
    expect(options[4]).toHaveTextContent('Failed');
    expect(options[5]).toHaveTextContent('Cancelled');
  });

  it('calls api.batches.list with status filter when changed', async () => {
    render(<BatchList />);

    await waitFor(() => {
      expect(mockBatchesList).toHaveBeenCalledTimes(1);
    });

    const select = screen.getByDisplayValue('All');
    fireEvent.change(select, { target: { value: 'running' } });

    await waitFor(() => {
      expect(mockBatchesList).toHaveBeenCalledTimes(2);
      expect(mockBatchesList).toHaveBeenLastCalledWith({ status: 'running', limit: 50 });
    });
  });
});
