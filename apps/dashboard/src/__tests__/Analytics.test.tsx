import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Analytics from '../pages/Analytics';

// ─── Mocks ─────────────────────────────────────────────────────────────

const mockAnalyticsGet = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    analytics: {
      get: (...args: unknown[]) => mockAnalyticsGet(...args),
    },
  },
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  Bar: () => <div data-testid="bar" />,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

// ─── Helpers ───────────────────────────────────────────────────────────

function makeAnalyticsResponse(overrides: Record<string, unknown> = {}) {
  return {
    completionRate: [
      { date: '2026-05-28', completed: 5, failed: 1 },
      { date: '2026-05-29', completed: 3, failed: 2 },
      { date: '2026-05-30', completed: 8, failed: 0 },
    ],
    avgDuration: [
      { date: '2026-05-28', avgSeconds: 45 },
      { date: '2026-05-29', avgSeconds: 60 },
      { date: '2026-05-30', avgSeconds: 30 },
    ],
    statusDistribution: {
      completed: 16,
      failed: 3,
      cancelled: 1,
      queued: 2,
    },
    tokenUsage: [
      { date: '2026-05-28', tokens: 50000 },
      { date: '2026-05-29', tokens: 75000 },
      { date: '2026-05-30', tokens: 62000 },
    ],
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('Analytics', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockAnalyticsGet.mockResolvedValue(makeAnalyticsResponse());
  });

  it('renders the page title and subtitle', async () => {
    render(<Analytics />);

    expect(screen.getByText('Dashboard Analytics')).toBeInTheDocument();
    expect(
      screen.getByText('Overview of task execution metrics and trends'),
    ).toBeInTheDocument();
  });

  it('shows loading spinner initially', () => {
    mockAnalyticsGet.mockReturnValue(new Promise(() => {})); // Never resolves

    const { container } = render(<Analytics />);

    // Loader2 renders an SVG with animate-spin class
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders all four chart sections after loading', async () => {
    render(<Analytics />);

    await waitFor(() => {
      expect(screen.getByText('Task Completion Rate')).toBeInTheDocument();
      expect(screen.getByText('Average Execution Duration')).toBeInTheDocument();
      expect(screen.getByText('Status Distribution')).toBeInTheDocument();
      expect(screen.getByText('LLM Token Usage')).toBeInTheDocument();
    });
  });

  it('renders chart containers with data', async () => {
    render(<Analytics />);

    await waitFor(() => {
      // Completion rate uses LineChart
      expect(screen.getAllByTestId('line-chart').length).toBeGreaterThanOrEqual(1);
      // Avg duration uses BarChart
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
      // Status distribution uses PieChart
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });
  });

  it('renders period selector with correct options', async () => {
    render(<Analytics />);

    await waitFor(() => {
      expect(screen.getByText('Task Completion Rate')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Period:');
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('30');
  });

  it('changes period when selector value changes', async () => {
    render(<Analytics />);

    await waitFor(() => {
      expect(screen.getByText('Task Completion Rate')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Period:');
    fireEvent.change(select, { target: { value: '7' } });

    await waitFor(() => {
      expect(mockAnalyticsGet).toHaveBeenCalledWith(7);
    });
  });

  it('shows empty state when no data available', async () => {
    mockAnalyticsGet.mockResolvedValue(
      makeAnalyticsResponse({
        completionRate: [],
        avgDuration: [],
        statusDistribution: { completed: 0, failed: 0, cancelled: 0, queued: 0 },
        tokenUsage: [],
      }),
    );

    render(<Analytics />);

    await waitFor(() => {
      const noDataMessages = screen.getAllByText('No data available for this period');
      expect(noDataMessages.length).toBe(4); // One per chart section
    });
  });

  it('calls API with default 30 days on mount', async () => {
    render(<Analytics />);

    await waitFor(() => {
      expect(mockAnalyticsGet).toHaveBeenCalledWith(30);
    });
  });

  it('shows error state when API fails', async () => {
    mockAnalyticsGet.mockRejectedValue(new Error('Network error'));

    render(<Analytics />);

    await waitFor(() => {
      expect(
        screen.getByText('Failed to load analytics data'),
      ).toBeInTheDocument();
    });
  });
});
