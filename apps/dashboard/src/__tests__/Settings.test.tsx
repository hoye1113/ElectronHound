import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SettingsPage from '../pages/Settings';

// Mock provider config for testing
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

// Mock fetch with json() support for server API calls
function mockFetchSuccess(data: unknown) {
  return vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(data),
    }),
  );
}

function mockFetchReject(error: Error) {
  return vi.fn(() => Promise.reject(error));
}

describe('SettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Default mock: connection test returns success
    vi.stubGlobal('fetch', mockFetchSuccess({ success: true, message: 'Connection successful' }));
  });

  it('renders empty state when no providers exist', () => {
    render(<SettingsPage />);
    expect(screen.getByText(/No providers configured yet/i)).toBeInTheDocument();
  });

  it('renders provider list from localStorage', async () => {
    localStorage.setItem('eata-providers', JSON.stringify(mockProvidersConfig));
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('OpenAI GPT-4o')).toBeInTheDocument();
      expect(screen.getByText('DeepSeek Chat')).toBeInTheDocument();
    });
  });

  it('shows active indicator on active provider', async () => {
    localStorage.setItem('eata-providers', JSON.stringify(mockProvidersConfig));
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });

  it('migrates old eata-settings config', async () => {
    const oldConfig = {
      apiKey: 'sk-old-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4-turbo',
    };
    localStorage.setItem('eata-settings', JSON.stringify(oldConfig));

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/gpt-4-turbo/).length).toBeGreaterThan(0);
    });

    // Old config should be removed
    expect(localStorage.getItem('eata-settings')).toBeNull();
    // New config should exist
    const stored = JSON.parse(localStorage.getItem('eata-providers') || '{}');
    expect(stored.providers).toHaveLength(1);
    expect(stored.providers[0].model).toBe('gpt-4-turbo');
  });

  it('opens add provider dialog when clicking Add button', () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByText(/Add New Provider/i));

    expect(screen.getByRole('heading', { name: 'Add Provider' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Base URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Model')).toBeInTheDocument();
    expect(screen.getByLabelText('API Key')).toBeInTheDocument();
  });

  it('validates required fields in add dialog', async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByText(/Add New Provider/i));
    fireEvent.click(screen.getByRole('button', { name: /Add Provider/i }));

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
      expect(screen.getByText('Base URL is required')).toBeInTheDocument();
      expect(screen.getByText('Model is required')).toBeInTheDocument();
      expect(screen.getByText('API Key is required')).toBeInTheDocument();
    });
  });

  it('adds a new provider successfully', async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByText(/Add New Provider/i));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My Provider' } });
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://api.example.com' } });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'custom-model' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-123' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Provider/i }));

    await waitFor(() => {
      expect(screen.getByText('My Provider')).toBeInTheDocument();
    });

    const stored = JSON.parse(localStorage.getItem('eata-providers') || '{}');
    expect(stored.providers).toHaveLength(1);
    expect(stored.providers[0].name).toBe('My Provider');
  });

  it('toggles API key visibility per provider', async () => {
    localStorage.setItem('eata-providers', JSON.stringify(mockProvidersConfig));
    render(<SettingsPage />);

    // Keys are hidden by default - full key text should NOT be visible
    await waitFor(() => {
      expect(screen.queryByText('sk-test-key-12345678')).not.toBeInTheDocument();
    });

    // Click first "Show API key" button to reveal
    const showBtn = screen.getAllByLabelText(/Show API key/i)[0];
    fireEvent.click(showBtn);

    // Now the full key should be visible for first provider
    await waitFor(() => {
      expect(screen.getByText('sk-test-key-12345678')).toBeInTheDocument();
    });

    // Click again to hide
    const hideBtn = screen.getAllByLabelText(/Hide API key/i)[0];
    fireEvent.click(hideBtn);

    // Masked again
    await waitFor(() => {
      expect(screen.queryByText('sk-test-key-12345678')).not.toBeInTheDocument();
    });
  });

  it('switches active provider when clicking Set Default', async () => {
    localStorage.setItem('eata-providers', JSON.stringify(mockProvidersConfig));
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    // Find and click "Set Default" button
    const setDefaultBtn = screen.getByRole('button', { name: /Set DeepSeek Chat as default/i });
    fireEvent.click(setDefaultBtn);

    await waitFor(() => {
      // Verify active changed - now there should be 2 "Set Default" buttons for OpenAI
      expect(screen.getByRole('button', { name: /Set OpenAI GPT-4o as default/i })).toBeInTheDocument();
    });
  });

  it('prevents deleting active provider', async () => {
    localStorage.setItem('eata-providers', JSON.stringify(mockProvidersConfig));
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    // Click delete on active provider
    fireEvent.click(screen.getByLabelText('Delete OpenAI GPT-4o'));

    await waitFor(() => {
      expect(screen.getByText(/Cannot delete the active provider/i)).toBeInTheDocument();
    });
  });

  it('deletes non-active provider after confirmation', async () => {
    localStorage.setItem('eata-providers', JSON.stringify(mockProvidersConfig));
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('DeepSeek Chat')).toBeInTheDocument();
    });

    // Click delete on non-active provider
    fireEvent.click(screen.getByLabelText('Delete DeepSeek Chat'));

    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Delete/i }));

    await waitFor(() => {
      expect(screen.queryByText('DeepSeek Chat')).not.toBeInTheDocument();
    });
  });

  it('tests provider connection via server API', async () => {
    localStorage.setItem('eata-providers', JSON.stringify(mockProvidersConfig));
    vi.stubGlobal(
      'fetch',
      mockFetchSuccess({ success: true, message: 'Connection successful' }),
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('OpenAI GPT-4o')).toBeInTheDocument();
    });

    // Click test button
    const testBtn = screen.getByRole('button', { name: /Test OpenAI GPT-4o connection/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText('OK')).toBeInTheDocument();
    });

    // Verify it called the server API, not the provider directly
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/providers/test-1/test'),
      expect.any(Object),
    );
  });

  it('shows error on failed connection test', async () => {
    localStorage.setItem('eata-providers', JSON.stringify(mockProvidersConfig));
    vi.stubGlobal(
      'fetch',
      mockFetchSuccess({ success: false, error: 'Network error' }),
    );

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

  it('shows error when fetch throws', async () => {
    localStorage.setItem('eata-providers', JSON.stringify(mockProvidersConfig));
    vi.stubGlobal('fetch', mockFetchReject(new Error('Network error')));

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

  it('edits an existing provider', async () => {
    localStorage.setItem('eata-providers', JSON.stringify(mockProvidersConfig));
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('OpenAI GPT-4o')).toBeInTheDocument();
    });

    // Click edit on the active provider
    fireEvent.click(screen.getByLabelText('Edit OpenAI GPT-4o'));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit Provider' })).toBeInTheDocument();
    });

    // Change the name
    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    expect(nameInput.value).toBe('OpenAI GPT-4o');
    fireEvent.change(nameInput, { target: { value: 'Updated OpenAI' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(screen.getByText('Updated OpenAI')).toBeInTheDocument();
    });
  });
});
