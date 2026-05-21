import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      <p className="mb-2 text-6xl font-bold tracking-tight text-zinc-400">404</p>
      <h1 className="mb-4 text-2xl font-semibold">{t('notFound.title')}</h1>
      <p className="mb-6 text-zinc-500">{t('notFound.message')}</p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
      >
        {t('notFound.backToTasks')}
      </Link>
    </div>
  );
}
