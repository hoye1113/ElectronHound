import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Task, StepRecord } from '@eata/shared-types';
import TaskDetail from '../pages/TaskDetail';

// Mock react-router-dom
const mockNavigate = vi.fn();
let mockParams: { id?: string } = { id: '550e8400-e29b-41d4-a716-446655440000' };
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => mockParams,
    useNavigate: () => mockNavigate,
  };
});

// Mock api module
const mockTasksGet = vi.fn();
const mockReportsGet = vi.fn();
vi.mock('../lib/api', () => ({
  api: {
    tasks: {
      get: (...args: unknown[]) => mockTasksGet(...args),
    },
    reports: {
      get: (...args: unknown[]) => mockReportsGet(...args),
      getHtmlUrl: (id: string) => `http://localhost:3000/api/tasks/${id}/report/html`,
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

const makeTask = (overrides: Partial<Task> = {}): Task => ({
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

const makeStep = (overrides: Partial<StepRecord> = {}): StepRecord => ({
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

describe('TaskDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = { id: '550e8400-e29b-41d4-a716-446655440000' };
  });


  it('shows loading state initially', () => {
    mockTasksGet.mockReturnValue(new Promise(() => {})); // never resolves
    render(<TaskDetail />);
    expect(screen.getByText('Loading task details...')).toBeInTheDocument();
  });

  it('renders task details on successful load', async () => {
    mockTasksGet.mockResolvedValue({
      task: makeTask({ goal: 'Verify checkout flow', llmModel: 'gpt-4o' }),
      steps: [],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText('Verify checkout flow')).toBeInTheDocument();
    });
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('12 steps')).toBeInTheDocument();
  });

  it('shows task status badge for running task', async () => {
    mockTasksGet.mockResolvedValue({
      task: makeTask({ status: 'running' }),
      steps: [],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText('Running')).toBeInTheDocument();
    });
  });

  it('shows task status badge for completed task', async () => {
    mockTasksGet.mockResolvedValue({
      task: makeTask({ status: 'completed' }),
      steps: [],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });
  });

  it('shows task status badge for failed task', async () => {
    mockTasksGet.mockResolvedValue({
      task: makeTask({ status: 'failed' }),
      steps: [],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows task status badge for queued task', async () => {
    mockTasksGet.mockResolvedValue({
      task: makeTask({ status: 'queued' }),
      steps: [],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText('Queued')).toBeInTheDocument();
    });
  });

  it('shows task status badge for cancelled task', async () => {
    mockTasksGet.mockResolvedValue({
      task: makeTask({ status: 'cancelled' }),
      steps: [],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  it('shows error state when API call fails', async () => {
    mockTasksGet.mockRejectedValue(new Error('Network error'));

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load task details')).toBeInTheDocument();
    });
  });

  it('shows back to tasks button on error', async () => {
    mockTasksGet.mockRejectedValue(new Error('Not found'));

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText(/Back to tasks/)).toBeInTheDocument();
    });
  });

  it('navigates back to task list on error button click', async () => {
    mockTasksGet.mockRejectedValue(new Error('Not found'));

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText(/Back to tasks/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Back to tasks/));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows not found when task is null', async () => {
    mockTasksGet.mockResolvedValue({ task: null, steps: [] });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText('Task not found')).toBeInTheDocument();
    });
  });

  it('renders steps timeline', async () => {
    const steps = [
      makeStep({ id: '660e8400-e29b-41d4-a716-446655440000', stepIndex: 0, phase: 'observe' }),
      makeStep({ id: '660e8400-e29b-41d4-a716-446655440001', stepIndex: 1, phase: 'plan' }),
    ];
    mockTasksGet.mockResolvedValue({
      task: makeTask({ status: 'completed', stepCount: 2 }),
      steps,
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText('Steps')).toBeInTheDocument();
    });
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Step 2')).toBeInTheDocument();
  });

  it('shows running indicator for running tasks with steps', async () => {
    const steps = [
      makeStep({ id: '660e8400-e29b-41d4-a716-446655440000', stepIndex: 0, phase: 'observe' }),
      makeStep({ id: '660e8400-e29b-41d4-a716-446655440001', stepIndex: 1, phase: 'execute' }),
    ];
    mockTasksGet.mockResolvedValue({
      task: makeTask({ status: 'running', stepCount: 2 }),
      steps,
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText('Running...')).toBeInTheDocument();
    });
  });

  it('renders screenshots section when screenshots exist', async () => {
    const steps = [
      makeStep({
        id: '660e8400-e29b-41d4-a716-446655440000',
        stepIndex: 0,
        screenshotPath: '/screenshots/step-0.png',
      }),
    ];
    mockTasksGet.mockResolvedValue({
      task: makeTask({ status: 'completed' }),
      steps,
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText(/Screenshots/)).toBeInTheDocument();
      expect(screen.getByTestId('screenshot-gallery')).toBeInTheDocument();
    });
  });

  it('does not render screenshots section when no screenshots', async () => {
    mockTasksGet.mockResolvedValue({
      task: makeTask({ status: 'completed' }),
      steps: [makeStep({ screenshotPath: undefined })],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText('Test the login flow')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('screenshot-gallery')).not.toBeInTheDocument();
  });

  it('navigates back when clicking back button', async () => {
    mockTasksGet.mockResolvedValue({
      task: makeTask(),
      steps: [],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByLabelText('Back to task list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Back to task list'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('renders download JSON button', async () => {
    mockTasksGet.mockResolvedValue({
      task: makeTask(),
      steps: [],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByLabelText('Download JSON report')).toBeInTheDocument();
    });
  });

  it('renders download HTML button', async () => {
    mockTasksGet.mockResolvedValue({
      task: makeTask(),
      steps: [],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByLabelText('Download HTML report')).toBeInTheDocument();
    });
  });

  it('fetches task with correct id from params', async () => {
    mockParams = { id: 'custom-task-id-123' };
    mockTasksGet.mockResolvedValue({
      task: makeTask({ id: 'custom-task-id-123' }),
      steps: [],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(mockTasksGet).toHaveBeenCalledWith('custom-task-id-123');
    });
  });

  it('renders multiple steps in timeline', async () => {
    const steps = [
      makeStep({ id: '660e8400-e29b-41d4-a716-446655440000', stepIndex: 0, phase: 'observe', observation: 'Page loaded' }),
      makeStep({ id: '660e8400-e29b-41d4-a716-446655440001', stepIndex: 1, phase: 'plan', observation: 'Analyzing form' }),
      makeStep({ id: '660e8400-e29b-41d4-a716-446655440002', stepIndex: 2, phase: 'execute', observation: 'Clicking submit' }),
      makeStep({ id: '660e8400-e29b-41d4-a716-446655440003', stepIndex: 3, phase: 'verify', observation: 'Success confirmed' }),
    ];
    mockTasksGet.mockResolvedValue({
      task: makeTask({ status: 'completed', stepCount: 4 }),
      steps,
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText('Page loaded')).toBeInTheDocument();
      expect(screen.getByText('Analyzing form')).toBeInTheDocument();
      expect(screen.getByText('Clicking submit')).toBeInTheDocument();
      expect(screen.getByText('Success confirmed')).toBeInTheDocument();
    });
  });

  it('handles steps with actions', async () => {
    const steps = [
      makeStep({
        id: '660e8400-e29b-41d4-a716-446655440000',
        stepIndex: 0,
        phase: 'execute',
        action: { name: 'click', args: { selector: '#login' } },
      }),
    ];
    mockTasksGet.mockResolvedValue({
      task: makeTask({ status: 'completed' }),
      steps,
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText(/click/)).toBeInTheDocument();
    });
  });
});
