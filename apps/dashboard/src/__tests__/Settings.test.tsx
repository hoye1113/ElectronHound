import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SettingsPage from '../pages/Settings';

describe('SettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders all input fields', () => {
    render(<SettingsPage />);
    
    expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument();
    expect(screen.getByLabelText(/Base URL/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Model/i)).toBeInTheDocument();
  });

  it('shows default values when no localStorage data', () => {
    render(<SettingsPage />);
    
    expect(screen.getByLabelText(/Base URL/i)).toHaveValue('https://api.openai.com/v1');
    expect(screen.getByLabelText(/Model/i)).toHaveValue('gpt-4o');
  });

  it('loads settings from localStorage on mount', async () => {
    const testSettings = {
      apiKey: 'sk-test-key',
      baseUrl: 'https://custom-api.com/v1',
      model: 'gpt-4-turbo',
    };
    localStorage.setItem('eata-settings', JSON.stringify(testSettings));

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('sk-...')).toHaveValue('sk-test-key');
      expect(screen.getByLabelText(/Base URL/i)).toHaveValue('https://custom-api.com/v1');
      expect(screen.getByLabelText(/Model/i)).toHaveValue('gpt-4-turbo');
    });
  });

  it('saves settings to localStorage on save button click', () => {
    render(<SettingsPage />);

    const apiKeyInput = screen.getByPlaceholderText('sk-...');
    fireEvent.change(apiKeyInput, { target: { value: 'sk-my-key' } });

    const saveButton = screen.getByRole('button', { name: /save settings/i });
    fireEvent.click(saveButton);

    const stored = JSON.parse(localStorage.getItem('eata-settings') || '{}');
    expect(stored.apiKey).toBe('sk-my-key');
  });

  it('shows success message after saving', () => {
    render(<SettingsPage />);

    const saveButton = screen.getByRole('button', { name: /save settings/i });
    fireEvent.click(saveButton);

    expect(screen.getByText(/saved!/i)).toBeInTheDocument();
  });

  it('toggles API key visibility', () => {
    render(<SettingsPage />);

    const apiKeyInput = screen.getByPlaceholderText('sk-...');
    expect(apiKeyInput).toHaveAttribute('type', 'password');

    const toggleButton = screen.getByRole('button', { name: /show api key/i });
    fireEvent.click(toggleButton);

    expect(apiKeyInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide api key/i })).toBeInTheDocument();
  });
});
