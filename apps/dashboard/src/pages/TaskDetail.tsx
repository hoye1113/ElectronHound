import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Clock,
  Cpu,
  ListChecks,
  Image as ImageIcon,
} from 'lucide-react';
import type { Task, TaskStatus, StepRecord } from '@eata/shared-types';
import { api, getScreenshotUrl } from '../lib/api';
import StepTimeline from '../components/StepTimeline';
import ScreenshotGallery from '../components/ScreenshotGallery';

const statusConfig: Record<TaskStatus, { label: string; classes: string }> = {
  queued: { label: 'Queued', classes: 'bg-zinc-700 text-zinc-300' },
  running: { label: 'Running', classes: 'bg-blue-500/20 text-blue-300' },
  completed: { label: 'Completed', classes: 'bg-emerald-500/20 text-emerald-300' },
  failed: { label: 'Failed', classes: 'bg-red-500/20 text-red-300' },
  cancelled: { label: 'Cancelled', classes: 'bg-amber-500/20 text-amber-300' },
  aborted: { label: 'Aborted', classes: 'bg-zinc-600 text-zinc-400' },
};

interface ScreenshotItem {
  url: string;
  stepIndex: number;
  phase: string;
}

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [steps, setSteps] = useState<StepRecord[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        // Fetch screenshot failure - gracefully skip
        setError('Failed to load task details');
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
          <p className="text-sm text-zinc-500">Loading task details...</p>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-red-400">{error ?? 'Task not found'}</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 text-sm font-medium text-indigo-400 hover:text-indigo-300"
        >
          ← Back to tasks
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
            aria-label="Back to task list"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">{task.goal}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.classes}`}>
                {status.label}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <Cpu className="size-3.5" />
                {task.llmModel}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <ListChecks className="size-3.5" />
                {task.stepCount} steps
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
            aria-label="Download JSON report"
          >
            <Download className="size-4" />
            JSON
          </button>
          <button
            onClick={handleDownloadHtmlReport}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Download HTML report"
          >
            <Download className="size-4" />
            HTML Report
          </button>
        </div>
      </div>

      {/* Steps timeline */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-400">Steps</h2>
        <StepTimeline steps={steps} currentStepIndex={currentStepIndex} />
      </section>

      {/* Screenshots */}
      {screenshots.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-400">
            <ImageIcon className="size-4" />
            Screenshots ({screenshots.length})
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
