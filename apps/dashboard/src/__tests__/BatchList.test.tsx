import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BatchList from '../pages/BatchList';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockBatchesGet = vi.fn();
const mockBatchesCancel = vi.fn();
const mockBatchesCreate = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    batches: {
      get: (...args: unknown[]) => mockBatchesGet(...args),
      cancel: (...args: unknown[]) => mockBatchesCancel(...args),
      create: (...args: unknown[]) => mockBatchesCreate(...args),
    },
  },
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'eata-batches';

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

function seedLocalStorage(
  entries: Array<{ batchId: string; name: string | null; createdAt: string }>,
) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('BatchList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default: api.batches.get resolves with valid data
    mockBatchesGet.mockResolvedValue(makeBatchData());
    mockBatchesCancel.mockResolvedValue({ success: true, batchId: 'batch-001' });
    mockBatchesCreate.mockResolvedValue({
      batchId: 'batch-new',
      taskIds: ['t1'],
      totalTasks: 1,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ── Rendering: loading state ──────────────────────────────────────────────

  it('shows loading state on initial mount', () => {
    // Make the API hang so component stays in loading
    mockBatchesGet.mockReturnValue(new Promise(() => {}));
    seedLocalStorage([
      { batchId: 'batch-001', name: 'A', createdAt: new Date().toISOString() },
    ]);

    render(<BatchList />);

    // Loading spinner text (i18n: common.loading -> "Loading...")
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  // ── Rendering: empty state ────────────────────────────────────────────────

  it('shows empty state when no batches stored', async () => {
    // No localStorage entries
    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('No batches found')).toBeInTheDocument();
    });
    expect(screen.getByText('Create your first batch')).toBeInTheDocument();
  });

  // ── Rendering: batch list ─────────────────────────────────────────────────

  it('renders batch list after loading', async () => {
    const createdAt = new Date(Date.now() - 120_000).toISOString();
    seedLocalStorage([
      { batchId: 'batch-001', name: 'My Batch', createdAt },
    ]);
    mockBatchesGet.mockResolvedValue(
      makeBatchData({ id: 'batch-001', name: 'My Batch', status: 'completed' }),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('My Batch')).toBeInTheDocument();
    });
    // Status badge
    expect(screen.getByText('Completed')).toBeInTheDocument();
    // Task count: "Tasks: 5/5"
    expect(screen.getByText(/5\/5/)).toBeInTheDocument();
  });

  it('renders multiple batches', async () => {
    const now = new Date().toISOString();
    seedLocalStorage([
      { batchId: 'b1', name: 'Batch One', createdAt: now },
      { batchId: 'b2', name: 'Batch Two', createdAt: now },
    ]);
    mockBatchesGet.mockImplementation((id: string) =>
      Promise.resolve(
        makeBatchData({ id, name: id === 'b1' ? 'Batch One' : 'Batch Two' }),
      ),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Batch One')).toBeInTheDocument();
      expect(screen.getByText('Batch Two')).toBeInTheDocument();
    });
  });

  it('shows batch count in header', async () => {
    const now = new Date().toISOString();
    seedLocalStorage([
      { batchId: 'b1', name: 'A', createdAt: now },
      { batchId: 'b2', name: 'B', createdAt: now },
      { batchId: 'b3', name: 'C', createdAt: now },
    ]);
    mockBatchesGet.mockImplementation((id: string) =>
      Promise.resolve(makeBatchData({ id })),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('3 batches')).toBeInTheDocument();
    });
  });

  it('shows singular batch count for 1 batch', async () => {
    seedLocalStorage([
      { batchId: 'b1', name: 'Solo', createdAt: new Date().toISOString() },
    ]);
    mockBatchesGet.mockResolvedValue(makeBatchData({ id: 'b1', name: 'Solo' }));

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('1 batch')).toBeInTheDocument();
    });
  });

  // ── Rendering: error / failed fetch state ─────────────────────────────────

  it('shows fallback row when api.batches.get fails for a batch', async () => {
    seedLocalStorage([
      { batchId: 'batch-001', name: 'Broken Batch', createdAt: new Date().toISOString() },
    ]);
    mockBatchesGet.mockRejectedValue(new Error('Network error'));

    render(<BatchList />);

    // The component catches the error and still renders the stored entry
    // with minimal info (name from stored entry, no data-dependent UI)
    await waitFor(() => {
      expect(screen.getByText('Broken Batch')).toBeInTheDocument();
    });
  });

  it('uses batchId prefix when stored name is null and data fetch fails', async () => {
    const batchId = '550e8400-e29b-41d4-a716-446655440000';
    seedLocalStorage([
      { batchId, name: null, createdAt: new Date().toISOString() },
    ]);
    mockBatchesGet.mockRejectedValue(new Error('fail'));

    render(<BatchList />);

    await waitFor(() => {
      // Falls back to batchId.slice(0, 8)
      expect(screen.getByText(batchId.slice(0, 8))).toBeInTheDocument();
    });
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

    // Store order: completed first, then running
    seedLocalStorage([
      { batchId: 'b-completed', name: 'Done Batch', createdAt: newer },
      { batchId: 'b-running', name: 'Active Batch', createdAt: older },
    ]);
    mockBatchesGet.mockImplementation((id: string) => {
      if (id === 'b-completed') return Promise.resolve(makeBatchData({ id, name: 'Done Batch', status: 'completed' }));
      return Promise.resolve(makeBatchData({ id, name: 'Active Batch', status: 'running' }));
    });

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
    seedLocalStorage([
      { batchId: 'b1', name: 'Running Batch', createdAt: new Date().toISOString() },
    ]);
    mockBatchesGet.mockResolvedValue(
      makeBatchData({ id: 'b1', name: 'Running Batch', status: 'running' }),
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
    seedLocalStorage([
      { batchId: 'b1', name: 'Running Batch', createdAt: new Date().toISOString() },
    ]);
    mockBatchesGet.mockResolvedValue(
      makeBatchData({ id: 'b1', name: 'Running Batch', status: 'running' }),
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
    seedLocalStorage([
      { batchId: 'b1', name: 'Running Batch', createdAt: new Date().toISOString() },
    ]);
    let callCount = 0;
    mockBatchesGet.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.resolve(makeBatchData({ id: 'b1', name: 'Running Batch', status: 'running' }));
      }
      // After cancel, return cancelled status
      return Promise.resolve(makeBatchData({ id: 'b1', name: 'Running Batch', status: 'cancelled' }));
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
      expect(mockBatchesGet).toHaveBeenCalledTimes(2);
    });
  });

  it('dismisses cancel dialog when clicking cancel button', async () => {
    seedLocalStorage([
      { batchId: 'b1', name: 'Running Batch', createdAt: new Date().toISOString() },
    ]);
    mockBatchesGet.mockResolvedValue(
      makeBatchData({ id: 'b1', name: 'Running Batch', status: 'running' }),
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
    seedLocalStorage([
      { batchId: 'b1', name: 'Running Batch', createdAt: new Date().toISOString() },
    ]);
    mockBatchesGet.mockResolvedValue(
      makeBatchData({ id: 'b1', name: 'Running Batch', status: 'running' }),
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

  // ── Operations: delete (remove) batch ─────────────────────────────────────

  it('removes a completed batch from the list', async () => {
    seedLocalStorage([
      { batchId: 'b1', name: 'Done Batch', createdAt: new Date().toISOString() },
    ]);
    mockBatchesGet.mockResolvedValue(
      makeBatchData({ id: 'b1', name: 'Done Batch', status: 'completed' }),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Done Batch')).toBeInTheDocument();
    });

    // The delete button has title="Delete"
    fireEvent.click(screen.getByTitle('Delete'));

    await waitFor(() => {
      expect(screen.queryByText('Done Batch')).not.toBeInTheDocument();
    });

    // Should also update localStorage
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    expect(stored).toHaveLength(0);
  });

  it('removes a failed-fetch batch entry from the list', async () => {
    seedLocalStorage([
      { batchId: 'b1', name: 'Ghost Batch', createdAt: new Date().toISOString() },
    ]);
    mockBatchesGet.mockRejectedValue(new Error('gone'));

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Ghost Batch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Delete'));

    await waitFor(() => {
      expect(screen.queryByText('Ghost Batch')).not.toBeInTheDocument();
    });
  });

  // ── Operations: cancel button not shown for non-active batches ────────────

  it('shows delete button (not cancel) for completed batches', async () => {
    seedLocalStorage([
      { batchId: 'b1', name: 'Done', createdAt: new Date().toISOString() },
    ]);
    mockBatchesGet.mockResolvedValue(
      makeBatchData({ id: 'b1', name: 'Done', status: 'completed' }),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument();
    });

    expect(screen.queryByTitle('Cancel Batch')).not.toBeInTheDocument();
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });

  it('shows cancel button (not delete) for running batches', async () => {
    seedLocalStorage([
      { batchId: 'b1', name: 'Active', createdAt: new Date().toISOString() },
    ]);
    mockBatchesGet.mockResolvedValue(
      makeBatchData({ id: 'b1', name: 'Active', status: 'running' }),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    expect(screen.getByTitle('Cancel Batch')).toBeInTheDocument();
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
  });

  it('shows cancel button for pending batches', async () => {
    seedLocalStorage([
      { batchId: 'b1', name: 'Queued Batch', createdAt: new Date().toISOString() },
    ]);
    mockBatchesGet.mockResolvedValue(
      makeBatchData({ id: 'b1', name: 'Queued Batch', status: 'pending' }),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Queued Batch')).toBeInTheDocument();
    });

    // Status badge "Pending" should be shown
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByTitle('Cancel Batch')).toBeInTheDocument();
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
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

  // ── Batch row info display ────────────────────────────────────────────────

  it('shows progress percentage for batches with data', async () => {
    seedLocalStorage([
      { batchId: 'b1', name: 'Halfway', createdAt: new Date().toISOString() },
    ]);
    mockBatchesGet.mockResolvedValue(
      makeBatchData({ id: 'b1', name: 'Halfway', progress: 60, completedTasks: 3, totalTasks: 5 }),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('60%')).toBeInTheDocument();
    });
  });

  it('shows failed task count when failedTasks > 0', async () => {
    seedLocalStorage([
      { batchId: 'b1', name: 'Partial Fail', createdAt: new Date().toISOString() },
    ]);
    mockBatchesGet.mockResolvedValue(
      makeBatchData({ id: 'b1', name: 'Partial Fail', status: 'failed', totalTasks: 5, completedTasks: 3, failedTasks: 2 }),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText(/2 failed/)).toBeInTheDocument();
    });
  });

  it('shows different status badges correctly', async () => {
    const now = new Date().toISOString();
    seedLocalStorage([
      { batchId: 'b1', name: 'Pend', createdAt: now },
      { batchId: 'b2', name: 'Run', createdAt: now },
      { batchId: 'b3', name: 'Done', createdAt: now },
      { batchId: 'b4', name: 'Fail', createdAt: now },
      { batchId: 'b5', name: 'Stop', createdAt: now },
    ]);
    mockBatchesGet.mockImplementation((id: string) => {
      const statuses: Record<string, string> = {
        b1: 'pending', b2: 'running', b3: 'completed', b4: 'failed', b5: 'cancelled',
      };
      const names: Record<string, string> = {
        b1: 'Pend', b2: 'Run', b3: 'Done', b4: 'Fail', b5: 'Stop',
      };
      return Promise.resolve(makeBatchData({ id, name: names[id], status: statuses[id] as BatchStatus }));
    });

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('Running')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  // ── Progress bar ──────────────────────────────────────────────────────────

  it('renders progress bar with correct width', async () => {
    seedLocalStorage([
      { batchId: 'b1', name: 'Prog', createdAt: new Date().toISOString() },
    ]);
    mockBatchesGet.mockResolvedValue(
      makeBatchData({ id: 'b1', name: 'Prog', progress: 75 }),
    );

    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    // The progress bar inner div should have width: 75%
    const bar = document.querySelector('[style*="width: 75%"]');
    expect(bar).toBeInTheDocument();
  });

  // ── Edge case: corrupted localStorage ─────────────────────────────────────

  it('handles corrupted localStorage gracefully', async () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');

    render(<BatchList />);

    // loadStoredBatches returns [] on parse error
    await waitFor(() => {
      expect(screen.getByText('No batches found')).toBeInTheDocument();
    });
  });

  // ── Edge case: empty localStorage ─────────────────────────────────────────

  it('handles missing localStorage entry', async () => {
    // Don't set anything in localStorage
    render(<BatchList />);

    await waitFor(() => {
      expect(screen.getByText('No batches found')).toBeInTheDocument();
    });
  });
});

// Type helper for status badge tests
type BatchStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
