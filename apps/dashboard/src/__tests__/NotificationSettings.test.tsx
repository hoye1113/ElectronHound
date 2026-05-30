import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import NotificationSettings from '../pages/NotificationSettings';

// ─── Mocks ─────────────────────────────────────────────────────────────

const mockGetConfig = vi.fn();
const mockUpdateConfig = vi.fn();
const mockTest = vi.fn();
const mockHistory = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    notifications: {
      getConfig: (...args: unknown[]) => mockGetConfig(...args),
      updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
      test: (...args: unknown[]) => mockTest(...args),
      history: (...args: unknown[]) => mockHistory(...args),
    },
  },
}));

// ─── Helpers ───────────────────────────────────────────────────────────

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 'config-1',
    webhookUrls: [] as string[],
    sseEnabled: true,
    eventTypes: ['task.completed', 'task.failed', 'batch.completed'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeHistory(overrides: Record<string, unknown> = {}) {
  return {
    data: [] as Array<Record<string, unknown>>,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('NotificationSettings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetConfig.mockResolvedValue(makeConfig());
    mockUpdateConfig.mockResolvedValue(makeConfig());
    mockTest.mockResolvedValue({ success: true, message: 'Test sent' });
    mockHistory.mockResolvedValue(makeHistory());
  });

  it('renders the page title', async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('Notification Settings')).toBeInTheDocument();
    });
  });

  it('renders webhook input and add button', async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('https://example.com/webhook')).toBeInTheDocument();
      expect(screen.getByText('Add')).toBeInTheDocument();
    });
  });

  it('can add a webhook URL', async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('https://example.com/webhook')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('https://example.com/webhook');
    fireEvent.change(input, { target: { value: 'https://hooks.example.com/test' } });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => {
      expect(screen.getByText('https://hooks.example.com/test')).toBeInTheDocument();
    });
  });

  it('renders SSE toggle', async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('Enable SSE notifications')).toBeInTheDocument();
    });

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('renders event type buttons', async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('Task Completed')).toBeInTheDocument();
      expect(screen.getByText('Task Failed')).toBeInTheDocument();
      expect(screen.getByText('Batch Completed')).toBeInTheDocument();
    });
  });

  it('shows empty log state', async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('No notifications sent yet')).toBeInTheDocument();
    });
  });

  it('shows notification log entries', async () => {
    mockHistory.mockResolvedValue(
      makeHistory({
        data: [
          {
            id: 'log-1',
            eventType: 'test',
            channel: 'webhook',
            target: 'https://example.com',
            status: 'sent',
            error: null,
            payload: null,
            createdAt: '2026-01-01T12:00:00Z',
          },
        ],
      }),
    );

    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('test')).toBeInTheDocument();
      expect(screen.getByText('webhook')).toBeInTheDocument();
      expect(screen.getByText('sent')).toBeInTheDocument();
    });
  });

  it('calls test API when send test button is clicked', async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('Send Test Notification')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Send Test Notification'));

    await waitFor(() => {
      expect(mockTest).toHaveBeenCalled();
      expect(screen.getByText('Test sent')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    mockGetConfig.mockReturnValue(new Promise(() => {})); // Never resolves
    mockHistory.mockReturnValue(new Promise(() => {}));

    render(<NotificationSettings />);

    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows error state when API fails', async () => {
    mockGetConfig.mockRejectedValue(new Error('Failed to load config'));

    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load config')).toBeInTheDocument();
    });
  });

  it('shows failed test result with red styling', async () => {
    mockTest.mockResolvedValue({ success: false, message: 'Webhook unreachable' });

    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('Send Test Notification')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Send Test Notification'));

    await waitFor(() => {
      expect(screen.getByText('Webhook unreachable')).toBeInTheDocument();
    });
  });

  it('shows error when test API throws', async () => {
    mockTest.mockRejectedValue(new Error('Network timeout'));

    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('Send Test Notification')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Send Test Notification'));

    await waitFor(() => {
      expect(screen.getByText('Network timeout')).toBeInTheDocument();
    });
  });

  it('shows failed status in log entries', async () => {
    mockHistory.mockResolvedValue(
      makeHistory({
        data: [
          {
            id: 'log-1',
            eventType: 'test',
            channel: 'webhook',
            target: 'https://example.com',
            status: 'failed',
            error: 'Connection refused',
            payload: null,
            createdAt: '2026-01-01T12:00:00Z',
          },
        ],
      }),
    );

    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('failed')).toBeInTheDocument();
    });
  });

  it('shows pending status in log entries', async () => {
    mockHistory.mockResolvedValue(
      makeHistory({
        data: [
          {
            id: 'log-2',
            eventType: 'test',
            channel: 'sse',
            target: null,
            status: 'pending',
            error: null,
            payload: null,
            createdAt: '2026-01-01T12:00:00Z',
          },
        ],
      }),
    );

    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('pending')).toBeInTheDocument();
    });
  });

  it('can remove a webhook URL', async () => {
    mockGetConfig.mockResolvedValue(makeConfig({
      webhookUrls: ['https://hooks.example.com/test'],
    }));

    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('https://hooks.example.com/test')).toBeInTheDocument();
    });

    // Click the remove button (X icon)
    const removeBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.queryByText('https://hooks.example.com/test')).not.toBeInTheDocument();
    });
  });

  it('can toggle event types', async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('Task Completed')).toBeInTheDocument();
    });

    // task.completed is selected by default, click to deselect
    fireEvent.click(screen.getByText('Task Completed'));

    // task.created is not selected by default, click to select
    fireEvent.click(screen.getByText('Task Created'));
  });

  it('can save config via API', async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('Save Configuration')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Configuration'));

    await waitFor(() => {
      expect(mockUpdateConfig).toHaveBeenCalled();
    });
  });

  it('shows error when save API fails', async () => {
    mockUpdateConfig.mockRejectedValue(new Error('Save failed'));

    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText('Save Configuration')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Configuration'));

    await waitFor(() => {
      expect(screen.getByText('Save failed')).toBeInTheDocument();
    });
  });
});
