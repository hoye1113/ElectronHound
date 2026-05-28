import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SettingsPage from '../pages/Settings';

// Mock api module
const mockProvidersList = vi.fn();
const mockProvidersCreate = vi.fn();
const mockProvidersUpdate = vi.fn();
const mockProvidersDelete = vi.fn();
const mockProvidersActivate = vi.fn();
const mockProvidersTest = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    providers: {
      list: (...args: unknown[]) => mockProvidersList(...args),
      create: (...args: unknown[]) => mockProvidersCreate(...args),
      update: (...args: unknown[]) => mockProvidersUpdate(...args),
      delete: (...args: unknown[]) => mockProvidersDelete(...args),
      activate: (...args: unknown[]) => mockProvidersActivate(...args),
      test: (...args: unknown[]) => mockProvidersTest(...args),
    },
  },
}));

const mockProvidersConfig = {
  version: 1,
  providers: [
    {
      id: 'test-1',
      name: 'OpenAI GPT-4o',
      type: 'openai-compatible' as const,
      apiKey: 'sk-test-key-12345678',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      enabled: true,
    },
    {
      id: 'test-2',
      name: 'DeepSeek Chat',
      type: 'openai-compatible' as const,
      apiKey: 'sk-deepseek-123',
      baseURL: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      enabled: true,
    },
  ],
  activeId: 'test-1',
};

const emptyConfig = { version: 1, providers: [], activeId: '' };

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return empty providers list
    mockProvidersList.mockResolvedValue(emptyConfig);
    mockProvidersCreate.mockImplementation((data: { name: string; apiKey: string; baseURL: string; model: string }) =>
      Promise.resolve({ id: `new-${Date.now()}`, type: 'openai-compatible', enabled: true, ...data }),
    );
    mockProvidersUpdate.mockImplementation((_id: string, data: unknown) => Promise.resolve(data));
    mockProvidersDelete.mockResolvedValue(undefined);
    mockProvidersActivate.mockResolvedValue(undefined);
    mockProvidersTest.mockResolvedValue({ success: true, message: 'Connection successful' });
  });

  it('renders empty state when no providers exist', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText(/No providers configured yet/i)).toBeInTheDocument();
    });
  });

  it('renders provider list from API', async () => {
    mockProvidersList.mockResolvedValue(mockProvidersConfig);
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('OpenAI GPT-4o')).toBeInTheDocument();
      expect(screen.getByText('DeepSeek Chat')).toBeInTheDocument();
    });
  });

  it('shows active indicator on active provider', async () => {
    mockProvidersList.mockResolvedValue(mockProvidersConfig);
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });

  it('shows error banner when API list fails', async () => {
    mockProvidersList.mockRejectedValue(new Error('Network error'));
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('opens add provider dialog when clicking Add button', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText(/No providers configured yet/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Add New Provider/i));

    expect(screen.getByRole('heading', { name: 'Add Provider' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Base URL:')).toBeInTheDocument();
    expect(screen.getByLabelText('Model:')).toBeInTheDocument();
    expect(screen.getByLabelText('API Key:')).toBeInTheDocument();
  });

  it('validates required fields in add dialog', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText(/No providers configured yet/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Add New Provider/i));
    fireEvent.click(screen.getByRole('button', { name: /Add Provider/i }));

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
      expect(screen.getByText('Base URL is required')).toBeInTheDocument();
      expect(screen.getByText('Model is required')).toBeInTheDocument();
      expect(screen.getByText('API Key is required')).toBeInTheDocument();
    });
  });

  it('adds a new provider via API', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText(/No providers configured yet/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Add New Provider/i));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My Provider' } });
    fireEvent.change(screen.getByLabelText('Base URL:'), { target: { value: 'https://api.example.com' } });
    fireEvent.change(screen.getByLabelText('Model:'), { target: { value: 'custom-model' } });
    fireEvent.change(screen.getByLabelText('API Key:'), { target: { value: 'sk-123' } });

    // After create, refreshProviders will be called — return updated config
    mockProvidersList.mockResolvedValueOnce({
      version: 1,
      providers: [{ id: 'new-1', name: 'My Provider', type: 'openai-compatible', apiKey: 'sk-123', baseURL: 'https://api.example.com', model: 'custom-model', enabled: true }],
      activeId: '',
    });

    fireEvent.click(screen.getByRole('button', { name: /Add Provider/i }));

    await waitFor(() => {
      expect(mockProvidersCreate).toHaveBeenCalledWith({
        name: 'My Provider',
        apiKey: 'sk-123',
        baseURL: 'https://api.example.com',
        model: 'custom-model',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('My Provider')).toBeInTheDocument();
    });
  });

  it('toggles API key visibility per provider', async () => {
    mockProvidersList.mockResolvedValue(mockProvidersConfig);
    render(<SettingsPage />);

    // Keys are hidden by default
    await waitFor(() => {
      expect(screen.queryByText('sk-test-key-12345678')).not.toBeInTheDocument();
    });

    // Click first "Show API key" button to reveal
    const showBtn = screen.getAllByLabelText(/Show API key/i)[0];
    fireEvent.click(showBtn);

    await waitFor(() => {
      expect(screen.getByText('sk-test-key-12345678')).toBeInTheDocument();
    });

    // Click again to hide
    const hideBtn = screen.getAllByLabelText(/Hide API key/i)[0];
    fireEvent.click(hideBtn);

    await waitFor(() => {
      expect(screen.queryByText('sk-test-key-12345678')).not.toBeInTheDocument();
    });
  });

  it('switches active provider via API', async () => {
    mockProvidersList.mockResolvedValue(mockProvidersConfig);
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    // After activate, refreshProviders returns updated config
    mockProvidersList.mockResolvedValueOnce({
      ...mockProvidersConfig,
      activeId: 'test-2',
    });

    const setDefaultBtn = screen.getByRole('button', { name: /Set DeepSeek Chat as default/i });
    fireEvent.click(setDefaultBtn);

    await waitFor(() => {
      expect(mockProvidersActivate).toHaveBeenCalledWith('test-2');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Set OpenAI GPT-4o as default/i })).toBeInTheDocument();
    });
  });

  it('prevents deleting active provider', async () => {
    mockProvidersList.mockResolvedValue(mockProvidersConfig);
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Delete OpenAI GPT-4o'));

    await waitFor(() => {
      expect(screen.getByText(/Cannot delete the active provider/i)).toBeInTheDocument();
    });
  });

  it('deletes non-active provider via API', async () => {
    mockProvidersList.mockResolvedValue(mockProvidersConfig);
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('DeepSeek Chat')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Delete DeepSeek Chat'));

    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument();
    });

    // After delete, refreshProviders returns config without DeepSeek
    mockProvidersList.mockResolvedValueOnce({
      version: 1,
      providers: [mockProvidersConfig.providers[0]],
      activeId: 'test-1',
    });

    fireEvent.click(screen.getByRole('button', { name: /Delete/i }));

    await waitFor(() => {
      expect(mockProvidersDelete).toHaveBeenCalledWith('test-2');
    });

    await waitFor(() => {
      expect(screen.queryByText('DeepSeek Chat')).not.toBeInTheDocument();
    });
  });

  it('tests provider connection via API', async () => {
    mockProvidersList.mockResolvedValue(mockProvidersConfig);
    mockProvidersTest.mockResolvedValue({ success: true, message: 'Connection successful' });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('OpenAI GPT-4o')).toBeInTheDocument();
    });

    const testBtn = screen.getByRole('button', { name: /Test OpenAI GPT-4o connection/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(mockProvidersTest).toHaveBeenCalledWith('test-1');
    });

    await waitFor(() => {
      expect(screen.getByText('OK')).toBeInTheDocument();
    });
  });

  it('shows error on failed connection test', async () => {
    mockProvidersList.mockResolvedValue(mockProvidersConfig);
    mockProvidersTest.mockResolvedValue({ success: false, error: 'Network error' });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('OpenAI GPT-4o')).toBeInTheDocument();
    });

    const testBtn = screen.getByRole('button', { name: /Test OpenAI GPT-4o connection/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows error when test API throws', async () => {
    mockProvidersList.mockResolvedValue(mockProvidersConfig);
    mockProvidersTest.mockRejectedValue(new Error('Network error'));

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('OpenAI GPT-4o')).toBeInTheDocument();
    });

    const testBtn = screen.getByRole('button', { name: /Test OpenAI GPT-4o connection/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('edits an existing provider via API', async () => {
    mockProvidersList.mockResolvedValue(mockProvidersConfig);
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('OpenAI GPT-4o')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Edit OpenAI GPT-4o'));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit Provider' })).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    expect(nameInput.value).toBe('OpenAI GPT-4o');
    fireEvent.change(nameInput, { target: { value: 'Updated OpenAI' } });

    // After update, refreshProviders returns updated config
    mockProvidersList.mockResolvedValueOnce({
      ...mockProvidersConfig,
      providers: [{ ...mockProvidersConfig.providers[0], name: 'Updated OpenAI' }, mockProvidersConfig.providers[1]],
    });

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(mockProvidersUpdate).toHaveBeenCalledWith('test-1', expect.objectContaining({ name: 'Updated OpenAI' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Updated OpenAI')).toBeInTheDocument();
    });
  });
});
