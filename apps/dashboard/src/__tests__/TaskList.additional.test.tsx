import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Task } from '@eata/shared-types';
import TaskList from '../pages/TaskList';

// Mock taskStore
const mockFetchTasks = vi.fn().mockResolvedValue(undefined);
let mockTasks: Task[] = [];
let mockIsLoading = false;
let mockError: string | null = null;

vi.mock('../stores/taskStore', () => ({
  useTaskStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      tasks: mockTasks,
      isLoading: mockIsLoading,
      error: mockError,
      fetchTasks: mockFetchTasks,
    }),
}));

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock CreateTaskForm
vi.mock('../components/CreateTaskForm', () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-task-form">Create Task Form</div> : null,
}));

// Mock TaskCard to simplify rendering
vi.mock('../components/TaskCard', () => ({
  default: ({ task }: { task: Task }) => (
    <div data-testid={`task-card-${task.id}`}>
      <span>{task.goal}</span>
      <span>{task.llmModel}</span>
      <span>{task.stepCount} steps</span>
      <span>{task.status}</span>
    </div>
  ),
}));

// Mock api for batch export
const mockBatchExport = vi.fn();
vi.mock('../lib/api', () => ({
  api: {
    tasks: {
      batchExport: (...args: unknown[]) => mockBatchExport(...args),
    },
  },
}));

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  goal: 'Test the login flow',
  targetAppPath: '/test/app',
  llmModel: 'gpt-4o',
  status: 'running',
  priority: 'medium',
  maxSteps: 50,
  stepCount: 12,
  createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('TaskList additional coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTasks = [];
    mockIsLoading = false;
    mockError = null;
    mockFetchTasks.mockResolvedValue(undefined);
    mockBatchExport.mockResolvedValue(new Blob(['test']));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    // Polyfill URL.createObjectURL/revokeObjectURL for jsdom if missing
    if (!URL.createObjectURL) {
      (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:mock-url');
    }
    if (!URL.revokeObjectURL) {
      (URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  // ── Error state with retry ────────────────────────────────────────────

  describe('error state', () => {
    it('shows error message when error is set', () => {
      mockError = 'Connection refused';
      render(<TaskList />);
      expect(screen.getByText(/Failed to load tasks/)).toBeInTheDocument();
    });

    it('shows retry button in error state', () => {
      mockError = 'Network error';
      render(<TaskList />);
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    });

    it('calls fetchTasks when retry button is clicked', () => {
      mockError = 'Network error';
      render(<TaskList />);
      fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
      expect(mockFetchTasks).toHaveBeenCalledTimes(2); // once on mount, once on retry
    });
  });

  // ── Batch selection ───────────────────────────────────────────────────

  describe('batch selection', () => {
    it('toggles task selection on checkbox click', async () => {
      mockTasks = [
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'Task 1' }),
      ];
      render(<TaskList />);

      // Find the toggle button (checkmark icon) - it's the button with no text inside the task wrapper
      const taskWrapper = screen.getByText('Task 1').closest('.relative.group');
      expect(taskWrapper).toBeInTheDocument();

      const toggleBtn = taskWrapper!.querySelector('button');
      expect(toggleBtn).toBeInTheDocument();

      // Click to select
      fireEvent.click(toggleBtn!);

      // Should show batch export toolbar
      await waitFor(() => {
        expect(screen.getByText(/1 task selected/)).toBeInTheDocument();
      });
    });

    it('selects all tasks on page with select-all button', async () => {
      mockTasks = [
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'Task A' }),
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440002', goal: 'Task B' }),
      ];
      render(<TaskList />);

      // Click select-all button (has title "Select all on page")
      const selectAllBtn = screen.getByTitle('Select all on page');
      fireEvent.click(selectAllBtn);

      await waitFor(() => {
        expect(screen.getByText(/2 tasks selected/)).toBeInTheDocument();
      });
    });

    it('deselects all tasks with deselect button', async () => {
      mockTasks = [
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'Task A' }),
      ];
      render(<TaskList />);

      // Select first
      const taskWrapper = screen.getByText('Task A').closest('.relative.group');
      const toggleBtn = taskWrapper!.querySelector('button');
      fireEvent.click(toggleBtn!);

      await waitFor(() => {
        expect(screen.getByText(/1 task selected/)).toBeInTheDocument();
      });

      // Deselect all
      const deselectBtn = screen.getByTitle('Deselect all');
      fireEvent.click(deselectBtn);

      await waitFor(() => {
        expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
      });
    });

    it('deselects a selected task on second click', async () => {
      mockTasks = [
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'Toggle Task' }),
      ];
      render(<TaskList />);

      const taskWrapper = screen.getByText('Toggle Task').closest('.relative.group');
      const toggleBtn = taskWrapper!.querySelector('button');

      // Select
      fireEvent.click(toggleBtn!);
      await waitFor(() => {
        expect(screen.getByText(/1 task selected/)).toBeInTheDocument();
      });

      // Deselect by clicking again
      fireEvent.click(toggleBtn!);
      await waitFor(() => {
        expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
      });
    });
  });

  // ── Batch export ──────────────────────────────────────────────────────

  describe('batch export', () => {
    async function selectTask(taskGoal: string) {
      const taskWrapper = screen.getByText(taskGoal).closest('.relative.group');
      const toggleBtn = taskWrapper!.querySelector('button')!;
      fireEvent.click(toggleBtn);
      await waitFor(() => {
        expect(screen.getByText(/selected/)).toBeInTheDocument();
      });
    }

    it('shows export buttons when tasks are selected', async () => {
      mockTasks = [makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'Export Task' })];
      render(<TaskList />);
      await selectTask('Export Task');

      expect(screen.getByRole('button', { name: /JSON/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /CSV/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /HTML/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /PDF/i })).toBeInTheDocument();
    });

    it('calls batchExport with JSON format', async () => {
      mockTasks = [makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'JSON Export' })];
      render(<TaskList />);
      await selectTask('JSON Export');

      fireEvent.click(screen.getByRole('button', { name: /JSON/i }));

      await waitFor(() => {
        expect(mockBatchExport).toHaveBeenCalledWith(
          ['550e8400-e29b-41d4-a716-446655440001'],
          'json',
        );
      });
    });

    it('calls batchExport with CSV format', async () => {
      mockTasks = [makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'CSV Export' })];
      render(<TaskList />);
      await selectTask('CSV Export');

      fireEvent.click(screen.getByRole('button', { name: /CSV/i }));

      await waitFor(() => {
        expect(mockBatchExport).toHaveBeenCalledWith(
          ['550e8400-e29b-41d4-a716-446655440001'],
          'csv',
        );
      });
    });

    it('calls batchExport with HTML format', async () => {
      mockTasks = [makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'HTML Export' })];
      render(<TaskList />);
      await selectTask('HTML Export');

      fireEvent.click(screen.getByRole('button', { name: /HTML/i }));

      await waitFor(() => {
        expect(mockBatchExport).toHaveBeenCalledWith(
          ['550e8400-e29b-41d4-a716-446655440001'],
          'html',
        );
      });
    });

    it('calls batchExport with PDF format', async () => {
      mockTasks = [makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'PDF Export' })];
      render(<TaskList />);
      await selectTask('PDF Export');

      fireEvent.click(screen.getByRole('button', { name: /PDF/i }));

      await waitFor(() => {
        expect(mockBatchExport).toHaveBeenCalledWith(
          ['550e8400-e29b-41d4-a716-446655440001'],
          'pdf',
        );
      });
    });

    it('handles batch export failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockBatchExport.mockRejectedValue(new Error('Export failed'));

      mockTasks = [makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'Fail Export' })];
      render(<TaskList />);
      await selectTask('Fail Export');

      fireEvent.click(screen.getByRole('button', { name: /JSON/i }));

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Batch export failed:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });

    it('does not call batchExport when no tasks selected', () => {
      mockTasks = [makeTask({ id: '550e8400-e29b-41d4-a716-446655440001' })];
      render(<TaskList />);

      // No export buttons should be visible
      expect(screen.queryByRole('button', { name: /JSON/i })).not.toBeInTheDocument();
    });
  });

  // ── Filtering edge cases ──────────────────────────────────────────────

  describe('filtering edge cases', () => {
    it('shows zero count when filter matches no tasks', () => {
      mockTasks = [
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'Running task', status: 'running' }),
      ];
      render(<TaskList />);

      fireEvent.click(screen.getByRole('button', { name: 'Completed' }));

      expect(screen.getByText(/0 tasks/)).toBeInTheDocument();
      expect(screen.getByText('No tasks found')).toBeInTheDocument();
    });

    it('shows all tasks when All filter is active', () => {
      mockTasks = [
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'Task A', status: 'running' }),
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440002', goal: 'Task B', status: 'completed' }),
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440003', goal: 'Task C', status: 'failed' }),
      ];
      render(<TaskList />);

      expect(screen.getByText('Task A')).toBeInTheDocument();
      expect(screen.getByText('Task B')).toBeInTheDocument();
      expect(screen.getByText('Task C')).toBeInTheDocument();
    });

    it('filters correctly to cancelled status', () => {
      mockTasks = [
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'Active task', status: 'running' }),
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440002', goal: 'Cancelled task', status: 'cancelled' }),
      ];
      render(<TaskList />);

      fireEvent.click(screen.getByRole('button', { name: 'Cancelled' }));

      expect(screen.queryByText('Active task')).not.toBeInTheDocument();
      expect(screen.getByText('Cancelled task')).toBeInTheDocument();
    });

    it('filters correctly to queued status', () => {
      mockTasks = [
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'Queued task', status: 'queued' }),
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440002', goal: 'Done task', status: 'completed' }),
      ];
      render(<TaskList />);

      fireEvent.click(screen.getByRole('button', { name: 'Queued' }));

      expect(screen.getByText('Queued task')).toBeInTheDocument();
      expect(screen.queryByText('Done task')).not.toBeInTheDocument();
    });
  });

  // ── Pagination edge cases ─────────────────────────────────────────────

  describe('pagination edge cases', () => {
    it('paginates filtered results correctly', async () => {
      // 12 running tasks + 5 completed = 12 filtered for "Running"
      mockTasks = [
        ...Array.from({ length: 12 }, (_, i) =>
          makeTask({
            id: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
            goal: `Running ${i + 1}`,
            status: 'running',
          }),
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          makeTask({
            id: `550e8400-e29b-41d4-a716-44665544${String(i + 12).padStart(4, '0')}`,
            goal: `Completed ${i + 1}`,
            status: 'completed',
          }),
        ),
      ];
      render(<TaskList />);

      // Filter to running
      fireEvent.click(screen.getByRole('button', { name: 'Running' }));

      await waitFor(() => {
        expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
      });

      // Navigate to page 2
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));

      await waitFor(() => {
        expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
        expect(screen.getByText('Running 11')).toBeInTheDocument();
        expect(screen.getByText('Running 12')).toBeInTheDocument();
      });
    });

    it('does not show pagination when filtered results fit on one page', () => {
      mockTasks = [
        ...Array.from({ length: 5 }, (_, i) =>
          makeTask({
            id: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
            goal: `Running ${i + 1}`,
            status: 'running',
          }),
        ),
        makeTask({
          id: '550e8400-e29b-41d4-a716-446655440099',
          goal: 'Completed',
          status: 'completed',
        }),
      ];
      render(<TaskList />);

      fireEvent.click(screen.getByRole('button', { name: 'Running' }));

      expect(screen.queryByText(/Page/)).not.toBeInTheDocument();
    });
  });

  // ── Task count display ────────────────────────────────────────────────

  describe('task count display', () => {
    it('shows filtered count with status label', () => {
      mockTasks = [
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', status: 'running' }),
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440002', status: 'running' }),
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440003', status: 'completed' }),
      ];
      render(<TaskList />);

      fireEvent.click(screen.getByRole('button', { name: 'Running' }));

      // The header paragraph contains "2 tasks · running"
      expect(screen.getByText(/2 tasks.*running/)).toBeInTheDocument();
    });

    it('shows 0 tasks count for empty filter result', () => {
      mockTasks = [
        makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', status: 'running' }),
      ];
      render(<TaskList />);

      fireEvent.click(screen.getByRole('button', { name: 'Failed' }));

      expect(screen.getByText(/0 tasks/)).toBeInTheDocument();
    });
  });

  // ── Multiple task rendering ───────────────────────────────────────────

  describe('multiple task rendering', () => {
    it('renders many tasks correctly', () => {
      mockTasks = Array.from({ length: 10 }, (_, i) =>
        makeTask({
          id: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
          goal: `Task ${i + 1}`,
          status: i % 2 === 0 ? 'running' : 'completed',
        }),
      );
      render(<TaskList />);

      // First 10 should be on page 1 (PAGE_SIZE = 10)
      expect(screen.getByText('Task 1')).toBeInTheDocument();
      expect(screen.getByText('Task 10')).toBeInTheDocument();
      expect(screen.getByText(/10 tasks/)).toBeInTheDocument();
    });

    it('paginates when more than PAGE_SIZE tasks', () => {
      mockTasks = Array.from({ length: 15 }, (_, i) =>
        makeTask({
          id: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
          goal: `Task ${i + 1}`,
        }),
      );
      render(<TaskList />);

      expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
      expect(screen.getByText('Task 1')).toBeInTheDocument();
      // Task 11 should not be visible on page 1
      expect(screen.queryByText('Task 11')).not.toBeInTheDocument();
    });
  });

  // ── Loading and empty states ──────────────────────────────────────────

  describe('loading and empty states', () => {
    it('shows loading spinner with text', () => {
      mockIsLoading = true;
      render(<TaskList />);
      expect(screen.getByText('Loading tasks...')).toBeInTheDocument();
    });

    it('does not show task grid when loading', () => {
      mockIsLoading = true;
      mockTasks = [makeTask()];
      render(<TaskList />);
      expect(screen.queryByText('Test the login flow')).not.toBeInTheDocument();
    });

    it('shows empty state with create hint', () => {
      mockTasks = [];
      render(<TaskList />);
      expect(screen.getByText('No tasks found')).toBeInTheDocument();
      expect(screen.getByText(/Create your first task/)).toBeInTheDocument();
    });

    it('does not show empty state when loading', () => {
      mockIsLoading = true;
      mockTasks = [];
      render(<TaskList />);
      expect(screen.queryByText('No tasks found')).not.toBeInTheDocument();
    });

    it('does not show empty state when error exists', () => {
      mockError = 'Error';
      mockTasks = [];
      render(<TaskList />);
      expect(screen.queryByText('No tasks found')).not.toBeInTheDocument();
    });
  });
});
