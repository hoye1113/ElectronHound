import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SystemHealth from '../pages/SystemHealth';
import type { HealthResponse } from '../lib/api';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockHealthCheck = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    health: {
      check: (...args: unknown[]) => mockHealthCheck(...args),
    },
  },
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeHealthResponse(overrides: Partial<HealthResponse> = {}): HealthResponse {
  return {
    status: 'ok',
    timestamp: '2026-05-29T10:00:00.000Z',
    uptime: 3661,
    checks: {
      database: { status: 'ok', message: 'All connections healthy' },
      workerPool: { status: 'ok', running: 3, queued: 1, maxWorkers: 10 },
    },
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('SystemHealth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    mockHealthCheck.mockResolvedValue(makeHealthResponse());
  });

  // ─── Rendering ───────────────────────────────────────────────────────────

  it('shows loading state initially', () => {
    mockHealthCheck.mockReturnValue(new Promise(() => {}));
    render(<SystemHealth />);

    expect(screen.getByText('Loading system status...')).toBeInTheDocument();
  });

  it('renders system health overview after loading', async () => {
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText('System Health')).toBeInTheDocument();
    });

    expect(screen.getByText('Monitor system status and worker pool')).toBeInTheDocument();
  });

  it('shows error state when health check fails', async () => {
    mockHealthCheck.mockRejectedValue(new Error('Network error'));
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load system health')).toBeInTheDocument();
    });
  });

  it('shows retry button in error state', async () => {
    mockHealthCheck.mockRejectedValue(new Error('fail'));
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load system health')).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('retries health check when clicking retry button', async () => {
    mockHealthCheck.mockRejectedValueOnce(new Error('fail'));
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load system health')).toBeInTheDocument();
    });

    mockHealthCheck.mockResolvedValueOnce(makeHealthResponse());
    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('System Health')).toBeInTheDocument();
    });
  });

  // ─── Data Display ────────────────────────────────────────────────────────

  it('displays database status as connected when healthy', async () => {
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText('Database')).toBeInTheDocument();
    });

    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('All connections healthy')).toBeInTheDocument();
  });

  it('displays database status as disconnected when unhealthy', async () => {
    mockHealthCheck.mockResolvedValue(
      makeHealthResponse({
        checks: {
          database: { status: 'error', message: 'Connection refused' },
          workerPool: { status: 'ok', running: 0, queued: 0, maxWorkers: 10 },
        },
      }),
    );
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });

    expect(screen.getByText('Connection refused')).toBeInTheDocument();
  });

  it('displays worker pool metrics', async () => {
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText('Worker Pool')).toBeInTheDocument();
    });

    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Max Workers')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('displays uptime in human-readable format (hours and minutes)', async () => {
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText('Uptime')).toBeInTheDocument();
    });

    expect(screen.getByText('1h 1m')).toBeInTheDocument();
  });

  it('displays uptime in days and hours for large values', async () => {
    mockHealthCheck.mockResolvedValue(makeHealthResponse({ uptime: 90000 }));
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText('1d 1h')).toBeInTheDocument();
    });
  });

  it('displays uptime in seconds for small values', async () => {
    mockHealthCheck.mockResolvedValue(makeHealthResponse({ uptime: 45 }));
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText('45s')).toBeInTheDocument();
    });
  });

  it('displays uptime in minutes for medium values', async () => {
    mockHealthCheck.mockResolvedValue(makeHealthResponse({ uptime: 300 }));
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText('5m')).toBeInTheDocument();
    });
  });

  it('displays auto-refresh indicator', async () => {
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText('Auto Refresh')).toBeInTheDocument();
    });

    expect(screen.getByText('Auto-refreshing every 30s')).toBeInTheDocument();
  });

  it('displays server timestamp', async () => {
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText(/Server:/)).toBeInTheDocument();
    });
  });

  // ─── Refresh ─────────────────────────────────────────────────────────────

  it('auto-refreshes every 30 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SystemHealth />);

    await waitFor(() => {
      expect(mockHealthCheck).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(mockHealthCheck).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(mockHealthCheck).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('cleans up interval on unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { unmount } = render(<SystemHealth />);

    await waitFor(() => {
      expect(mockHealthCheck).toHaveBeenCalledTimes(1);
    });

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(mockHealthCheck).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('manual refresh via button click', async () => {
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText('System Health')).toBeInTheDocument();
    });

    expect(mockHealthCheck).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Refresh'));

    await waitFor(() => {
      expect(mockHealthCheck).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Status Indicators ──────────────────────────────────────────────────

  it('shows healthy status with green styling when status is ok', async () => {
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText(/Healthy/)).toBeInTheDocument();
    });

    expect(screen.getByText(/Overall Status/).closest('[class*="emerald"]')).toBeTruthy();
  });

  it('shows degraded status with amber styling when status is degraded', async () => {
    mockHealthCheck.mockResolvedValue(makeHealthResponse({ status: 'degraded' }));
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText(/Degraded/)).toBeInTheDocument();
    });

    expect(screen.getByText(/Overall Status/).closest('[class*="amber"]')).toBeTruthy();
  });

  it('shows error status with red styling when status is error', async () => {
    mockHealthCheck.mockResolvedValue(makeHealthResponse({ status: 'error' }));
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText(/Overall Status.*Error|Error/)).toBeInTheDocument();
    });

    expect(screen.getByText(/Overall Status/).closest('[class*="red"]')).toBeTruthy();
  });

  // ─── Error Recovery ─────────────────────────────────────────────────────

  it('recovers from error when health check succeeds after retry', async () => {
    mockHealthCheck.mockRejectedValueOnce(new Error('fail'));
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load system health')).toBeInTheDocument();
    });

    mockHealthCheck.mockResolvedValueOnce(makeHealthResponse());
    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('System Health')).toBeInTheDocument();
      expect(screen.getByText(/Healthy/)).toBeInTheDocument();
    });
  });

  it('shows last updated time after successful fetch', async () => {
    render(<SystemHealth />);

    await waitFor(() => {
      expect(screen.getByText('System Health')).toBeInTheDocument();
    });

    // lastUpdated is set after the fetch succeeds; check for the label text
    expect(screen.getByText(/Last updated/)).toBeInTheDocument();
  });
});
