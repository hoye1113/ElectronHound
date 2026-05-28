import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, Loader2, AlertTriangle, Terminal, TreePine, XCircle } from 'lucide-react';
import type { TaskStatus, StepRecord } from '@eata/shared-types';
import { useTaskStore } from '../stores/taskStore';
import { connectSSE } from '../lib/sse';
import StepTimeline from '../components/StepTimeline';
import AccessibilityTreeView from '../components/AccessibilityTreeView';
import LogPanel, { type LogEntry } from '../components/LogPanel';

interface AccessibilityTreeNode {
  role: string;
  name: string;
  children?: AccessibilityTreeNode[];
}

const statusConfig: Record<TaskStatus, { labelKey: string; classes: string }> = {
  queued: { labelKey: 'taskCard.status_queued', classes: 'bg-zinc-700 text-zinc-300' },
  running: { labelKey: 'taskCard.status_running', classes: 'bg-blue-500/20 text-blue-300' },
  completed: { labelKey: 'taskCard.status_completed', classes: 'bg-emerald-500/20 text-emerald-300' },
  failed: { labelKey: 'taskCard.status_failed', classes: 'bg-red-500/20 text-red-300' },
  cancelled: { labelKey: 'taskCard.status_cancelled', classes: 'bg-amber-500/20 text-amber-300' },
  aborted: { labelKey: 'taskCard.status_aborted', classes: 'bg-zinc-600 text-zinc-400' },
};

const phaseLabelKeys: Record<string, string> = {
  observe: 'stepTimeline.phase_observe',
  plan: 'stepTimeline.phase_plan',
  execute: 'stepTimeline.phase_execute',
  verify: 'stepTimeline.phase_verify',
};

export default function LiveMonitor() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const currentTask = useTaskStore((s) => s.currentTask);
  const currentTaskSteps = useTaskStore((s) => s.currentTaskSteps) as StepRecord[];
  const fetchTask = useTaskStore((s) => s.fetchTask);
  const cancelTask = useTaskStore((s) => s.cancelTask);
  const subscribeToTask = useTaskStore((s) => s.subscribeToTask);
  const isLoading = useTaskStore((s) => s.isLoading);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [a11ySnapshot, setA11ySnapshot] = useState<AccessibilityTreeNode | string | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  // Fetch initial task data
  useEffect(() => {
    if (id) {
      fetchTask(id);
    }
  }, [id, fetchTask]);

  // Subscribe to SSE for real-time updates
  useEffect(() => {
    if (!id) return;

    // Use store subscription for step events
    const cleanupStore = subscribeToTask(id);

    // Direct SSE connection for log events
    const es = connectSSE(id, {
      onLog: (data) => {
        const entry = data as LogEntry;
        if (entry.timestamp && entry.message) {
          setLogs((prev) => [...prev, entry]);
        }
      },
      onStatus: (data) => {
        // Status updates are handled by store's onComplete -> fetchTask
        const statusData = data as { status?: string };
        if (statusData?.status) {
          fetchTask(id);
        }
      },
    });
    sseRef.current = es;

    return () => {
      cleanupStore();
      es.close();
    };
  }, [id, subscribeToTask, fetchTask]);

  // Extract a11y snapshot from latest step
  useEffect(() => {
    if (currentTaskSteps.length > 0) {
      const latest = currentTaskSteps[currentTaskSteps.length - 1];
      if (latest.accessibilitySnapshotPath) {
        setA11ySnapshot(latest.accessibilitySnapshotPath);
      }
    }
  }, [currentTaskSteps]);

  const handleCancel = async () => {
    if (id && window.confirm(t('taskCard.cancelConfirm'))) {
      await cancelTask(id);
    }
  };

  if (!id) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-6">
        <AlertTriangle className="size-8 text-amber-400" />
        <h1 className="text-xl font-bold text-zinc-100">{t('liveMonitor.noTaskId')}</h1>
        <p className="text-sm text-zinc-500">{t('liveMonitor.selectTask')}</p>
      </div>
    );
  }

  const task = currentTask;
  const steps = currentTaskSteps;
  const currentStepIndex = Math.max(0, steps.length - 1);
  const currentPhase = steps.length > 0 ? steps[currentStepIndex]?.phase : null;
  const status = task?.status;
  const config = status ? statusConfig[status] : null;

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Activity className="size-5 shrink-0 text-indigo-400" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-zinc-100">
              {task?.goal ?? 'Loading task...'}
            </h1>
            <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
              <span className="font-mono text-zinc-400">{id}</span>
              {task && (
                <>
                  <span>·</span>
                  <span>{task.stepCount} {t('common.steps')}</span>
                  <span>·</span>
                  <span>{task.llmModel}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {config && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${config.classes}`}
            >
              {status === 'running' && <Loader2 className="size-3 animate-spin" />}
              {t(config.labelKey)}
            </span>
          )}
          {currentPhase && (
            <span className="rounded-md bg-indigo-500/15 px-2.5 py-1 text-xs font-semibold text-indigo-300">
              {t(phaseLabelKeys[currentPhase])}
            </span>
          )}
          {(status === 'running' || status === 'queued') && (
            <button
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600/80 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600"
            >
              <XCircle className="size-3.5" />
              {t('common.cancel')}
            </button>
          )}
        </div>
      </div>

      {isLoading && !task ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-sm text-zinc-500">{t('liveMonitor.loading')}</p>
          </div>
        </div>
      ) : (
        /* Main content: 2-column layout */
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Left column (2/3): Step timeline */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h2 className="mb-3 text-sm font-semibold text-zinc-300">{t('liveMonitor.stepTimeline')}</h2>
              <StepTimeline steps={steps} currentStepIndex={currentStepIndex} />
            </div>
          </div>

          {/* Right column (1/3): Log panel + Accessibility tree */}
          <div className="flex flex-col gap-4">
            {/* Log Panel */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-300">
                <Terminal className="size-4" />
                {t('liveMonitor.liveLogs')}
              </h2>
              <LogPanel logs={logs} />
            </div>

            {/* Accessibility Tree */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-300">
                <TreePine className="size-4" />
                {t('liveMonitor.accessibilityTree')}
              </h2>
              <div className="max-h-64 overflow-auto">
                <AccessibilityTreeView snapshot={a11ySnapshot} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

