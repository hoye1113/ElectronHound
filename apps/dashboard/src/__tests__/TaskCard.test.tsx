import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Task } from '@eata/shared-types';
import TaskCard from '../components/TaskCard';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock taskStore
const mockCancelTask = vi.fn();
const mockDeleteTask = vi.fn();
vi.mock('../stores/taskStore', () => ({
  useTaskStore: (selector: (s: unknown) => unknown) =>
    selector({
      cancelTask: mockCancelTask,
      deleteTask: mockDeleteTask,
    }),
}));

const mockTask: Task = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  goal: 'Test the login flow of the application',
  targetAppPath: '/test/app',
  llmModel: 'gpt-4o',
  status: 'running',
  priority: 'medium',
  maxSteps: 50,
  stepCount: 12,
  createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('TaskCard', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockCancelTask.mockClear();
    mockDeleteTask.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders task goal', () => {
    render(<TaskCard task={mockTask} />);
    expect(screen.getByText('Test the login flow of the application')).toBeInTheDocument();
  });

  it('renders status badge with correct label', () => {
    render(<TaskCard task={mockTask} />);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('renders model name and step count', () => {
    render(<TaskCard task={mockTask} />);
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('12 steps')).toBeInTheDocument();
  });

  it('navigates to task detail on click', () => {
    const { container } = render(<TaskCard task={mockTask} />);
    const card = container.querySelector('[role="button"]');
    expect(card).not.toBeNull();
    fireEvent.click(card!);
    expect(mockNavigate).toHaveBeenCalledWith('/task/550e8400-e29b-41d4-a716-446655440000');
  });

  it('navigates on Enter key press', () => {
    const { container } = render(<TaskCard task={mockTask} />);
    const card = container.querySelector('[role="button"]');
    expect(card).not.toBeNull();
    fireEvent.keyDown(card!, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/task/550e8400-e29b-41d4-a716-446655440000');
  });

  it('shows cancel button for running tasks', () => {
    const { container } = render(<TaskCard task={mockTask} />);
    const card = container.querySelector('[role="button"]');
    expect(card).not.toBeNull();
    fireEvent.mouseEnter(card!);
    expect(screen.getByLabelText('Cancel task')).toBeInTheDocument();
  });

  it('calls cancelTask when cancel is clicked', async () => {
    const { container } = render(<TaskCard task={mockTask} />);
    const card = container.querySelector('[role="button"]');
    expect(card).not.toBeNull();
    fireEvent.mouseEnter(card!);
    fireEvent.click(screen.getByLabelText('Cancel task'));
    expect(mockCancelTask).toHaveBeenCalledWith(mockTask.id);
  });

  it('does not show cancel button for completed tasks', () => {
    const completedTask = { ...mockTask, status: 'completed' as const };
    const { container } = render(<TaskCard task={completedTask} />);
    const card = container.querySelector('[role="button"]');
    expect(card).not.toBeNull();
    fireEvent.mouseEnter(card!);
    expect(screen.queryByLabelText('Cancel task')).not.toBeInTheDocument();
  });

  it('shows delete button for completed tasks', () => {
    const completedTask = { ...mockTask, status: 'completed' as const };
    const { container } = render(<TaskCard task={completedTask} />);
    const card = container.querySelector('[role="button"]');
    expect(card).not.toBeNull();
    fireEvent.mouseEnter(card!);
    expect(screen.getByLabelText('Delete task')).toBeInTheDocument();
  });

  it('calls deleteTask when delete is clicked', async () => {
    const completedTask = { ...mockTask, status: 'completed' as const };
    const { container } = render(<TaskCard task={completedTask} />);
    const card = container.querySelector('[role="button"]');
    expect(card).not.toBeNull();
    fireEvent.mouseEnter(card!);
    fireEvent.click(screen.getByLabelText('Delete task'));
    expect(mockDeleteTask).toHaveBeenCalledWith(mockTask.id);
  });

  it('shows correct status for each state', () => {
    const statuses: Task['status'][] = ['queued', 'running', 'completed', 'failed', 'cancelled', 'aborted'];
    const labels = ['Queued', 'Running', 'Completed', 'Failed', 'Cancelled', 'Aborted'];

    statuses.forEach((status, i) => {
      const { unmount, getByText } = render(<TaskCard task={{ ...mockTask, status }} />);
      expect(getByText(labels[i])).toBeInTheDocument();
      unmount();
    });
  });
});
