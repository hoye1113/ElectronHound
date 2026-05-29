import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GitCompareArrows,
  Search,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  BarChart3,
  Table2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../lib/api';

// ── Types ────────────────────────────────────────────────────────────

interface DiffResult {
  newFailures: Array<{ stepIndex: number; phase: string; message: string }>;
  fixedIssues: Array<{ stepIndex: number; phase: string; message: string }>;
  planChanges: Array<{ stepIndex: number; message: string }>;
  unchangedCount: number;
}

interface StepSummary {
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  retriedSteps: number;
  totalDuration: number;
}

interface TimelineEntry {
  stepIndex: number;
  phase: string;
  taskAStatus: string | null;
  taskBStatus: string | null;
  taskADuration: number;
  taskBDuration: number;
  changed: boolean;
}

interface DetailedCompareResponse {
  taskA: { id: string; goal: string; status: string };
  taskB: { id: string; goal: string; status: string };
  diff: DiffResult;
  summary: {
    taskA: StepSummary;
    taskB: StepSummary;
  };
  actionFrequency: {
    taskA: Record<string, number>;
    taskB: Record<string, number>;
  };
  timelineDiff: TimelineEntry[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function statusBg(status: string | null): string {
  if (status === 'success') return 'bg-emerald-500/15 text-emerald-400';
  if (status === 'failed') return 'bg-red-500/15 text-red-400';
  if (status === 'retry') return 'bg-amber-500/15 text-amber-400';
  return 'bg-zinc-500/10 text-zinc-500';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function buildChartData(
  taskAFreq: Record<string, number>,
  taskBFreq: Record<string, number>,
) {
  const allActions = Array.from(
    new Set([...Object.keys(taskAFreq), ...Object.keys(taskBFreq)]),
  ).sort();

  return allActions.map((name) => ({
    name,
    taskA: taskAFreq[name] ?? 0,
    taskB: taskBFreq[name] ?? 0,
  }));
}

// ── Component ────────────────────────────────────────────────────────

export default function CompareView() {
  const { t } = useTranslation();
  const [taskAId, setTaskAId] = useState('');
  const [taskBId, setTaskBId] = useState('');
  const [result, setResult] = useState<DetailedCompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCompare = async () => {
    if (!taskAId.trim() || !taskBId.trim()) {
      setError(t('compare.enterBothIds'));
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = (await api.compare.detailed([
        taskAId.trim(),
        taskBId.trim(),
      ])) as DetailedCompareResponse;
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('compare.loadError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-zinc-100">
          <GitCompareArrows className="size-6 text-indigo-400" />
          {t('compare.title')}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {t('compare.subtitle')}
        </p>
      </div>

      {/* Input form */}
      <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="task-a"
              className="mb-1.5 block text-xs font-medium text-zinc-400"
            >
              {t('compare.taskA')} ID
            </label>
            <input
              id="task-a"
              type="text"
              value={taskAId}
              onChange={(e) => setTaskAId(e.target.value)}
              placeholder="Enter first task ID"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label
              htmlFor="task-b"
              className="mb-1.5 block text-xs font-medium text-zinc-400"
            >
              {t('compare.taskB')} ID
            </label>
            <input
              id="task-b"
              type="text"
              value={taskBId}
              onChange={(e) => setTaskBId(e.target.value)}
              placeholder="Enter second task ID"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
        <button
          onClick={handleCompare}
          disabled={loading}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          {loading ? t('compare.comparing') : t('compare.compare')}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <AlertTriangle className="size-5 shrink-0 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Task summary cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <p className="mb-1 text-xs font-medium text-zinc-500">
                {t('compare.taskA')}
              </p>
              <p className="text-sm font-semibold text-zinc-100 truncate">
                {result.taskA.goal}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Status:{' '}
                <span className="capitalize">{result.taskA.status}</span>
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <p className="mb-1 text-xs font-medium text-zinc-500">
                {t('compare.taskB')}
              </p>
              <p className="text-sm font-semibold text-zinc-100 truncate">
                {result.taskB.goal}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Status:{' '}
                <span className="capitalize">{result.taskB.status}</span>
              </p>
            </div>
          </div>

          {/* Diff summary cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
              <p className="text-2xl font-bold text-red-400">
                {result.diff.newFailures.length}
              </p>
              <p className="mt-1 text-xs text-red-300">
                {t('compare.newFailures')}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
              <p className="text-2xl font-bold text-emerald-400">
                {result.diff.fixedIssues.length}
              </p>
              <p className="mt-1 text-xs text-emerald-300">
                {t('compare.fixedIssues')}
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
              <p className="text-2xl font-bold text-amber-400">
                {result.diff.planChanges.length}
              </p>
              <p className="mt-1 text-xs text-amber-300">
                {t('compare.planChanges')}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-500/30 bg-zinc-500/10 p-4 text-center">
              <p className="text-2xl font-bold text-zinc-400">
                {result.diff.unchangedCount}
              </p>
              <p className="mt-1 text-xs text-zinc-300">
                {t('compare.unchanged')}
              </p>
            </div>
          </div>

          {/* Status Summary */}
          {result.summary && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <BarChart3 className="size-4 text-indigo-400" />
                {t('compare.statusSummary')}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Task A summary */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-zinc-500">
                    {t('compare.taskA')}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
                      <p className="text-lg font-bold text-zinc-100">
                        {result.summary.taskA.totalSteps}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {t('compare.totalSteps')}
                      </p>
                    </div>
                    <div className="rounded-lg bg-emerald-500/10 px-3 py-2">
                      <p className="text-lg font-bold text-emerald-400">
                        {result.summary.taskA.passedSteps}
                      </p>
                      <p className="text-xs text-emerald-300">
                        {t('compare.passed')}
                      </p>
                    </div>
                    <div className="rounded-lg bg-red-500/10 px-3 py-2">
                      <p className="text-lg font-bold text-red-400">
                        {result.summary.taskA.failedSteps}
                      </p>
                      <p className="text-xs text-red-300">
                        {t('compare.failed')}
                      </p>
                    </div>
                    <div className="rounded-lg bg-amber-500/10 px-3 py-2">
                      <p className="text-lg font-bold text-amber-400">
                        {result.summary.taskA.retriedSteps}
                      </p>
                      <p className="text-xs text-amber-300">
                        {t('compare.retried')}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
                    <p className="text-sm font-medium text-zinc-300">
                      {t('compare.duration')}:{' '}
                      {formatDuration(result.summary.taskA.totalDuration)}
                    </p>
                  </div>
                </div>

                {/* Task B summary */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-zinc-500">
                    {t('compare.taskB')}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
                      <p className="text-lg font-bold text-zinc-100">
                        {result.summary.taskB.totalSteps}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {t('compare.totalSteps')}
                      </p>
                    </div>
                    <div className="rounded-lg bg-emerald-500/10 px-3 py-2">
                      <p className="text-lg font-bold text-emerald-400">
                        {result.summary.taskB.passedSteps}
                      </p>
                      <p className="text-xs text-emerald-300">
                        {t('compare.passed')}
                      </p>
                    </div>
                    <div className="rounded-lg bg-red-500/10 px-3 py-2">
                      <p className="text-lg font-bold text-red-400">
                        {result.summary.taskB.failedSteps}
                      </p>
                      <p className="text-xs text-red-300">
                        {t('compare.failed')}
                      </p>
                    </div>
                    <div className="rounded-lg bg-amber-500/10 px-3 py-2">
                      <p className="text-lg font-bold text-amber-400">
                        {result.summary.taskB.retriedSteps}
                      </p>
                      <p className="text-xs text-amber-300">
                        {t('compare.retried')}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
                    <p className="text-sm font-medium text-zinc-300">
                      {t('compare.duration')}:{' '}
                      {formatDuration(result.summary.taskB.totalDuration)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step Timeline Diff */}
          {result.timelineDiff && result.timelineDiff.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <Table2 className="size-4 text-indigo-400" />
                {t('compare.stepTimeline')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">
                        {t('compare.step')}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">
                        {t('compare.phase')}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">
                        {t('compare.taskAStatus')}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">
                        {t('compare.taskBStatus')}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">
                        {t('compare.changed')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.timelineDiff.map((entry, i) => (
                      <tr
                        key={i}
                        className={
                          entry.changed
                            ? 'border-b border-zinc-800/50 bg-amber-500/5'
                            : 'border-b border-zinc-800/50'
                        }
                      >
                        <td className="px-3 py-2 font-mono text-xs text-zinc-400">
                          {entry.stepIndex}
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-mono text-zinc-300">
                            {entry.phase}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${statusBg(entry.taskAStatus)}`}
                          >
                            {entry.taskAStatus ?? '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${statusBg(entry.taskBStatus)}`}
                          >
                            {entry.taskBStatus ?? '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {entry.changed ? (
                            <span className="inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-400">
                              {t('compare.changed')}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-600">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action Frequency Chart */}
          {result.actionFrequency && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <BarChart3 className="size-4 text-indigo-400" />
                {t('compare.actionFrequency')}
              </h3>
              {(() => {
                const chartData = buildChartData(
                  result.actionFrequency.taskA,
                  result.actionFrequency.taskB,
                );
                if (chartData.length === 0) {
                  return (
                    <p className="py-8 text-center text-sm text-zinc-500">
                      No action data available
                    </p>
                  );
                }
                return (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData}>
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12, fill: '#a1a1aa' }}
                        axisLine={{ stroke: '#3f3f46' }}
                        tickLine={{ stroke: '#3f3f46' }}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: '#a1a1aa' }}
                        axisLine={{ stroke: '#3f3f46' }}
                        tickLine={{ stroke: '#3f3f46' }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: '1px solid #3f3f46',
                          backgroundColor: '#18181b',
                          color: '#e4e4e7',
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="taskA"
                        name={t('compare.taskA')}
                        fill="#6366f1"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="taskB"
                        name={t('compare.taskB')}
                        fill="#8b5cf6"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
          )}

          {/* New Failures detail */}
          {result.diff.newFailures.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <AlertTriangle className="size-4 text-red-400" />
                {t('compare.newFailures')}
              </h3>
              <ul className="space-y-2">
                {result.diff.newFailures.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 rounded-lg bg-zinc-800/50 px-3 py-2"
                  >
                    <span className="shrink-0 rounded bg-red-500/20 px-1.5 py-0.5 text-xs font-mono text-red-300">
                      {f.phase}
                    </span>
                    <span className="text-sm text-zinc-300">{f.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Fixed Issues detail */}
          {result.diff.fixedIssues.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <CheckCircle2 className="size-4 text-emerald-400" />
                {t('compare.fixedIssues')}
              </h3>
              <ul className="space-y-2">
                {result.diff.fixedIssues.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 rounded-lg bg-zinc-800/50 px-3 py-2"
                  >
                    <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-xs font-mono text-emerald-300">
                      {f.phase}
                    </span>
                    <span className="text-sm text-zinc-300">{f.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Plan Changes detail */}
          {result.diff.planChanges.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <GitCompareArrows className="size-4 text-amber-400" />
                {t('compare.planChanges')}
              </h3>
              <ul className="space-y-2">
                {result.diff.planChanges.map((c, i) => (
                  <li
                    key={i}
                    className="rounded-lg bg-zinc-800/50 px-3 py-2"
                  >
                    <span className="text-sm text-zinc-300">{c.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
