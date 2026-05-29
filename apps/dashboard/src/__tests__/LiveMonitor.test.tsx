import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock react-router-dom
let mockParams: { id?: string } = { id: '550e8400-e29b-41d4-a716-446655440000' };
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => mockParams,
  };
});

// Mock SSE module
const mockClose = vi.fn();
const mockConnectSSE = vi.fn(() => ({ close: mockClose }));
vi.mock('../lib/sse', () => ({
  connectSSE: (...args: unknown[]) => mockConnectSSE(...args),
}));

// Mock task store
const mockFetchTask = vi.fn();
const mockCancelTask = vi.fn();
const mockSubscribeToTask = vi.fn(() => vi.fn());
let mockStoreState = {
  currentTask: null as Record<string, unknown> | null,
  currentTaskSteps: [] as Record<string, unknown>[],
  isLoading: false,
};

vi.mock('../stores/taskStore', () => ({
  useTaskStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      ...mockStoreState,
      fetchTask: mockFetchTask,
      cancelTask: mockCancelTask,
      subscribeToTask: mockSubscribeToTask,
    }),
}));

// Mock child components
vi.mock('../components/StepTimeline', () => ({
  default: ({ steps, currentStepIndex }: { steps: unknown[]; currentStepIndex: number }) => (
    <div data-testid="step-timeline">
      {steps.length} steps, current: {currentStepIndex}
    </div>
  ),
}));

vi.mock('../components/AccessibilityTreeView', () => ({
  default: ({ snapshot }: { snapshot: unknown }) => (
    <div data-testid="a11y-tree">{snapshot ? String(snapshot) : 'empty'}</div>
  ),
}));

vi.mock('../components/LogPanel', () => ({
  default: ({ logs }: { logs: unknown[] }) => (
    <div data-testid="log-panel">{logs.length} logs</div>
  ),
}));

// Mock window.confirm
const mockConfirm = vi.fn(() => true);

const makeTask = (overrides: Record<string, unknown> = {}) => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  goal: 'Test the login flow',
  targetAppPath: '/test/app',
  llmModel: 'gpt-4o',
  status: 'running',
  maxSteps: 50,
  stepCount: 12,
  createdAt: '2026-05-28T10:00:00Z',
  updatedAt: '2026-05-28T10:05:00Z',
  ...overrides,
});

const makeStep = (overrides: Record<string, unknown> = {}) => ({
  id: '660e8400-e29b-41d4-a716-446655440000',
  taskId: '550e8400-e29b-41d4-a716-446655440000',
  stepIndex: 0,
  phase: 'observe',
  status: 'success',
  observation: 'Page loaded',
  timestamp: '2026-05-28T10:00:00Z',
  duration: 150,
  ...overrides,
});

describe('LiveMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = { id: '550e8400-e29b-41d4-a716-446655440000' };
    mockStoreState = {
      currentTask: makeTask(),
      currentTaskSteps: [],
      isLoading: false,
    };
    vi.spyOn(window, 'confirm').mockImplementation(mockConfirm);
  });

  it('renders no-task alert when id is missing', async () => {
    mockParams = {};
    mockStoreState = {
      currentTask: null,
      currentTaskSteps: [],
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByRole('heading', { name: /no task id provided/i })).toBeInTheDocument();
  });

  it('fetches task on mount with id from params', async () => {
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(mockFetchTask).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
  });

  it('subscribes to task SSE on mount', async () => {
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(mockSubscribeToTask).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
  });

  it('connects SSE for log events on mount', async () => {
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(mockConnectSSE).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      expect.objectContaining({
        onLog: expect.any(Function),
        onStatus: expect.any(Function),
      }),
    );
  });

  it('shows loading state when isLoading is true and no task', async () => {
    mockStoreState = {
      currentTask: null,
      currentTaskSteps: [],
      isLoading: true,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByText('Loading task data...')).toBeInTheDocument();
  });

  it('renders monitor panel with task goal', async () => {
    mockStoreState = {
      currentTask: makeTask({ goal: 'Verify checkout flow' }),
      currentTaskSteps: [],
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByText('Verify checkout flow')).toBeInTheDocument();
  });

  it('renders task id in header', async () => {
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByText('550e8400-e29b-41d4-a716-446655440000')).toBeInTheDocument();
  });

  it('renders step count and model info', async () => {
    mockStoreState = {
      currentTask: makeTask({ stepCount: 12, llmModel: 'gpt-4o' }),
      currentTaskSteps: [],
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByText('12 steps')).toBeInTheDocument();
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
  });

  it('renders running status badge', async () => {
    mockStoreState = {
      currentTask: makeTask({ status: 'running' }),
      currentTaskSteps: [],
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('renders completed status badge', async () => {
    mockStoreState = {
      currentTask: makeTask({ status: 'completed' }),
      currentTaskSteps: [],
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders failed status badge', async () => {
    mockStoreState = {
      currentTask: makeTask({ status: 'failed' }),
      currentTaskSteps: [],
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('renders queued status badge', async () => {
    mockStoreState = {
      currentTask: makeTask({ status: 'queued' }),
      currentTaskSteps: [],
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByText('Queued')).toBeInTheDocument();
  });

  it('renders cancelled status badge', async () => {
    mockStoreState = {
      currentTask: makeTask({ status: 'cancelled' }),
      currentTaskSteps: [],
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('shows cancel button when task is running', async () => {
    mockStoreState = {
      currentTask: makeTask({ status: 'running' }),
      currentTaskSteps: [],
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('shows cancel button when task is queued', async () => {
    mockStoreState = {
      currentTask: makeTask({ status: 'queued' }),
      currentTaskSteps: [],
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('does not show cancel button when task is completed', async () => {
    mockStoreState = {
      currentTask: makeTask({ status: 'completed' }),
      currentTaskSteps: [],
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('calls cancelTask on cancel button click after confirmation', async () => {
    mockStoreState = {
      currentTask: makeTask({ status: 'running' }),
      currentTaskSteps: [],
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockConfirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockCancelTask).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  it('does not call cancelTask when confirmation is rejected', async () => {
    mockConfirm.mockReturnValueOnce(false);
    mockStoreState = {
      currentTask: makeTask({ status: 'running' }),
      currentTaskSteps: [],
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockCancelTask).not.toHaveBeenCalled();
  });

  it('renders step timeline component', async () => {
    const steps = [makeStep({ stepIndex: 0 })];
    mockStoreState = {
      currentTask: makeTask(),
      currentTaskSteps: steps,
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByTestId('step-timeline')).toBeInTheDocument();
  });

  it('renders log panel component', async () => {
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByTestId('log-panel')).toBeInTheDocument();
  });

  it('renders accessibility tree component', async () => {
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByTestId('a11y-tree')).toBeInTheDocument();
  });

  it('shows phase badge when steps have a phase', async () => {
    const steps = [makeStep({ phase: 'execute' })];
    mockStoreState = {
      currentTask: makeTask({ status: 'running' }),
      currentTaskSteps: steps,
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByText('Execute')).toBeInTheDocument();
  });

  it('does not show phase badge when no steps', async () => {
    mockStoreState = {
      currentTask: makeTask({ status: 'running' }),
      currentTaskSteps: [],
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.queryByText('Execute')).not.toBeInTheDocument();
    expect(screen.queryByText('Observe')).not.toBeInTheDocument();
    expect(screen.queryByText('Plan')).not.toBeInTheDocument();
    expect(screen.queryByText('Verify')).not.toBeInTheDocument();
  });

  it('renders with default loading text when no task goal', async () => {
    mockStoreState = {
      currentTask: null,
      currentTaskSteps: [],
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByText('Loading task...')).toBeInTheDocument();
  });

  it('renders section headings', async () => {
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByText('Step Timeline')).toBeInTheDocument();
    expect(screen.getByText('Live Logs')).toBeInTheDocument();
    expect(screen.getByText('Accessibility Tree')).toBeInTheDocument();
  });

  it('passes correct steps and index to StepTimeline', async () => {
    const steps = [
      makeStep({ id: 's1', stepIndex: 0, phase: 'observe' }),
      makeStep({ id: 's2', stepIndex: 1, phase: 'plan' }),
      makeStep({ id: 's3', stepIndex: 2, phase: 'execute' }),
    ];
    mockStoreState = {
      currentTask: makeTask({ status: 'running' }),
      currentTaskSteps: steps,
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    const timeline = screen.getByTestId('step-timeline');
    expect(timeline).toHaveTextContent('3 steps, current: 2');
  });

  it('handles SSE onLog callback to append logs', async () => {
    let onLogCallback: ((data: unknown) => void) | undefined;
    mockConnectSSE.mockImplementation((_id: string, callbacks: Record<string, unknown>) => {
      onLogCallback = callbacks.onLog as (data: unknown) => void;
      return { close: mockClose };
    });

    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    // Simulate receiving a log entry
    expect(onLogCallback).toBeDefined();
    act(() => {
      onLogCallback!({
        timestamp: '2026-05-28T10:00:00Z',
        level: 'info',
        message: 'Task started',
      });
    });

    // The log panel should show 1 log
    await waitFor(() => {
      expect(screen.getByTestId('log-panel')).toHaveTextContent('1 logs');
    });

    // Add another log
    act(() => {
      onLogCallback!({
        timestamp: '2026-05-28T10:00:01Z',
        level: 'info',
        message: 'Step completed',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('log-panel')).toHaveTextContent('2 logs');
    });
  });

  it('handles SSE onStatus callback to refetch task', async () => {
    let onStatusCallback: ((data: unknown) => void) | undefined;
    mockConnectSSE.mockImplementation((_id: string, callbacks: Record<string, unknown>) => {
      onStatusCallback = callbacks.onStatus as (data: unknown) => void;
      return { close: mockClose };
    });

    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(onStatusCallback).toBeDefined();
    act(() => {
      onStatusCallback!({ status: 'completed' });
    });

    await waitFor(() => {
      expect(mockFetchTask).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  it('cleans up SSE and store subscription on unmount', async () => {
    const mockCleanup = vi.fn();
    mockSubscribeToTask.mockReturnValueOnce(mockCleanup);

    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    const { unmount } = render(<LiveMonitor />);

    unmount();

    expect(mockClose).toHaveBeenCalled();
    expect(mockCleanup).toHaveBeenCalled();
  });

  it('ignores log entries without timestamp or message', async () => {
    let onLogCallback: ((data: unknown) => void) | undefined;
    mockConnectSSE.mockImplementation((_id: string, callbacks: Record<string, unknown>) => {
      onLogCallback = callbacks.onLog as (data: unknown) => void;
      return { close: mockClose };
    });

    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    // Entry without timestamp should be ignored
    act(() => {
      onLogCallback!({ message: 'test' });
    });
    expect(screen.getByTestId('log-panel')).toHaveTextContent('0 logs');

    // Entry without message should be ignored
    act(() => {
      onLogCallback!({ timestamp: '2026-05-28T10:00:00Z' });
    });
    expect(screen.getByTestId('log-panel')).toHaveTextContent('0 logs');

    // Valid entry should be added
    act(() => {
      onLogCallback!({ timestamp: '2026-05-28T10:00:00Z', level: 'info', message: 'valid' });
    });
    await waitFor(() => {
      expect(screen.getByTestId('log-panel')).toHaveTextContent('1 logs');
    });
  });

  it('renders with steps in multiple phases', async () => {
    const steps = [
      makeStep({ id: 's1', stepIndex: 0, phase: 'observe' }),
      makeStep({ id: 's2', stepIndex: 1, phase: 'plan' }),
      makeStep({ id: 's3', stepIndex: 2, phase: 'execute' }),
      makeStep({ id: 's4', stepIndex: 3, phase: 'verify' }),
    ];
    mockStoreState = {
      currentTask: makeTask({ status: 'running', stepCount: 4 }),
      currentTaskSteps: steps,
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    // The last phase should be shown
    expect(screen.getByText('Verify')).toBeInTheDocument();
  });

  it('handles aborted status badge', async () => {
    mockStoreState = {
      currentTask: makeTask({ status: 'aborted' }),
      currentTaskSteps: [],
      isLoading: false,
    };
    const { default: LiveMonitor } = await import('../pages/LiveMonitor');
    render(<LiveMonitor />);

    expect(screen.getByText('Aborted')).toBeInTheDocument();
  });
});
