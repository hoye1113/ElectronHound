import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ScheduleList from '../pages/ScheduleList';
import CreateScheduleForm from '../components/CreateScheduleForm';
import ScheduleHistory from '../components/ScheduleHistory';

const { mockSchedules, mockTemplates, mockRuns } = vi.hoisted(() => ({
  mockSchedules: [
    {
      id: 'sch-1',
      name: 'Daily Test',
      templateId: 'tpl-1',
      cronExpression: '0 9 * * *',
      enabled: true,
      lastStatus: 'completed',
      lastRunAt: '2026-05-30T09:00:00Z',
      nextRunAt: '2026-05-31T09:00:00Z',
      runCount: 5,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-30T09:00:00Z',
    },
    {
      id: 'sch-2',
      name: 'Weekly Report',
      templateId: 'tpl-2',
      cronExpression: '0 10 * * 1',
      enabled: false,
      lastStatus: 'failed',
      lastRunAt: '2026-05-27T10:00:00Z',
      nextRunAt: null,
      runCount: 2,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-27T10:00:00Z',
    },
  ],
  mockTemplates: [
    { id: 'tpl-1', name: 'Login Test', goal: 'Test login', steps: [] },
    { id: 'tpl-2', name: 'Checkout Test', goal: 'Test checkout', steps: [] },
  ],
  mockRuns: [
    {
      id: 'run-1',
      scheduleId: 'sch-1',
      status: 'completed',
      startedAt: '2026-05-30T09:00:00Z',
      completedAt: '2026-05-30T09:05:00Z',
      taskId: 'task-123',
    },
    {
      id: 'run-2',
      scheduleId: 'sch-1',
      status: 'failed',
      startedAt: '2026-05-29T09:00:00Z',
      completedAt: '2026-05-29T09:01:00Z',
      error: 'Template not found',
    },
  ],
}));

vi.mock('../lib/api', () => ({
  api: {
    schedules: {
      list: vi.fn().mockImplementation(() => Promise.resolve({ data: mockSchedules, total: mockSchedules.length })),
      create: vi.fn().mockImplementation(() => Promise.resolve({ data: { id: 'sch-new' } })),
      update: vi.fn().mockImplementation(() => Promise.resolve({ data: {} })),
      delete: vi.fn().mockImplementation(() => Promise.resolve({ data: {} })),
      run: vi.fn().mockImplementation(() => Promise.resolve({ data: {} })),
      history: vi.fn().mockImplementation(() => Promise.resolve({ data: mockRuns, total: mockRuns.length })),
    },
    templates: {
      list: vi.fn().mockImplementation(() => Promise.resolve({ data: mockTemplates })),
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts?.count !== undefined) return `${key}:${opts.count}`;
      return key;
    },
  }),
}));

vi.mock('lucide-react', () => ({
  Plus: () => <span>Plus</span>,
  Play: () => <span>Play</span>,
  Trash2: () => <span>Trash2</span>,
  Clock: () => <span>Clock</span>,
  History: () => <span>History</span>,
  ToggleLeft: () => <span>ToggleLeft</span>,
  ToggleRight: () => <span>ToggleRight</span>,
  X: () => <span>X</span>,
  Check: () => <span>Check</span>,
  ExternalLink: () => <span>ExternalLink</span>,
}));

vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open !== false ? <div data-testid="dialog-root">{children}</div> : null,
  Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Overlay: () => <div data-testid="dialog-overlay" />,
  Content: ({ children, ...props }: { children: React.ReactNode }) =>
    <div data-testid="dialog-content" {...props}>{children}</div>,
  Title: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  Close: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

describe('ScheduleList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    render(<ScheduleList />);
    expect(screen.getByText('common.loading')).toBeDefined();
  });

  it('renders schedule list after loading', async () => {
    render(<ScheduleList />);
    await waitFor(() => {
      expect(screen.getByText('Daily Test')).toBeDefined();
    });
    expect(screen.getByText('Weekly Report')).toBeDefined();
  });

  it('displays cron expressions', async () => {
    render(<ScheduleList />);
    await waitFor(() => {
      expect(screen.getByText('0 9 * * *')).toBeDefined();
    });
    expect(screen.getByText('0 10 * * 1')).toBeDefined();
  });

  it('shows run count', async () => {
    render(<ScheduleList />);
    await waitFor(() => {
      expect(screen.getByText('scheduleList.runCount:5')).toBeDefined();
    });
  });

  it('shows status badges', async () => {
    render(<ScheduleList />);
    await waitFor(() => {
      expect(screen.getByText('completed')).toBeDefined();
    });
    expect(screen.getByText('failed')).toBeDefined();
  });

  it('renders empty state when no schedules', async () => {
    const { api } = await import('../lib/api');
    vi.mocked(api.schedules.list).mockResolvedValueOnce({ data: [], total: 0 });
    render(<ScheduleList />);
    await waitFor(() => {
      expect(screen.getByText('scheduleList.empty')).toBeDefined();
    });
  });

  it('opens create dialog when clicking new schedule', async () => {
    render(<ScheduleList />);
    await waitFor(() => {
      expect(screen.getByText('Daily Test')).toBeDefined();
    });
    fireEvent.click(screen.getByText('scheduleList.newSchedule'));
    await waitFor(() => {
      expect(screen.getByText('scheduleForm.createTitle')).toBeDefined();
    });
  });

  it('opens edit dialog when clicking edit', async () => {
    render(<ScheduleList />);
    await waitFor(() => {
      expect(screen.getByText('Daily Test')).toBeDefined();
    });
    const editButtons = screen.getAllByText('common.edit');
    fireEvent.click(editButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('scheduleForm.editTitle')).toBeDefined();
    });
  });

  it('calls run API when clicking run button', async () => {
    const { api } = await import('../lib/api');
    render(<ScheduleList />);
    await waitFor(() => {
      expect(screen.getByText('Daily Test')).toBeDefined();
    });
    const runButtons = screen.getAllByText('scheduleList.runNow');
    fireEvent.click(runButtons[0]);
    await waitFor(() => {
      expect(api.schedules.run).toHaveBeenCalledWith('sch-1');
    });
  });

  it('calls delete API when confirming delete', async () => {
    const { api } = await import('../lib/api');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ScheduleList />);
    await waitFor(() => {
      expect(screen.getByText('Daily Test')).toBeDefined();
    });
    const deleteButtons = screen.getAllByText('Trash2');
    fireEvent.click(deleteButtons[0]);
    await waitFor(() => {
      expect(api.schedules.delete).toHaveBeenCalledWith('sch-1');
    });
  });

  it('does not delete when confirm is cancelled', async () => {
    const { api } = await import('../lib/api');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ScheduleList />);
    await waitFor(() => {
      expect(screen.getByText('Daily Test')).toBeDefined();
    });
    const deleteButtons = screen.getAllByText('Trash2');
    fireEvent.click(deleteButtons[0]);
    expect(api.schedules.delete).not.toHaveBeenCalled();
  });

  it('toggles schedule enabled state', async () => {
    const { api } = await import('../lib/api');
    render(<ScheduleList />);
    await waitFor(() => {
      expect(screen.getByText('Daily Test')).toBeDefined();
    });
    const toggleButtons = screen.getAllByText('ToggleRight');
    fireEvent.click(toggleButtons[0]);
    await waitFor(() => {
      expect(api.schedules.update).toHaveBeenCalledWith('sch-1', { enabled: false });
    });
  });

  it('opens history dialog when clicking history', async () => {
    render(<ScheduleList />);
    await waitFor(() => {
      expect(screen.getByText('Daily Test')).toBeDefined();
    });
    const historyButtons = screen.getAllByText('History');
    fireEvent.click(historyButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('scheduleHistory.title')).toBeDefined();
    });
  });
});

describe('CreateScheduleForm', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    schedule: null,
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create title for new schedule', () => {
    render(<CreateScheduleForm {...defaultProps} />);
    expect(screen.getByText('scheduleForm.createTitle')).toBeDefined();
  });

  it('renders edit title for existing schedule', () => {
    render(<CreateScheduleForm {...defaultProps} schedule={mockSchedules[0]} />);
    expect(screen.getByText('scheduleForm.editTitle')).toBeDefined();
  });

  it('loads templates on open', async () => {
    const { api } = await import('../lib/api');
    render(<CreateScheduleForm {...defaultProps} />);
    await waitFor(() => {
      expect(api.templates.list).toHaveBeenCalled();
    });
  });

  it('shows template options', async () => {
    render(<CreateScheduleForm {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Login Test')).toBeDefined();
    });
    expect(screen.getByText('Checkout Test')).toBeDefined();
  });

  it('populates fields when editing', () => {
    render(<CreateScheduleForm {...defaultProps} schedule={mockSchedules[0]} />);
    expect(screen.getByDisplayValue('Daily Test')).toBeDefined();
    expect(screen.getByDisplayValue('0 9 * * *')).toBeDefined();
  });

  it('validates required fields', async () => {
    render(<CreateScheduleForm {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByText('common.save'));
    });
    await waitFor(() => {
      expect(screen.getByText('scheduleForm.nameRequired')).toBeDefined();
      expect(screen.getByText('scheduleForm.templateRequired')).toBeDefined();
    });
  });

  it('validates cron expression format', async () => {
    render(<CreateScheduleForm {...defaultProps} />);
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('scheduleForm.namePlaceholder'), { target: { value: 'Test' } });
      // Simulate selecting a template by directly setting the value
      const select = screen.getByRole('combobox');
      Object.defineProperty(select, 'value', { value: 'tpl-1', writable: true });
      fireEvent.change(select);
      fireEvent.change(screen.getByPlaceholderText('0 9 * * *'), { target: { value: 'invalid' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText('common.save'));
    });
    await waitFor(() => {
      expect(screen.getByText('scheduleForm.cronInvalid')).toBeDefined();
    });
  });

  it('submits new schedule', async () => {
    const { api } = await import('../lib/api');
    const onSuccess = vi.fn();
    render(<CreateScheduleForm {...defaultProps} onSuccess={onSuccess} />);
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('scheduleForm.namePlaceholder'), { target: { value: 'New Schedule' } });
      // Simulate selecting a template by directly setting the value
      const select = screen.getByRole('combobox');
      Object.defineProperty(select, 'value', { value: 'tpl-1', writable: true });
      fireEvent.change(select);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('common.save'));
    });
    await waitFor(() => {
      expect(api.schedules.create).toHaveBeenCalledWith({
        name: 'New Schedule',
        templateId: 'tpl-1',
        cronExpression: '0 9 * * *',
        enabled: true,
      });
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('submits updated schedule', async () => {
    const { api } = await import('../lib/api');
    const onSuccess = vi.fn();
    render(<CreateScheduleForm {...defaultProps} schedule={mockSchedules[0]} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByDisplayValue('Daily Test'), { target: { value: 'Updated Schedule' } });
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() => {
      expect(api.schedules.update).toHaveBeenCalledWith('sch-1', expect.objectContaining({ name: 'Updated Schedule' }));
    });
  });

  it('calls onOpenChange when cancelling', () => {
    const onOpenChange = vi.fn();
    render(<CreateScheduleForm {...defaultProps} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByText('common.cancel'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('ScheduleHistory', () => {
  const defaultProps = {
    scheduleId: 'sch-1',
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    render(<ScheduleHistory {...defaultProps} />);
    expect(screen.getByTestId('dialog-content')).toBeDefined();
  });

  it('displays run history', async () => {
    render(<ScheduleHistory {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('completed')).toBeDefined();
      expect(screen.getByText('failed')).toBeDefined();
    });
  });

  it('shows task link for completed runs', async () => {
    render(<ScheduleHistory {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('scheduleHistory.viewTask')).toBeDefined();
    });
  });

  it('shows error message for failed runs', async () => {
    render(<ScheduleHistory {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Template not found')).toBeDefined();
    });
  });

  it('shows empty state when no runs', async () => {
    const { api } = await import('../lib/api');
    vi.mocked(api.schedules.history).mockResolvedValueOnce({ data: [], total: 0 });
    render(<ScheduleHistory {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('scheduleHistory.empty')).toBeDefined();
    });
  });

  it('calls onClose when dialog closes', async () => {
    const onClose = vi.fn();
    render(<ScheduleHistory {...defaultProps} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText('completed')).toBeDefined();
    });
  });
});
