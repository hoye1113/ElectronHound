import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Templates from '../pages/Templates';

// Mock api module
const mockTemplatesList = vi.fn();
const mockTemplatesGet = vi.fn();
const mockTemplatesCreate = vi.fn();
const mockTemplatesDelete = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    templates: {
      list: (...args: unknown[]) => mockTemplatesList(...args),
      get: (...args: unknown[]) => mockTemplatesGet(...args),
      create: (...args: unknown[]) => mockTemplatesCreate(...args),
      delete: (...args: unknown[]) => mockTemplatesDelete(...args),
    },
  },
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

const makeTemplate = (overrides: Partial<{
  id: string;
  name: string;
  description: string;
  category: 'login' | 'crud' | 'form' | 'navigation' | 'file' | 'settings' | 'custom';
  variables: string[];
  builtin: boolean;
}> = {}) => ({
  id: 'tpl-1',
  name: 'Login Flow',
  description: 'Test login with username and password',
  category: 'login' as const,
  variables: ['username', 'password'],
  builtin: false,
  ...overrides,
});

const builtinTemplate = makeTemplate({
  id: 'tpl-builtin',
  name: 'Built-in Login',
  description: 'A built-in login template',
  builtin: true,
});

const customTemplate = makeTemplate({
  id: 'tpl-custom',
  name: 'Custom CRUD',
  description: 'A custom CRUD template',
  category: 'crud',
  variables: ['endpoint'],
});

describe('Templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTemplatesList.mockResolvedValue({ data: [] });
    mockTemplatesGet.mockResolvedValue(makeTemplate());
    mockTemplatesCreate.mockResolvedValue(makeTemplate({ id: 'tpl-new' }));
    mockTemplatesDelete.mockResolvedValue(undefined);
  });

  // ─── Rendering ───────────────────────────────────────────────────────────

  it('renders loading state initially', async () => {
    // Make list never resolve so loading stays visible
    mockTemplatesList.mockReturnValue(new Promise(() => {}));
    render(<Templates />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders empty state when no templates exist', async () => {
    mockTemplatesList.mockResolvedValue({ data: [] });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('No templates found')).toBeInTheDocument();
    });
    expect(screen.getByText('Create a custom template to get started')).toBeInTheDocument();
  });

  it('renders template list from API', async () => {
    mockTemplatesList.mockResolvedValue({
      data: [makeTemplate(), builtinTemplate],
    });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('Login Flow')).toBeInTheDocument();
      expect(screen.getByText('Built-in Login')).toBeInTheDocument();
    });
  });

  it('renders page title and subtitle', async () => {
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('Template Gallery')).toBeInTheDocument();
      expect(screen.getByText('Browse and manage test templates')).toBeInTheDocument();
    });
  });

  it('shows category badges on template cards', async () => {
    mockTemplatesList.mockResolvedValue({
      data: [makeTemplate(), customTemplate],
    });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('Login Flow')).toBeInTheDocument();
    });

    // Category badges are rendered
    const loginBadges = screen.getAllByText('Login');
    expect(loginBadges.length).toBeGreaterThanOrEqual(1);
    const crudBadges = screen.getAllByText('CRUD');
    expect(crudBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows variables on template cards', async () => {
    mockTemplatesList.mockResolvedValue({ data: [makeTemplate()] });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('{{username}}')).toBeInTheDocument();
      expect(screen.getByText('{{password}}')).toBeInTheDocument();
    });
  });

  it('shows lock icon for builtin templates', async () => {
    mockTemplatesList.mockResolvedValue({ data: [builtinTemplate] });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('Built-in Login')).toBeInTheDocument();
    });

    // Builtin templates show "Built-in" badge
    expect(screen.getByText('Built-in')).toBeInTheDocument();
    // Builtin templates do NOT show delete button
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('shows delete button for custom templates', async () => {
    mockTemplatesList.mockResolvedValue({ data: [customTemplate] });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('Custom CRUD')).toBeInTheDocument();
    });

    // "Custom" appears both as a category filter button and a card badge
    const customTexts = screen.getAllByText('Custom');
    expect(customTexts.length).toBeGreaterThanOrEqual(2);

    // Delete button should be present for non-builtin templates
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  // ─── CRUD ────────────────────────────────────────────────────────────────

  it('opens create dialog when clicking Create Custom Template', async () => {
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('No templates found')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create Custom Template'));

    expect(screen.getByText('New Template')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Goal Template')).toBeInTheDocument();
  });

  it('validates required fields in create dialog', async () => {
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('No templates found')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create Custom Template'));
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
      expect(screen.getByText('Description is required')).toBeInTheDocument();
      expect(screen.getByText('Goal template is required')).toBeInTheDocument();
    });
  });

  it('creates a new template via API', async () => {
    mockTemplatesList.mockResolvedValue({ data: [] });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('No templates found')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create Custom Template'));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My Template' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A test template' } });
    fireEvent.change(screen.getByLabelText('Goal Template'), { target: { value: 'Test something' } });

    // After create, refreshTemplates will be called
    mockTemplatesList.mockResolvedValueOnce({
      data: [makeTemplate({ id: 'tpl-new', name: 'My Template', description: 'A test template' })],
    });

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(mockTemplatesCreate).toHaveBeenCalledWith({
        name: 'My Template',
        description: 'A test template',
        category: 'custom',
        variables: [],
        goal: 'Test something',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('My Template')).toBeInTheDocument();
    });
  });

  it('submits variables parsed from comma-separated string', async () => {
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('No templates found')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create Custom Template'));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'With Vars' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Has vars' } });
    fireEvent.change(screen.getByLabelText('Variables (comma-separated)'), {
      target: { value: 'user, pass, url' },
    });
    fireEvent.change(screen.getByLabelText('Goal Template'), { target: { value: 'Test with vars' } });

    mockTemplatesList.mockResolvedValueOnce({ data: [] });

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(mockTemplatesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: ['user', 'pass', 'url'],
        }),
      );
    });
  });

  it('shows error when create API fails', async () => {
    mockTemplatesCreate.mockRejectedValue(new Error('Network error'));
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('No templates found')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create Custom Template'));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fail' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Will fail' } });
    fireEvent.change(screen.getByLabelText('Goal Template'), { target: { value: 'Fail goal' } });

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(screen.getByText(/An error occurred/i)).toBeInTheDocument();
    });
  });

  it('closes create dialog on cancel', async () => {
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('No templates found')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create Custom Template'));
    expect(screen.getByText('New Template')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    await waitFor(() => {
      expect(screen.queryByText('New Template')).not.toBeInTheDocument();
    });
  });

  // ─── Delete with confirmation ────────────────────────────────────────────

  it('shows delete confirmation dialog', async () => {
    mockTemplatesList.mockResolvedValue({ data: [customTemplate] });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('Custom CRUD')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText(/Delete template "Custom CRUD"/)).toBeInTheDocument();
    });
  });

  it('deletes template after confirmation', async () => {
    mockTemplatesList.mockResolvedValue({ data: [customTemplate] });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('Custom CRUD')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText(/Delete template "Custom CRUD"/)).toBeInTheDocument();
    });

    // Click the Delete button inside the confirmation dialog
    const dialog = screen.getByRole('dialog');
    const confirmDeleteBtn = within(dialog).getByRole('button', { name: /Delete/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(mockTemplatesDelete).toHaveBeenCalledWith('tpl-custom');
    });

    await waitFor(() => {
      expect(screen.queryByText('Custom CRUD')).not.toBeInTheDocument();
    });
  });

  it('cancels delete when clicking cancel in confirmation', async () => {
    mockTemplatesList.mockResolvedValue({ data: [customTemplate] });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('Custom CRUD')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText(/Delete template "Custom CRUD"/)).toBeInTheDocument();
    });

    // Click Cancel inside the confirmation dialog
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText(/Delete template/)).not.toBeInTheDocument();
    });

    expect(mockTemplatesDelete).not.toHaveBeenCalled();
  });

  // ─── Category filter ─────────────────────────────────────────────────────

  it('filters templates by category', async () => {
    const loginTpl = makeTemplate({ id: 'login-1', name: 'Login A', category: 'login' });
    const crudTpl = makeTemplate({ id: 'crud-1', name: 'CRUD A', category: 'crud' });

    // Initial load returns all
    mockTemplatesList.mockResolvedValue({ data: [loginTpl, crudTpl] });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('Login A')).toBeInTheDocument();
      expect(screen.getByText('CRUD A')).toBeInTheDocument();
    });

    // Click the Login category filter
    mockTemplatesList.mockResolvedValueOnce({ data: [loginTpl] });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(mockTemplatesList).toHaveBeenCalledWith({ category: 'login' });
    });
  });

  it('filters by keyword search', async () => {
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('No templates found')).toBeInTheDocument();
    });

    // Type in search box
    mockTemplatesList.mockResolvedValueOnce({ data: [makeTemplate()] });
    const searchInput = screen.getByPlaceholderText('Search templates...');
    fireEvent.change(searchInput, { target: { value: 'login' } });

    await waitFor(() => {
      expect(mockTemplatesList).toHaveBeenCalledWith({ search: 'login' });
    });
  });

  it('clears category filter when clicking All', async () => {
    const loginTpl = makeTemplate({ id: 'login-1', name: 'Login A', category: 'login' });
    mockTemplatesList.mockResolvedValue({ data: [loginTpl] });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('Login A')).toBeInTheDocument();
    });

    // Click Login category
    mockTemplatesList.mockResolvedValueOnce({ data: [loginTpl] });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(mockTemplatesList).toHaveBeenCalledWith({ category: 'login' });
    });

    // Click All to clear filter
    mockTemplatesList.mockResolvedValueOnce({ data: [loginTpl] });
    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    await waitFor(() => {
      expect(mockTemplatesList).toHaveBeenCalledWith({});
    });
  });

  it('shows all category filter buttons', async () => {
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('No templates found')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CRUD' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Form' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Navigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'File' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Custom' })).toBeInTheDocument();
  });

  // ─── Template application ────────────────────────────────────────────────

  it('navigates to task creation with templateId when using template', async () => {
    mockTemplatesList.mockResolvedValue({ data: [makeTemplate()] });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('Login Flow')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Use Template'));

    expect(mockNavigate).toHaveBeenCalledWith('/?templateId=tpl-1');
  });

  it('shows Use Template button on each card', async () => {
    mockTemplatesList.mockResolvedValue({
      data: [makeTemplate(), builtinTemplate],
    });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('Login Flow')).toBeInTheDocument();
      expect(screen.getByText('Built-in Login')).toBeInTheDocument();
    });

    const useButtons = screen.getAllByText('Use Template');
    expect(useButtons).toHaveLength(2);
  });

  // ─── Template preview (variable display) ─────────────────────────────────

  it('displays template variables as placeholders', async () => {
    const tplWithVars = makeTemplate({
      variables: ['email', 'token', 'redirectUrl'],
    });
    mockTemplatesList.mockResolvedValue({ data: [tplWithVars] });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('{{email}}')).toBeInTheDocument();
      expect(screen.getByText('{{token}}')).toBeInTheDocument();
      expect(screen.getByText('{{redirectUrl}}')).toBeInTheDocument();
    });
  });

  it('does not show variables section when template has no variables', async () => {
    const noVarsTpl = makeTemplate({ variables: [] });
    mockTemplatesList.mockResolvedValue({ data: [noVarsTpl] });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('Login Flow')).toBeInTheDocument();
    });

    expect(screen.queryByText('Variables:')).not.toBeInTheDocument();
  });

  // ─── Error handling ──────────────────────────────────────────────────────

  it('handles template list fetch failure gracefully', async () => {
    mockTemplatesList.mockRejectedValue(new Error('Network error'));
    render(<Templates />);

    // Should not crash, just show empty state after loading
    await waitFor(() => {
      expect(screen.getByText('No templates found')).toBeInTheDocument();
    });
  });

  it('handles delete API failure gracefully', async () => {
    mockTemplatesDelete.mockRejectedValue(new Error('Delete failed'));
    mockTemplatesList.mockResolvedValue({ data: [customTemplate] });
    render(<Templates />);

    await waitFor(() => {
      expect(screen.getByText('Custom CRUD')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText(/Delete template "Custom CRUD"/)).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete/i }));

    // Should not crash; template remains in list since delete failed
    await waitFor(() => {
      expect(mockTemplatesDelete).toHaveBeenCalledWith('tpl-custom');
    });
  });
});
