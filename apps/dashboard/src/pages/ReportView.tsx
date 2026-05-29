import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Image as ImageIcon,
  FileText,
  BarChart3,
} from 'lucide-react';
import type { Manifest, TimelineEntry } from '@eata/shared-types';
import { api, getScreenshotUrl } from '../lib/api';
import ScreenshotGallery from '../components/ScreenshotGallery';

interface ScreenshotItem {
  url: string;
  stepIndex: number;
  phase: string;
}

const statusConfig: Record<
  string,
  { labelKey: string; classes: string; icon: typeof CheckCircle2 }
> = {
  completed: {
    labelKey: 'reportView.status_completed',
    classes: 'bg-emerald-500/20 text-emerald-300',
    icon: CheckCircle2,
  },
  failed: {
    labelKey: 'reportView.status_failed',
    classes: 'bg-red-500/20 text-red-300',
    icon: XCircle,
  },
  cancelled: {
    labelKey: 'reportView.status_cancelled',
    classes: 'bg-amber-500/20 text-amber-300',
    icon: AlertTriangle,
  },
  aborted: {
    labelKey: 'reportView.status_aborted',
    classes: 'bg-zinc-600 text-zinc-400',
    icon: XCircle,
  },
};

export default function ReportView() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!id) return;

    const fetchReport = async () => {
      try {
        setIsLoading(true);
        const data = (await api.reports.get(id)) as (Manifest & {
          timeline?: TimelineEntry[];
        }) | null;

        if (!data) {
          setError(t('reportView.notFound'));
          return;
        }

        setManifest(data);

        if (data.timeline) {
          setTimeline(data.timeline);
          const ss: ScreenshotItem[] = data.timeline
            .filter((entry) => entry.phase === 'execute')
            .map((entry) => ({
              url: getScreenshotUrl(id, entry.stepIndex),
              stepIndex: entry.stepIndex,
              phase: entry.phase,
            }));
          setScreenshots(ss);
        }
      } catch {
        setError(t('reportView.loadError'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchReport();
  }, [id]);

  const toggleStep = (stepIndex: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepIndex)) {
        next.delete(stepIndex);
      } else {
        next.add(stepIndex);
      }
      return next;
    });
  };

  const handleExport = () => {
    if (!id || !manifest) return;
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatTimestamp = (iso: string): string => {
    const date = new Date(iso);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-zinc-500">{t('reportView.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !manifest) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-red-400">
          {error ?? t('reportView.notFound')}
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 text-sm font-medium text-indigo-400 hover:text-indigo-300"
        >
          {t('reportView.backToTasks')}
        </button>
      </div>
    );
  }

  const status = statusConfig[manifest.status] ?? statusConfig.aborted;
  const StatusIcon = status.icon;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/')}
            className="mt-1 rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            aria-label={t('common.backToTaskList')}
          >
            <ArrowLeft className="size-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">
              {manifest.goal}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.classes}`}
              >
                <StatusIcon className="size-3.5" />
                {t(status.labelKey)}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <BarChart3 className="size-3.5" />
                {manifest.totalSteps} {t('common.steps')}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <Clock className="size-3.5" />
                {formatDuration(manifest.totalDuration)}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          aria-label={t('reportView.export')}
        >
          <Download className="size-4" />
          {t('reportView.export')}
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="text-xs text-zinc-500">{t('reportView.totalSteps')}</p>
          <p className="mt-1 text-2xl font-bold text-zinc-100">
            {manifest.totalSteps}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="text-xs text-emerald-400">
            {t('reportView.passedSteps')}
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">
            {manifest.passedSteps}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="text-xs text-red-400">
            {t('reportView.failedSteps')}
          </p>
          <p className="mt-1 text-2xl font-bold text-red-300">
            {manifest.failedSteps}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <p className="text-xs text-amber-400">
            {t('reportView.retriedSteps')}
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-300">
            {manifest.retriedSteps}
          </p>
        </div>
      </div>

      {/* Timestamps */}
      <div className="flex items-center gap-6 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5" />
          {t('reportView.startTime')}: {formatTimestamp(manifest.startTime)}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5" />
          {t('reportView.endTime')}: {formatTimestamp(manifest.endTime)}
        </span>
      </div>

      {/* Steps timeline */}
      {timeline.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-400">
            <FileText className="size-4" />
            {t('reportView.stepsSection')}
          </h2>
          <div className="flex flex-col gap-1" role="list">
            {timeline.map((entry, index) => (
              <div
                key={`${entry.stepIndex}-${entry.phase}-${index}`}
                role="listitem"
                className="rounded-lg border border-zinc-800/60 bg-zinc-900/40"
              >
                <button
                  onClick={() => toggleStep(entry.stepIndex)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-zinc-800/30"
                  aria-expanded={expandedSteps.has(entry.stepIndex)}
                >
                  <div className="flex items-center gap-3">
                    <ChevronRight
                      className={`size-4 text-zinc-500 transition-transform ${
                        expandedSteps.has(entry.stepIndex) ? 'rotate-90' : ''
                      }`}
                    />
                    <span className="text-xs font-medium text-zinc-400">
                      Step {entry.stepIndex + 1}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {entry.phase}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {entry.action}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        entry.status === 'success'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : entry.status === 'failed'
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {entry.status}
                    </span>
                    <span className="text-xs text-zinc-600">
                      {formatDuration(entry.duration)}
                    </span>
                  </div>
                </button>
                {expandedSteps.has(entry.stepIndex) && (
                  <div className="border-t border-zinc-800/40 px-4 py-3">
                    <p className="text-xs text-zinc-400">
                      {entry.resultSummary}
                    </p>
                    <p className="mt-2 text-xs text-zinc-600">
                      {formatTimestamp(entry.timestamp)}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Screenshots */}
      {screenshots.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-400">
            <ImageIcon className="size-4" />
            {t('reportView.screenshotsSection', { count: screenshots.length })}
          </h2>
          <ScreenshotGallery screenshots={screenshots} />
        </section>
      )}
    </div>
  );
}
