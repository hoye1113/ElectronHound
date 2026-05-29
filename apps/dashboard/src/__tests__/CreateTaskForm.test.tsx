import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateTaskForm from '../components/CreateTaskForm';

// Mock taskStore
const mockCreateTask = vi.fn().mockResolvedValue(undefined);
vi.mock('../stores/taskStore', () => ({
  useTaskStore: (selector: (s: unknown) => unknown) =>
    selector({
      createTask: mockCreateTask,
    }),
}));

describe('CreateTaskForm', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
  };

  beforeEach(() => {
    mockCreateTask.mockClear();
    mockCreateTask.mockResolvedValue(undefined);
    (defaultProps.onOpenChange as ReturnType<typeof vi.fn>).mockClear();
    // Mock fetch for api.providers.list() - returns empty list
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ version: 1, providers: [], activeId: '' }),
      }),
    ));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders form fields when open', () => {
    render(<CreateTaskForm {...defaultProps} />);
    expect(screen.getByLabelText('Goal')).toBeInTheDocument();
    expect(screen.getByLabelText('Target App Path')).toBeInTheDocument();
    expect(screen.getByText('LLM Model:')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<CreateTaskForm {...defaultProps} open={false} />);
    expect(screen.queryByLabelText('Goal')).not.toBeInTheDocument();
  });

  it('submits valid form data with default model', async () => {
    render(<CreateTaskForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Goal'), {
      target: { value: 'Test the checkout flow' },
    });
    fireEvent.change(screen.getByLabelText('Target App Path'), {
      target: { value: '/apps/checkout' },
    });

    // Use default model (gpt-4o) since Radix Select doesn't open in jsdom
    fireEvent.click(screen.getByText('Create Task'));

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          goal: 'Test the checkout flow',
          targetAppPath: '/apps/checkout',
          llmModel: 'gpt-4o',
          maxSteps: 50,
        }),
      );
    });
  });

  it('shows validation error for empty goal', async () => {
    render(<CreateTaskForm {...defaultProps} />);

    // Fill only targetAppPath, leave goal empty
    fireEvent.change(screen.getByLabelText('Target App Path'), {
      target: { value: '/apps/checkout' },
    });

    fireEvent.click(screen.getByText('Create Task'));

    await waitFor(() => {
      expect(screen.getByText(/Goal is required/)).toBeInTheDocument();
    });
  });

  it('shows validation error for empty targetAppPath', async () => {
    render(<CreateTaskForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Goal'), {
      target: { value: 'Test something' },
    });

    fireEvent.click(screen.getByText('Create Task'));

    await waitFor(() => {
      expect(screen.getByText(/Target app path is required/)).toBeInTheDocument();
    });
  });

  it('calls onOpenChange with false on success', async () => {
    render(<CreateTaskForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Goal'), {
      target: { value: 'Test the login flow' },
    });
    fireEvent.change(screen.getByLabelText('Target App Path'), {
      target: { value: '/apps/login' },
    });

    fireEvent.click(screen.getByText('Create Task'));

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('calls onSuccess callback after successful creation', async () => {
    const onSuccess = vi.fn();
    render(<CreateTaskForm {...defaultProps} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText('Goal'), {
      target: { value: 'Test the signup flow' },
    });
    fireEvent.change(screen.getByLabelText('Target App Path'), {
      target: { value: '/apps/signup' },
    });

    fireEvent.click(screen.getByText('Create Task'));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('resets form on close', () => {
    const { rerender } = render(<CreateTaskForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Goal'), {
      target: { value: 'Some goal' },
    });
    expect((screen.getByLabelText('Goal') as HTMLTextAreaElement).value).toBe('Some goal');

    // Close the dialog - useEffect triggers reset
    rerender(<CreateTaskForm open={false} onOpenChange={defaultProps.onOpenChange} />);

    // Re-open and check form is reset
    rerender(<CreateTaskForm open={true} onOpenChange={defaultProps.onOpenChange} />);
    expect((screen.getByLabelText('Goal') as HTMLTextAreaElement).value).toBe('');
  });

  it('renders provider selector when providers are loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          version: 1,
          providers: [
            { id: 'p1', name: 'Provider 1', model: 'gpt-4o', type: 'openai-compatible', apiKey: '', baseURL: '' },
            { id: 'p2', name: 'Provider 2', model: 'claude-3', type: 'openai-compatible', apiKey: '', baseURL: '' },
          ],
          activeId: 'p1',
        }),
      }),
    ));

    render(<CreateTaskForm {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('LLM Provider')).toBeInTheDocument();
    });
  });

  it('handles provider loading failure gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network error'))));

    render(<CreateTaskForm {...defaultProps} />);

    // Form should still render and be functional
    await waitFor(() => {
      expect(screen.getByLabelText('Goal')).toBeInTheDocument();
      expect(screen.getByLabelText('Target App Path')).toBeInTheDocument();
    });
  });

  it('displays error message when createTask fails', async () => {
    mockCreateTask.mockRejectedValueOnce(new Error('Server error'));

    render(<CreateTaskForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Goal'), {
      target: { value: 'Test' },
    });
    fireEvent.change(screen.getByLabelText('Target App Path'), {
      target: { value: '/app' },
    });
    fireEvent.click(screen.getByText('Create Task'));

    await waitFor(() => {
      expect(screen.getByText(/Failed to create task/)).toBeInTheDocument();
    });
  });

  it('disables submit button while submitting', async () => {
    let resolveCreate: (v: unknown) => void;
    mockCreateTask.mockReturnValueOnce(new Promise((r) => { resolveCreate = r; }));

    render(<CreateTaskForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Goal'), {
      target: { value: 'Test' },
    });
    fireEvent.change(screen.getByLabelText('Target App Path'), {
      target: { value: '/app' },
    });
    fireEvent.click(screen.getByText('Create Task'));

    await waitFor(() => {
      expect(screen.getByText('Creating...')).toBeDisabled();
    });

    resolveCreate!(undefined);
  });

  it('includes providerId in submission when provider is auto-selected via activeId', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          version: 1,
          providers: [
            { id: 'p1', name: 'Provider 1', model: 'gpt-4o', type: 'openai-compatible', apiKey: '', baseURL: '' },
          ],
          activeId: 'p1',
        }),
      }),
    ));

    render(<CreateTaskForm {...defaultProps} />);

    // Wait for providers to load and auto-select activeId
    await waitFor(() => {
      expect(screen.getByText('LLM Provider')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Goal'), {
      target: { value: 'Test with provider' },
    });
    fireEvent.change(screen.getByLabelText('Target App Path'), {
      target: { value: '/app' },
    });
    fireEvent.click(screen.getByText('Create Task'));

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'p1' }),
      );
    });
  });
});
