import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ReportTemplates from '../pages/ReportTemplates';
import type { ReportTemplate, ReportSection, ReportStyling } from '../lib/api';

// Mock api module
const mockList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    reportTemplates: {
      list: (...args: unknown[]) => mockList(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

function makeSections(overrides: Partial<ReportSection>[] = []): ReportSection[] {
  const defaults: ReportSection[] = [
    { id: 's1', type: 'summary', title: 'Summary', enabled: true, order: 0 },
    { id: 's2', type: 'steps', title: 'Steps', enabled: true, order: 1 },
    { id: 's3', type: 'screenshots', title: 'Screenshots', enabled: true, order: 2 },
  ];
  return defaults.map((d, i) => (overrides[i] ? { ...d, ...overrides[i] } : d));
}

function makeStyling(overrides: Partial<ReportStyling> = {}): ReportStyling {
  return { theme: 'auto', primaryColor: '#3b82f6', ...overrides };
}

function makeTemplate(overrides: Partial<ReportTemplate> = {}): ReportTemplate {
  return {
    id: 'rt-1',
    name: 'Default Report',
    description: 'Standard test report',
    sections: makeSections(),
    styling: makeStyling(),
    isDefault: false,
    ...overrides,
  };
}

const defaultTemplate = makeTemplate({
  id: 'rt-default',
  name: 'Default Template',
  isDefault: true,
});

const customTemplate = makeTemplate({
  id: 'rt-custom',
  name: 'Custom Report',
  description: 'A custom report template',
  isDefault: false,
});

describe('ReportTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ data: [] });
    mockCreate.mockResolvedValue(makeTemplate({ id: 'rt-new' }));
    mockUpdate.mockResolvedValue(makeTemplate());
    mockDelete.mockResolvedValue(undefined);
  });

  // ─── Rendering ───────────────────────────────────────────────────────────

  it('renders loading state initially', async () => {
    mockList.mockReturnValue(new Promise(() => {}));
    render(<ReportTemplates />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders empty state when no templates exist', async () => {
    mockList.mockResolvedValue({ data: [] });
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('No report templates found')).toBeInTheDocument();
    });
    expect(screen.getByText('Create a report template to customize report layouts')).toBeInTheDocument();
  });

  it('renders template list from API', async () => {
    mockList.mockResolvedValue({ data: [makeTemplate(), defaultTemplate] });
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('Default Report')).toBeInTheDocument();
      expect(screen.getByText('Default Template')).toBeInTheDocument();
    });
  });

  it('renders page title and subtitle', async () => {
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('Report Templates')).toBeInTheDocument();
      expect(screen.getByText('Manage report layout and styling templates')).toBeInTheDocument();
    });
  });

  it('shows default badge on default templates', async () => {
    mockList.mockResolvedValue({ data: [defaultTemplate] });
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('Default Template')).toBeInTheDocument();
    });

    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('shows section badges on template cards', async () => {
    mockList.mockResolvedValue({ data: [makeTemplate()] });
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('Default Report')).toBeInTheDocument();
    });

    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Steps')).toBeInTheDocument();
    expect(screen.getByText('Screenshots')).toBeInTheDocument();
  });

  it('shows edit and delete buttons on each card', async () => {
    mockList.mockResolvedValue({ data: [makeTemplate()] });
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('Default Report')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText('Edit');
    expect(editButtons).toHaveLength(1);
    const deleteButtons = screen.getAllByText('Delete');
    expect(deleteButtons).toHaveLength(1);
  });

  // ─── Create ──────────────────────────────────────────────────────────────

  it('opens create dialog when clicking New Template', async () => {
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('No report templates found')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Template'));

    expect(screen.getByText('New Report Template')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  it('validates required name field in create dialog', async () => {
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('No report templates found')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Template'));
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
  });

  it('creates a new template via API', async () => {
    mockList.mockResolvedValue({ data: [] });
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('No report templates found')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Template'));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My Report' } });

    mockList.mockResolvedValueOnce({
      data: [makeTemplate({ id: 'rt-new', name: 'My Report' })],
    });

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Report',
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('My Report')).toBeInTheDocument();
    });
  });

  // ─── Edit ────────────────────────────────────────────────────────────────

  it('opens edit dialog with pre-filled data', async () => {
    mockList.mockResolvedValue({ data: [customTemplate] });
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('Custom Report')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Edit'));

    expect(screen.getByText('Edit Report Template')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Custom Report');
  });

  it('updates template via API on edit save', async () => {
    mockList.mockResolvedValue({ data: [customTemplate] });
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('Custom Report')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Edit'));

    const nameInput = screen.getByLabelText('Name');
    fireEvent.change(nameInput, { target: { value: 'Updated Report' } });

    mockList.mockResolvedValueOnce({
      data: [makeTemplate({ id: 'rt-custom', name: 'Updated Report' })],
    });

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        'rt-custom',
        expect.objectContaining({ name: 'Updated Report' }),
      );
    });
  });

  // ─── Delete ──────────────────────────────────────────────────────────────

  it('shows delete confirmation dialog', async () => {
    mockList.mockResolvedValue({ data: [customTemplate] });
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('Custom Report')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText(/Delete report template "Custom Report"/)).toBeInTheDocument();
    });
  });

  it('deletes template after confirmation', async () => {
    mockList.mockResolvedValue({ data: [customTemplate] });
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('Custom Report')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText(/Delete report template "Custom Report"/)).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    const confirmDeleteBtn = within(dialog).getByRole('button', { name: /Delete/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('rt-custom');
    });

    await waitFor(() => {
      expect(screen.queryByText('Custom Report')).not.toBeInTheDocument();
    });
  });

  it('cancels delete when clicking cancel', async () => {
    mockList.mockResolvedValue({ data: [customTemplate] });
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('Custom Report')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText(/Delete report template "Custom Report"/)).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText(/Delete report template/)).not.toBeInTheDocument();
    });

    expect(mockDelete).not.toHaveBeenCalled();
  });

  // ─── Error handling ──────────────────────────────────────────────────────

  it('handles template list fetch failure gracefully', async () => {
    mockList.mockRejectedValue(new Error('Network error'));
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('No report templates found')).toBeInTheDocument();
    });
  });

  it('handles delete API failure gracefully', async () => {
    mockDelete.mockRejectedValue(new Error('Delete failed'));
    mockList.mockResolvedValue({ data: [customTemplate] });
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('Custom Report')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText(/Delete report template "Custom Report"/)).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete/i }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('rt-custom');
    });
  });

  // ─── Sections management in editor ──────────────────────────────────────

  it('allows adding sections in the editor', async () => {
    mockList.mockResolvedValue({ data: [] });
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('No report templates found')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Template'));

    // Default has 3 sections
    const sectionRows = screen.getAllByRole('combobox');
    expect(sectionRows).toHaveLength(3);

    fireEvent.click(screen.getByText('Add Section'));

    const updatedRows = screen.getAllByRole('combobox');
    expect(updatedRows).toHaveLength(4);
  });

  it('allows removing sections in the editor', async () => {
    mockList.mockResolvedValue({ data: [] });
    render(<ReportTemplates />);

    await waitFor(() => {
      expect(screen.getByText('No report templates found')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Template'));

    const sectionRows = screen.getAllByRole('combobox');
    expect(sectionRows).toHaveLength(3);

    // Click the first remove button
    const removeButtons = screen.getAllByLabelText('Remove');
    fireEvent.click(removeButtons[0]);

    const updatedRows = screen.getAllByRole('combobox');
    expect(updatedRows).toHaveLength(2);
  });
});
