import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Download,
  Clock,
  Cpu,
  ListChecks,
  Image as ImageIcon,
  ChevronDown,
  FileJson,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import type { Task, TaskStatus, StepRecord } from '@eata/shared-types';
import { api, getScreenshotUrl, getExportUrl } from '../lib/api';
import StepTimeline from '../components/StepTimeline';
import ScreenshotGallery from '../components/ScreenshotGallery';

const statusConfig: Record<TaskStatus, { labelKey: string; classes: string }> = {
  queued: { labelKey: 'taskCard.status_queued', classes: 'bg-zinc-700 text-zinc-300' },
  running: { labelKey: 'taskCard.status_running', classes: 'bg-blue-500/20 text-blue-300' },
  completed: { labelKey: 'taskCard.status_completed', classes: 'bg-emerald-500/20 text-emerald-300' },
  failed: { labelKey: 'taskCard.status_failed', classes: 'bg-red-500/20 text-red-300' },
  cancelled: { labelKey: 'taskCard.status_cancelled', classes: 'bg-amber-500/20 text-amber-300' },
  aborted: { labelKey: 'taskCard.status_aborted', classes: 'bg-zinc-600 text-zinc-400' },
};

interface ScreenshotItem {
  url: string;
  stepIndex: number;
  phase: string;
}

export default function TaskDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [steps, setSteps] = useState<StepRecord[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close export dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!id) return;

    const fetchTask = async () => {
      try {
        setIsLoading(true);
        const data = await api.tasks.get(id);
        setTask(data.task);
        setSteps((data.steps as StepRecord[]) ?? []);

        // Extract screenshots from steps
        const ss: ScreenshotItem[] = (data.steps as StepRecord[])
          ?.filter((s) => s.screenshotPath)
          .map((s) => ({
            url: getScreenshotUrl(id, s.stepIndex),
            stepIndex: s.stepIndex,
            phase: s.phase,
          })) ?? [];
        setScreenshots(ss);
      } catch {
        // Fetch task failure - gracefully skip
        setError(t('taskDetail.loadError'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchTask();
  }, [id]);

  const handleDownloadReport = async () => {
    if (!id) return;
    try {
      const report = await api.reports.get(id);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Report download failure - gracefully skip
    }
  };

  const handleDownloadHtmlReport = () => {
    if (!id) return;
    const url = api.reports.getHtmlUrl(id);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${id}.html`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-zinc-500">{t('taskDetail.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-red-400">{error ?? t('taskDetail.notFound')}</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 text-sm font-medium text-indigo-400 hover:text-indigo-300"
        >
          {t('taskDetail.backToTasks')}
        </button>
      </div>
    );
  }

  const status = statusConfig[task.status];
  const currentStepIndex = task.status === 'running' ? task.stepCount - 1 : -1;

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
            <h1 className="text-xl font-bold text-zinc-100">{task.goal}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.classes}`}>
                {t(status.labelKey)}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <Cpu className="size-3.5" />
                {task.llmModel}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <ListChecks className="size-3.5" />
                {task.stepCount} {t('common.steps')}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <Clock className="size-3.5" />
                {formatTimeRange(task.createdAt, task.updatedAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={handleDownloadReport}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            aria-label={t('common.downloadJson')}
          >
            <Download className="size-4" />
            {t('taskDetail.downloadJson')}
          </button>
          <button
            onClick={handleDownloadHtmlReport}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            aria-label={t('common.downloadHtml')}
          >
            <Download className="size-4" />
            {t('taskDetail.downloadHtml')}
          </button>

          {/* Export dropdown */}
          <div ref={exportRef} className="relative">
            <button
              onClick={() => setExportOpen(!exportOpen)}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              aria-label={t('taskDetail.export')}
            >
              <Download className="size-4" />
              {t('taskDetail.export')}
              <ChevronDown className={`size-3.5 transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
                <button
                  onClick={() => { if (id) window.open(getExportUrl(id, 'json')); setExportOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <FileJson className="size-4 text-zinc-500" />
                  {t('taskDetail.exportJson')}
                </button>
                <button
                  onClick={() => { if (id) window.open(getExportUrl(id, 'csv')); setExportOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <FileSpreadsheet className="size-4 text-zinc-500" />
                  {t('taskDetail.exportCsv')}
                </button>
                <button
                  onClick={() => { if (id) window.open(getExportUrl(id, 'html')); setExportOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <FileText className="size-4 text-zinc-500" />
                  {t('taskDetail.exportHtml')}
                </button>
                <button
                  onClick={() => { if (id) window.open(getExportUrl(id, 'pdf')); setExportOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <FileText className="size-4 text-red-400" />
                  {t('taskDetail.exportPdf')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Steps timeline */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-400">{t('taskDetail.stepsSection')}</h2>
        <StepTimeline steps={steps} currentStepIndex={currentStepIndex} />
      </section>

      {/* Screenshots */}
      {screenshots.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-400">
            <ImageIcon className="size-4" />
            {t('taskDetail.screenshotsSection', { count: screenshots.length })}
          </h2>
          <ScreenshotGallery screenshots={screenshots} />
        </section>
      )}
    </div>
  );
}

function formatTimeRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
