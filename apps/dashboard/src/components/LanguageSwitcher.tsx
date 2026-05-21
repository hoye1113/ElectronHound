import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

const LANGUAGES = [
  { code: 'en', labelKey: 'langSwitcher.en' as const },
  { code: 'zh', labelKey: 'langSwitcher.zh' as const },
] as const;

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  const handleChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  };

  const currentLang = i18n.language;

  return (
    <div className="flex flex-col gap-1.5 px-3 pb-3">
      <div className="flex items-center gap-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        <Globe className="size-3" />
        {t('langSwitcher.title')}
      </div>
      <div
        role="group"
        aria-label={t('langSwitcher.title')}
        className="flex overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 text-xs"
      >
        {LANGUAGES.map(({ code, labelKey }) => {
          const isActive = currentLang === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => handleChange(code)}
              aria-pressed={isActive}
              className={`flex-1 px-2 py-1.5 text-center font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900 ${
                isActive
                  ? 'bg-indigo-500/15 text-indigo-300'
                  : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
              }`}
            >
              {t(labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
