import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LanguageSwitcher from '../components/LanguageSwitcher';

// Mock react-i18next to control language state
let mockLanguage = 'en';
const mockChangeLanguage = vi.fn();
const mockT = vi.fn((key: string) => {
  const map: Record<string, string> = {
    'langSwitcher.title': 'Language',
    'langSwitcher.en': 'English',
    'langSwitcher.zh': 'Chinese',
  };
  return map[key] || key;
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
    i18n: {
      get language() {
        return mockLanguage;
      },
      changeLanguage: mockChangeLanguage,
    },
  }),
}));

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLanguage = 'en';
  });

  it('renders the language switcher title', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByText('Language')).toBeInTheDocument();
  });

  it('renders language option buttons', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Chinese')).toBeInTheDocument();
  });

  it('marks the current language as pressed', () => {
    render(<LanguageSwitcher />);
    const englishBtn = screen.getByText('English');
    const chineseBtn = screen.getByText('Chinese');
    expect(englishBtn).toHaveAttribute('aria-pressed', 'true');
    expect(chineseBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls i18n.changeLanguage when clicking a different language', () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByText('Chinese'));
    expect(mockChangeLanguage).toHaveBeenCalledWith('zh');
  });

  it('calls i18n.changeLanguage when clicking the same language', () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByText('English'));
    expect(mockChangeLanguage).toHaveBeenCalledWith('en');
  });

  it('renders a group with accessible label', () => {
    render(<LanguageSwitcher />);
    const group = screen.getByRole('group');
    expect(group).toBeInTheDocument();
  });

  it('reflects a different current language correctly', () => {
    mockLanguage = 'zh';
    render(<LanguageSwitcher />);
    const englishBtn = screen.getByText('English');
    const chineseBtn = screen.getByText('Chinese');
    expect(englishBtn).toHaveAttribute('aria-pressed', 'false');
    expect(chineseBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
