import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportView from '../pages/ReportView';

// Mock react-router-dom
const mockNavigate = vi.fn();
let mockParams: { id?: string } = {
  id: '550e8400-e29b-41d4-a716-446655440000',
};
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => mockParams,
    useNavigate: () => mockNavigate,
  };
});

// Mock api module
const mockReportsGet = vi.fn();
vi.mock('../lib/api', () => ({
  api: {
    reports: {
      get: (...args: unknown[]) => mockReportsGet(...args),
      getHtmlUrl: (id: string) =>
        `http://localhost:3000/api/tasks/${id}/report/html`,
    },
  },
  getScreenshotUrl: (taskId: string, stepIndex: number) =>
    `http://localhost:3000/api/tasks/${taskId}/steps/${stepIndex}/screenshot`,
}));

// Mock ScreenshotGallery
vi.mock('../components/ScreenshotGallery', () => ({
  default: ({ screenshots }: { screenshots: unknown[] }) => (
    <div data-testid="screenshot-gallery">{screenshots.length} screenshots</div>
  ),
}));

const makeManifest = (overrides: Record<string, unknown> = {}) => ({
  taskId: '550e8400-e29b-41d4-a716-446655440000',
  goal: 'Test the login flow',
  status: 'completed',
  totalSteps: 5,
  passedSteps: 4,
  failedSteps: 1,
  retriedSteps: 0,
  startTime: '2026-05-28T10:00:00Z',
  endTime: '2026-05-28T10:05:00Z',
  totalDuration: 300000,
  ...overrides,
});

const makeTimelineEntry = (overrides: Record<string, unknown> = {}) => ({
  stepIndex: 0,
  phase: 'observe',
  status: 'success',
  action: 'Captured aria snapshot',
  resultSummary: 'Page loaded successfully',
  timestamp: '2026-05-28T10:00:00Z',
  duration: 150,
  ...overrides,
});

describe('ReportView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = { id: '550e8400-e29b-41d4-a716-446655440000' };
  });

  // ── Rendering ───────────────────────────────────────────────────────────

  it('shows loading state initially', () => {
    mockReportsGet.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ReportView />);
    expect(screen.getByText('Loading report...')).toBeInTheDocument();
  });

  it('renders report details on successful load', async () => {
    mockReportsGet.mockResolvedValue(makeManifest());

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('Test the login flow')).toBeInTheDocument();
    });
    expect(screen.getByText('5 steps')).toBeInTheDocument();
  });

  it('shows error state when API call fails', async () => {
    mockReportsGet.mockRejectedValue(new Error('Network error'));

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load report')).toBeInTheDocument();
    });
  });

  it('shows back to tasks button on error', async () => {
    mockReportsGet.mockRejectedValue(new Error('Not found'));

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText(/Back to tasks/)).toBeInTheDocument();
    });
  });

  it('navigates back to task list on error button click', async () => {
    mockReportsGet.mockRejectedValue(new Error('Not found'));

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText(/Back to tasks/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Back to tasks/));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows not found when manifest is null', async () => {
    mockReportsGet.mockResolvedValue(null);

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('Report not found')).toBeInTheDocument();
    });
  });

  it('fetches report with correct id from params', async () => {
    mockParams = { id: 'custom-report-id-123' };
    mockReportsGet.mockResolvedValue(makeManifest({ taskId: 'custom-report-id-123' }));

    render(<ReportView />);

    await waitFor(() => {
      expect(mockReportsGet).toHaveBeenCalledWith('custom-report-id-123');
    });
  });

  it('navigates back when clicking back button', async () => {
    mockReportsGet.mockResolvedValue(makeManifest());

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByLabelText('Back to task list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Back to task list'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  // ── Data display ────────────────────────────────────────────────────────

  it('displays status badge for completed report', async () => {
    mockReportsGet.mockResolvedValue(makeManifest({ status: 'completed' }));

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });
  });

  it('displays status badge for failed report', async () => {
    mockReportsGet.mockResolvedValue(makeManifest({ status: 'failed' }));

    render(<ReportView />);

    await waitFor(() => {
      // "Failed" appears in both status badge and summary stats
      expect(screen.getAllByText('Failed').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays status badge for cancelled report', async () => {
    mockReportsGet.mockResolvedValue(makeManifest({ status: 'cancelled' }));

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  it('displays status badge for aborted report', async () => {
    mockReportsGet.mockResolvedValue(makeManifest({ status: 'aborted' }));

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('Aborted')).toBeInTheDocument();
    });
  });

  it('displays summary statistics', async () => {
    mockReportsGet.mockResolvedValue(
      makeManifest({
        totalSteps: 10,
        passedSteps: 7,
        failedSteps: 2,
        retriedSteps: 1,
      }),
    );

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('Total Steps')).toBeInTheDocument();
    });
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Retried')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('displays timestamps', async () => {
    mockReportsGet.mockResolvedValue(makeManifest());

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText(/Start:/)).toBeInTheDocument();
    });
    expect(screen.getByText(/End:/)).toBeInTheDocument();
  });

  it('displays formatted duration', async () => {
    mockReportsGet.mockResolvedValue(
      makeManifest({ totalDuration: 125000 }),
    );

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('2m 5s')).toBeInTheDocument();
    });
  });

  it('displays duration in ms for short durations', async () => {
    mockReportsGet.mockResolvedValue(
      makeManifest({ totalDuration: 500 }),
    );

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('500ms')).toBeInTheDocument();
    });
  });

  it('displays duration in seconds for medium durations', async () => {
    mockReportsGet.mockResolvedValue(
      makeManifest({ totalDuration: 30000 }),
    );

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('30s')).toBeInTheDocument();
    });
  });

  // ── Steps list ──────────────────────────────────────────────────────────

  it('renders steps list when timeline is provided', async () => {
    const timeline = [
      makeTimelineEntry({ stepIndex: 0, phase: 'observe', action: 'Captured aria snapshot' }),
      makeTimelineEntry({ stepIndex: 1, phase: 'plan', action: 'Analyzed form structure' }),
    ];
    mockReportsGet.mockResolvedValue(makeManifest({ timeline }));

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('Step 1')).toBeInTheDocument();
      expect(screen.getByText('Step 2')).toBeInTheDocument();
    });
  });

  it('does not render steps section when timeline is empty', async () => {
    mockReportsGet.mockResolvedValue(makeManifest());

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('Test the login flow')).toBeInTheDocument();
    });
    expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
  });

  it('renders step phase labels', async () => {
    const timeline = [
      makeTimelineEntry({ stepIndex: 0, phase: 'observe' }),
      makeTimelineEntry({ stepIndex: 1, phase: 'plan' }),
    ];
    mockReportsGet.mockResolvedValue(makeManifest({ timeline }));

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('observe')).toBeInTheDocument();
      expect(screen.getByText('plan')).toBeInTheDocument();
    });
  });

  it('renders step action labels', async () => {
    const timeline = [
      makeTimelineEntry({
        stepIndex: 0,
        action: 'Clicked login button',
      }),
    ];
    mockReportsGet.mockResolvedValue(makeManifest({ timeline }));

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('Clicked login button')).toBeInTheDocument();
    });
  });

  it('renders step status badges', async () => {
    const timeline = [
      makeTimelineEntry({ stepIndex: 0, status: 'success' }),
      makeTimelineEntry({ stepIndex: 1, status: 'failed' }),
    ];
    mockReportsGet.mockResolvedValue(makeManifest({ timeline }));

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getAllByText('success')).toHaveLength(1);
      expect(screen.getAllByText('failed')).toHaveLength(1);
    });
  });

  // ── Step expand/collapse ────────────────────────────────────────────────

  it('expands step details when clicked', async () => {
    const timeline = [
      makeTimelineEntry({
        stepIndex: 0,
        resultSummary: 'Page loaded successfully',
      }),
    ];
    mockReportsGet.mockResolvedValue(makeManifest({ timeline }));

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('Step 1')).toBeInTheDocument();
    });

    // Details should not be visible yet
    expect(screen.queryByText('Page loaded successfully')).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByText('Step 1'));

    await waitFor(() => {
      expect(screen.getByText('Page loaded successfully')).toBeInTheDocument();
    });
  });

  it('collapses step details when clicked again', async () => {
    const timeline = [
      makeTimelineEntry({
        stepIndex: 0,
        resultSummary: 'Page loaded successfully',
      }),
    ];
    mockReportsGet.mockResolvedValue(makeManifest({ timeline }));

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('Step 1')).toBeInTheDocument();
    });

    // Expand
    fireEvent.click(screen.getByText('Step 1'));
    await waitFor(() => {
      expect(screen.getByText('Page loaded successfully')).toBeInTheDocument();
    });

    // Collapse
    fireEvent.click(screen.getByText('Step 1'));
    await waitFor(() => {
      expect(screen.queryByText('Page loaded successfully')).not.toBeInTheDocument();
    });
  });

  it('sets aria-expanded correctly on step buttons', async () => {
    const timeline = [
      makeTimelineEntry({ stepIndex: 0 }),
    ];
    mockReportsGet.mockResolvedValue(makeManifest({ timeline }));

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('Step 1')).toBeInTheDocument();
    });

    const stepButton = screen.getByText('Step 1').closest('button')!;
    expect(stepButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(stepButton);
    expect(stepButton).toHaveAttribute('aria-expanded', 'true');
  });

  // ── Screenshot gallery ──────────────────────────────────────────────────

  it('renders screenshot gallery when screenshots exist', async () => {
    const timeline = [
      makeTimelineEntry({ stepIndex: 0, phase: 'execute' }),
      makeTimelineEntry({ stepIndex: 1, phase: 'execute' }),
    ];
    mockReportsGet.mockResolvedValue(makeManifest({ timeline }));

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByTestId('screenshot-gallery')).toBeInTheDocument();
      expect(screen.getByText('2 screenshots')).toBeInTheDocument();
    });
  });

  it('does not render screenshot gallery when no screenshots', async () => {
    const timeline = [
      makeTimelineEntry({ stepIndex: 0, phase: 'observe' }),
    ];
    mockReportsGet.mockResolvedValue(makeManifest({ timeline }));

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('Test the login flow')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('screenshot-gallery')).not.toBeInTheDocument();
  });

  it('does not render screenshot gallery when timeline is empty', async () => {
    mockReportsGet.mockResolvedValue(makeManifest());

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('Test the login flow')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('screenshot-gallery')).not.toBeInTheDocument();
  });

  // ── Export ──────────────────────────────────────────────────────────────

  it('renders export button', async () => {
    mockReportsGet.mockResolvedValue(makeManifest());

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByLabelText('Export JSON')).toBeInTheDocument();
    });
  });

  it('calls export function when export button is clicked', async () => {
    const manifest = makeManifest();
    mockReportsGet.mockResolvedValue(manifest);

    // Mock URL.createObjectURL and URL.revokeObjectURL
    const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
    const mockRevokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });

    // Mock document.createElement and click
    const mockClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        el.click = mockClick;
      }
      return el;
    });

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByLabelText('Export JSON')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Export JSON'));

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    vi.restoreAllMocks();
  });

  it('does not call export when manifest is null', async () => {
    mockReportsGet.mockResolvedValue(null);

    render(<ReportView />);

    await waitFor(() => {
      expect(screen.getByText('Report not found')).toBeInTheDocument();
    });

    // Export button should not be present when there's an error
    expect(screen.queryByLabelText('Export JSON')).not.toBeInTheDocument();
  });
});
