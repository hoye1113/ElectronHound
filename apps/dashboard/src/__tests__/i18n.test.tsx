import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import i18n from '../i18n/config';

/**
 * Test component that exercises the useTranslation hook.
 * Renders translated text, a key with interpolation, and the current language.
 */
function TestComponent() {
  const { t, i18n: i18nInstance } = useTranslation();
  return (
    <div>
      <span data-testid="common-cancel">{t('common.cancel')}</span>
      <span data-testid="nav-tasks">{t('nav.tasks')}</span>
      <span data-testid="settings-title">{t('settings.title')}</span>
      <span data-testid="interpolated">{t('common.pageOf', { current: 1, total: 5 })}</span>
      <span data-testid="current-lang">{i18nInstance.language}</span>
    </div>
  );
}

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('i18n', () => {
  beforeEach(async () => {
    // Reset to English before each test for deterministic state
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    localStorage.removeItem('language');
  });

  describe('init', () => {
    it('initializes with English as the default language', () => {
      // setup.ts imports i18n/config which reads localStorage('language') || 'en'
      // Since localStorage is cleared, default must be 'en'
      // We explicitly set back to 'en' in beforeEach for determinism
      expect(i18n.language).toBe('en');
    });

    it('has fallbackLng configured to English', () => {
      // i18next normalizes string fallbackLng to an array internally
      const fallback = i18n.options.fallbackLng;
      expect(fallback).toEqual(['en']);
    });

    it('loads both en and zh resource bundles', () => {
      const enBundle = i18n.getResourceBundle('en', 'translation');
      const zhBundle = i18n.getResourceBundle('zh', 'translation');
      expect(enBundle).toBeDefined();
      expect(zhBundle).toBeDefined();
    });

    it('disables HTML escaping in interpolation', () => {
      expect(i18n.options.interpolation?.escapeValue).toBe(false);
    });
  });

  describe('switching', () => {
    it('switches language to zh via changeLanguage', async () => {
      await i18n.changeLanguage('zh');
      expect(i18n.language).toBe('zh');
    });

    it('resolves zh translations after switching', async () => {
      await i18n.changeLanguage('zh');
      expect(i18n.t('common.cancel')).toBe('取消');
      expect(i18n.t('nav.tasks')).toBe('任务');
    });

    it('switches back to en correctly', async () => {
      await i18n.changeLanguage('zh');
      expect(i18n.language).toBe('zh');

      await i18n.changeLanguage('en');
      expect(i18n.language).toBe('en');
      expect(i18n.t('common.cancel')).toBe('Cancel');
    });

    it('falls back to en for an unsupported language', async () => {
      await i18n.changeLanguage('fr');
      // fallbackLng is 'en', so missing 'fr' translations fall back to English
      expect(i18n.t('common.cancel')).toBe('Cancel');
    });
  });

  describe('key coverage', () => {
    // Spot-check 6 keys from different namespaces exist and resolve in both languages
    const keysToCheck: Array<{ key: string; en: string; zh: string }> = [
      { key: 'common.save', en: 'Save', zh: '保存' },
      { key: 'common.delete', en: 'Delete', zh: '删除' },
      { key: 'nav.settings', en: 'Settings', zh: '设置' },
      { key: 'taskList.title', en: 'Tasks', zh: '任务' },
      { key: 'settings.title', en: 'LLM Providers', zh: 'LLM 提供商' },
      { key: 'createTask.submit', en: 'Create Task', zh: '创建任务' },
    ];

    it.each(keysToCheck)('resolves "$key" in English', ({ key, en }) => {
      expect(i18n.t(key)).toBe(en);
    });

    it.each(keysToCheck)('resolves "$key" in Chinese', async ({ key, zh }) => {
      await i18n.changeLanguage('zh');
      expect(i18n.t(key)).toBe(zh);
    });

    it('resolves interpolated keys correctly in English', () => {
      expect(i18n.t('common.pageOf', { current: 3, total: 10 })).toBe(
        'Page 3 of 10'
      );
    });

    it('resolves interpolated keys correctly in Chinese', async () => {
      await i18n.changeLanguage('zh');
      expect(i18n.t('common.pageOf', { current: 3, total: 10 })).toBe(
        '第 3 页，共 10 页'
      );
    });
  });

  describe('hooks', () => {
    it('useTranslation renders English text in a component', () => {
      renderWithI18n(<TestComponent />);

      expect(screen.getByTestId('common-cancel')).toHaveTextContent('Cancel');
      expect(screen.getByTestId('nav-tasks')).toHaveTextContent('Tasks');
      expect(screen.getByTestId('settings-title')).toHaveTextContent(
        'LLM Providers'
      );
    });

    it('useTranslation provides correct interpolated values', () => {
      renderWithI18n(<TestComponent />);
      expect(screen.getByTestId('interpolated')).toHaveTextContent(
        'Page 1 of 5'
      );
    });

    it('useTranslation reflects language change in rendered component', async () => {
      const { rerender } = renderWithI18n(<TestComponent />);
      expect(screen.getByTestId('common-cancel')).toHaveTextContent('Cancel');

      await act(async () => {
        await i18n.changeLanguage('zh');
      });

      // Re-render to pick up language change
      rerender(
        <I18nextProvider i18n={i18n}>
          <TestComponent />
        </I18nextProvider>
      );

      expect(screen.getByTestId('common-cancel')).toHaveTextContent('取消');
      expect(screen.getByTestId('nav-tasks')).toHaveTextContent('任务');
      expect(screen.getByTestId('current-lang')).toHaveTextContent('zh');
    });

    it('useTranslation exposes the i18n instance with correct language', () => {
      renderWithI18n(<TestComponent />);
      expect(screen.getByTestId('current-lang')).toHaveTextContent('en');
    });
  });

  describe('fallback behavior', () => {
    it('falls back to English for an unknown key in a non-English language', async () => {
      await i18n.changeLanguage('zh');
      // 'nonexistent.missingKey' does not exist in either bundle;
      // i18next returns the key itself when no fallback matches
      const result = i18n.t('nonexistent.missingKey');
      expect(result).toBe('nonexistent.missingKey');
    });

    it('returns the key string for a completely unknown key', () => {
      const result = i18n.t('totally.unknown.key');
      expect(result).toBe('totally.unknown.key');
    });

    it('falls back to English value when zh key is missing but en has it', async () => {
      // Dynamically add a key only to English, then switch to zh
      i18n.addResource('en', 'translation', 'testOnly.enOnlyKey', 'English Only Value');
      await i18n.changeLanguage('zh');
      // zh does not have this key, so fallbackLng 'en' provides it
      expect(i18n.t('testOnly.enOnlyKey')).toBe('English Only Value');
      // Clean up: remove the testOnly namespace that was dynamically added
      const enBundle = i18n.getResourceBundle('en', 'translation') as Record<string, unknown>;
      delete enBundle.testOnly;
    });
  });

  describe('i18n completeness', () => {
    it('en.json and zh.json have identical top-level namespaces', () => {
      const enBundle = i18n.getResourceBundle('en', 'translation') as Record<string, unknown>;
      const zhBundle = i18n.getResourceBundle('zh', 'translation') as Record<string, unknown>;

      const enKeys = Object.keys(enBundle).sort();
      const zhKeys = Object.keys(zhBundle).sort();

      expect(enKeys).toEqual(zhKeys);
    });

    it('langSwitcher namespace exists in both bundles with required keys', () => {
      const enBundle = i18n.getResourceBundle('en', 'translation') as Record<string, Record<string, string>>;
      const zhBundle = i18n.getResourceBundle('zh', 'translation') as Record<string, Record<string, string>>;

      expect(enBundle.langSwitcher).toBeDefined();
      expect(zhBundle.langSwitcher).toBeDefined();

      for (const key of ['title', 'en', 'zh']) {
        expect(enBundle.langSwitcher[key]).toBeDefined();
        expect(enBundle.langSwitcher[key].length).toBeGreaterThan(0);
        expect(zhBundle.langSwitcher[key]).toBeDefined();
        expect(zhBundle.langSwitcher[key].length).toBeGreaterThan(0);
      }
    });

    it('langSwitcher keys resolve correctly in both languages', () => {
      expect(i18n.t('langSwitcher.title')).toBe('Language');
      expect(i18n.t('langSwitcher.en')).toBe('English');
      expect(i18n.t('langSwitcher.zh')).toBe('中文');

      i18n.changeLanguage('zh');
      expect(i18n.t('langSwitcher.title')).toBe('语言');
      expect(i18n.t('langSwitcher.en')).toBe('English');
      expect(i18n.t('langSwitcher.zh')).toBe('中文');
    });

    it('schedule namespace does not exist (dead code removed)', () => {
      const enBundle = i18n.getResourceBundle('en', 'translation') as Record<string, unknown>;
      expect(enBundle.schedule).toBeUndefined();
    });
  });
});
