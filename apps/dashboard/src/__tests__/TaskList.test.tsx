import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Task } from '@eata/shared-types';
import TaskList from '../pages/TaskList';

// Mock taskStore
const mockFetchTasks = vi.fn().mockResolvedValue(undefined);
let mockTasks: Task[] = [];
let mockIsLoading = false;

vi.mock('../stores/taskStore', () => ({
  useTaskStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      tasks: mockTasks,
      isLoading: mockIsLoading,
      fetchTasks: mockFetchTasks,
    }),
}));

// Mock react-router-dom (used by TaskCard children)
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock CreateTaskForm to avoid its own dependencies
vi.mock('../components/CreateTaskForm', () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-task-form">Create Task Form</div> : null,
}));

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  goal: 'Test the login flow',
  targetAppPath: '/test/app',
  llmModel: 'gpt-4o',
  status: 'running',
  maxSteps: 50,
  stepCount: 12,
  createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('TaskList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTasks = [];
    mockIsLoading = false;
    mockFetchTasks.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders the page title', () => {
    render(<TaskList />);
    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });

  it('calls fetchTasks on mount', () => {
    render(<TaskList />);
    expect(mockFetchTasks).toHaveBeenCalled();
  });

  it('shows loading state', () => {
    mockIsLoading = true;
    render(<TaskList />);
    expect(screen.getByText('Loading tasks...')).toBeInTheDocument();
  });

  it('displays empty state message when no tasks', () => {
    mockTasks = [];
    render(<TaskList />);
    expect(screen.getByText('No tasks found')).toBeInTheDocument();
    expect(screen.getByText(/Create your first task/)).toBeInTheDocument();
  });

  it('renders task list with tasks', () => {
    mockTasks = [
      makeTask({ id: '550e8400-e29b-41d4-a716-446655440000', goal: 'Test login' }),
      makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'Test checkout' }),
    ];
    render(<TaskList />);
    expect(screen.getByText('Test login')).toBeInTheDocument();
    expect(screen.getByText('Test checkout')).toBeInTheDocument();
  });

  it('shows task count in header', () => {
    mockTasks = [
      makeTask({ id: '550e8400-e29b-41d4-a716-446655440000' }),
      makeTask({ id: '550e8400-e29b-41d4-a716-446655440001' }),
      makeTask({ id: '550e8400-e29b-41d4-a716-446655440002' }),
    ];
    render(<TaskList />);
    expect(screen.getByText(/3 tasks/)).toBeInTheDocument();
  });

  it('shows singular task count', () => {
    mockTasks = [makeTask({ id: '550e8400-e29b-41d4-a716-446655440000' })];
    render(<TaskList />);
    // Text may include whitespace from JSX; match "1 task" without "tasks"
    expect(screen.getByText((content) => /1\s+task\b/.test(content) && !content.includes('tasks'))).toBeInTheDocument();
  });

  it('renders status filter buttons', () => {
    render(<TaskList />);
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Queued' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Running' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Completed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Failed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelled' })).toBeInTheDocument();
  });

  it('filters tasks by status', async () => {
    mockTasks = [
      makeTask({ id: '550e8400-e29b-41d4-a716-446655440000', goal: 'Running task', status: 'running' }),
      makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', goal: 'Completed task', status: 'completed' }),
    ];
    render(<TaskList />);

    // Both visible with "All" filter
    expect(screen.getByText('Running task')).toBeInTheDocument();
    expect(screen.getByText('Completed task')).toBeInTheDocument();

    // Click "Running" filter
    fireEvent.click(screen.getByRole('button', { name: 'Running' }));

    await waitFor(() => {
      expect(screen.getByText('Running task')).toBeInTheDocument();
      expect(screen.queryByText('Completed task')).not.toBeInTheDocument();
    });
  });

  it('shows filter status in count text', async () => {
    mockTasks = [
      makeTask({ id: '550e8400-e29b-41d4-a716-446655440000', status: 'running' }),
      makeTask({ id: '550e8400-e29b-41d4-a716-446655440001', status: 'completed' }),
    ];
    render(<TaskList />);

    fireEvent.click(screen.getByRole('button', { name: 'Running' }));

    await waitFor(() => {
      expect(screen.getByText(/running/)).toBeInTheDocument();
    });
  });

  it('opens create task dialog when clicking New Task', () => {
    render(<TaskList />);
    fireEvent.click(screen.getByText('New Task'));
    expect(screen.getByTestId('create-task-form')).toBeInTheDocument();
  });

  it('opens create task dialog from empty state hint', () => {
    mockTasks = [];
    render(<TaskList />);
    fireEvent.click(screen.getByText(/Create your first task/));
    expect(screen.getByTestId('create-task-form')).toBeInTheDocument();
  });

  it('shows task cards with correct info', () => {
    mockTasks = [
      makeTask({
        id: '550e8400-e29b-41d4-a716-446655440000',
        goal: 'Verify signup flow',
        llmModel: 'gpt-4o',
        stepCount: 8,
        status: 'completed',
      }),
    ];
    render(<TaskList />);

    expect(screen.getByText('Verify signup flow')).toBeInTheDocument();
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('8 steps')).toBeInTheDocument();
    // "Completed" appears in both the filter button and the task card status badge
    expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(2);
  });

  it('renders pagination when tasks exceed page size', () => {
    // PAGE_SIZE is 10, so create 11 tasks
    mockTasks = Array.from({ length: 11 }, (_, i) =>
      makeTask({
        id: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
        goal: `Task ${i + 1}`,
      }),
    );
    render(<TaskList />);

    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('navigates pages with next and previous buttons', async () => {
    mockTasks = Array.from({ length: 11 }, (_, i) =>
      makeTask({
        id: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
        goal: `Task ${i + 1}`,
      }),
    );
    render(<TaskList />);

    // First page shows Task 1
    expect(screen.getByText('Task 1')).toBeInTheDocument();

    // Click Next
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
      expect(screen.getByText('Task 11')).toBeInTheDocument();
    });

    // Click Previous
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));

    await waitFor(() => {
      expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    });
  });

  it('disables previous button on first page', () => {
    mockTasks = Array.from({ length: 11 }, (_, i) =>
      makeTask({
        id: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
        goal: `Task ${i + 1}`,
      }),
    );
    render(<TaskList />);

    const prevBtn = screen.getByRole('button', { name: 'Previous' });
    expect(prevBtn).toBeDisabled();
  });

  it('disables next button on last page', async () => {
    mockTasks = Array.from({ length: 11 }, (_, i) =>
      makeTask({
        id: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
        goal: `Task ${i + 1}`,
      }),
    );
    render(<TaskList />);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      const freshNextBtn = screen.getByRole('button', { name: 'Next' });
      expect(freshNextBtn).toBeDisabled();
    });
  });

  it('does not show pagination when tasks fit in one page', () => {
    mockTasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({
        id: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
        goal: `Task ${i + 1}`,
      }),
    );
    render(<TaskList />);

    expect(screen.queryByText(/Page/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('resets page when filter changes', async () => {
    // Create enough tasks across statuses to have pagination
    mockTasks = [
      ...Array.from({ length: 12 }, (_, i) =>
        makeTask({
          id: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
          goal: `Running ${i + 1}`,
          status: 'running',
        }),
      ),
      makeTask({
        id: '550e8400-e29b-41d4-a716-446655440099',
        goal: 'Completed task',
        status: 'completed',
      }),
    ];
    render(<TaskList />);

    // Go to page 2
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(screen.getByText(/Page 2/)).toBeInTheDocument();
    });

    // Switch filter to "Completed" - should reset to page 1
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));

    await waitFor(() => {
      expect(screen.getByText('Completed task')).toBeInTheDocument();
    });
  });
});
