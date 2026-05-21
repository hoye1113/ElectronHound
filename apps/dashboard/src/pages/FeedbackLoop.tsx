import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import type { FeedbackPattern } from '@eata/shared-types';
import { api } from '../lib/api';
import PatternList from '../components/PatternList';

export default function FeedbackLoop() {
  const { t } = useTranslation();
  const [patterns, setPatterns] = useState<FeedbackPattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchPatterns = async () => {
      try {
        const data = await api.feedback.getPatterns();
        setPatterns(data.patterns);
      } catch {
        // Silent fail - patterns may not be available
      } finally {
        setIsLoading(false);
      }
    };

    fetchPatterns();
  }, []);

  const filtered = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return patterns;
    return patterns.filter(
      (p) =>
        p.errorType.toLowerCase().includes(query) ||
        p.targetDescription.toLowerCase().includes(query) ||
        p.remediationHint.toLowerCase().includes(query) ||
        p.similarityKeywords.some((k) => k.toLowerCase().includes(query)),
    );
  }, [patterns, searchQuery]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => b.frequency - a.frequency),
    [filtered],
  );

  const maxFrequency = useMemo(
    () => (sorted.length > 0 ? Math.max(...sorted.map((p) => p.frequency)) : 0),
    [sorted],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">{t('feedbackLoop.title')}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {sorted.length} pattern{sorted.length !== 1 ? 's' : ''} detected across tasks
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder={t('feedbackLoop.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
          aria-label={t('common.searchFeedback')}
        />
      </div>

      {/* Pattern list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-sm text-zinc-500">{t('feedbackLoop.loading')}</p>
          </div>
        </div>
      ) : (
        <PatternList patterns={sorted} maxFrequency={maxFrequency} />
      )}
    </div>
  );
}
