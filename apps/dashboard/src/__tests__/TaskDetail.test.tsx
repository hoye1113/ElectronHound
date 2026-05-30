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
const mockGetExportUrl = vi.fn(
  (id: string, format: string) => `http://localhost:3000/api/tasks/${id}/export/${format}`,
);
vi.mock('../lib/api', () => ({
  api: {
    tasks: {
      get: (id: string) => mockTasksGet(id),
    },
    reports: {
      get: (id: string) => mockReportsGet(id),
      getHtmlUrl: (id: string) => `http://localhost:3000/api/tasks/${id}/report/html`,
    },
  },
  getScreenshotUrl: (taskId: string, stepIndex: number) =>
    `http://localhost:3000/api/tasks/${taskId}/steps/${stepIndex}/screenshot`,
  getExportUrl: (id: string, format: string) => mockGetExportUrl(id, format),
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

  // --- formatTimeRange tests ---

  it('displays duration in seconds when < 60s', async () => {
    mockTasksGet.mockResolvedValue({
      task: makeTask({
        createdAt: '2026-05-28T10:00:00Z',
        updatedAt: '2026-05-28T10:00:15Z',
      }),
      steps: [],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText('Test the login flow')).toBeInTheDocument();
    });
    expect(screen.getByText('15s')).toBeInTheDocument();
  });

  it('displays duration in minutes when < 60m', async () => {
    mockTasksGet.mockResolvedValue({
      task: makeTask({
        createdAt: '2026-05-28T10:00:00Z',
        updatedAt: '2026-05-28T10:05:00Z',
      }),
      steps: [],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText('Test the login flow')).toBeInTheDocument();
    });
    expect(screen.getByText('5m')).toBeInTheDocument();
  });

  it('displays duration in hours and minutes when >= 60m', async () => {
    mockTasksGet.mockResolvedValue({
      task: makeTask({
        createdAt: '2026-05-28T10:00:00Z',
        updatedAt: '2026-05-28T12:30:00Z',
      }),
      steps: [],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText('Test the login flow')).toBeInTheDocument();
    });
    expect(screen.getByText('2h 30m')).toBeInTheDocument();
  });

  // --- Status badge: aborted ---

  it('shows task status badge for aborted task', async () => {
    mockTasksGet.mockResolvedValue({
      task: makeTask({ status: 'aborted' }),
      steps: [],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByText('Aborted')).toBeInTheDocument();
    });
  });

  // --- Export dropdown ---

  it('opens export dropdown on click', async () => {
    mockTasksGet.mockResolvedValue({
      task: makeTask(),
      steps: [],
    });

    render(<TaskDetail />);

    let exportBtn!: HTMLElement;
    await waitFor(() => {
      exportBtn = screen.getByRole('button', { name: 'Export' });
      expect(exportBtn).toBeInTheDocument();
    });

    fireEvent.click(exportBtn);

    expect(screen.getByText('Export JSON')).toBeInTheDocument();
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
    expect(screen.getByText('Export HTML')).toBeInTheDocument();
  });

  it('opens correct export URL for JSON', async () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    mockTasksGet.mockResolvedValue({
      task: makeTask(),
      steps: [],
    });

    render(<TaskDetail />);

    let exportBtn!: HTMLElement;
    await waitFor(() => {
      exportBtn = screen.getByRole('button', { name: 'Export' });
    });

    fireEvent.click(exportBtn);
    fireEvent.click(screen.getByText('Export JSON'));

    expect(mockGetExportUrl).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', 'json');
    expect(windowOpenSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/tasks/550e8400-e29b-41d4-a716-446655440000/export/json',
    );
    windowOpenSpy.mockRestore();
  });

  it('opens correct export URL for CSV', async () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    mockTasksGet.mockResolvedValue({
      task: makeTask(),
      steps: [],
    });

    render(<TaskDetail />);

    let exportBtn!: HTMLElement;
    await waitFor(() => {
      exportBtn = screen.getByRole('button', { name: 'Export' });
    });

    fireEvent.click(exportBtn);
    fireEvent.click(screen.getByText('Export CSV'));

    expect(mockGetExportUrl).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', 'csv');
    expect(windowOpenSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/tasks/550e8400-e29b-41d4-a716-446655440000/export/csv',
    );
    windowOpenSpy.mockRestore();
  });

  it('opens correct export URL for HTML', async () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    mockTasksGet.mockResolvedValue({
      task: makeTask(),
      steps: [],
    });

    render(<TaskDetail />);

    let exportBtn!: HTMLElement;
    await waitFor(() => {
      exportBtn = screen.getByRole('button', { name: 'Export' });
    });

    fireEvent.click(exportBtn);
    fireEvent.click(screen.getByText('Export HTML'));

    expect(mockGetExportUrl).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', 'html');
    expect(windowOpenSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/tasks/550e8400-e29b-41d4-a716-446655440000/export/html',
    );
    windowOpenSpy.mockRestore();
  });

  it('closes export dropdown after selecting an option', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    mockTasksGet.mockResolvedValue({
      task: makeTask(),
      steps: [],
    });

    render(<TaskDetail />);

    let exportBtn!: HTMLElement;
    await waitFor(() => {
      exportBtn = screen.getByRole('button', { name: 'Export' });
    });

    fireEvent.click(exportBtn);
    expect(screen.getByText('Export JSON')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Export JSON'));
    expect(screen.queryByText('Export JSON')).not.toBeInTheDocument();
  });

  it('closes export dropdown on outside click', async () => {
    mockTasksGet.mockResolvedValue({
      task: makeTask(),
      steps: [],
    });

    render(<TaskDetail />);

    let exportBtn!: HTMLElement;
    await waitFor(() => {
      exportBtn = screen.getByRole('button', { name: 'Export' });
    });

    fireEvent.click(exportBtn);
    expect(screen.getByText('Export JSON')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Export JSON')).not.toBeInTheDocument();
  });

  // --- Download report click handlers ---

  it('downloads JSON report on button click', async () => {
    const mockReport = { task: makeTask(), steps: [] };
    mockReportsGet.mockResolvedValue(mockReport);
    const clickSpy = vi.fn();
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElement(tag);
      if (tag === 'a') {
        el.click = clickSpy;
      }
      return el;
    });
    // URL.createObjectURL/revokeObjectURL not available in jsdom
    const createObjectURLSpy = vi.fn().mockReturnValue('blob:mock');
    const revokeObjectURLSpy = vi.fn();
    (URL as unknown as Record<string, unknown>).createObjectURL = createObjectURLSpy;
    (URL as unknown as Record<string, unknown>).revokeObjectURL = revokeObjectURLSpy;

    mockTasksGet.mockResolvedValue({
      task: makeTask(),
      steps: [],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByLabelText('Download JSON report')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Download JSON report'));

    await waitFor(() => {
      expect(mockReportsGet).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
      expect(clickSpy).toHaveBeenCalled();
      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock');
    });

    vi.restoreAllMocks();
  });

  it('downloads HTML report on button click', async () => {
    const clickSpy = vi.fn();
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElement(tag);
      if (tag === 'a') {
        el.click = clickSpy;
      }
      return el;
    });

    mockTasksGet.mockResolvedValue({
      task: makeTask(),
      steps: [],
    });

    render(<TaskDetail />);

    await waitFor(() => {
      expect(screen.getByLabelText('Download HTML report')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Download HTML report'));

    expect(clickSpy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
