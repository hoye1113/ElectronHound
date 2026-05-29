import { useState } from 'react';
import { GitCompareArrows, Search, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';

interface DiffResult {
  newFailures: Array<{ stepIndex: number; phase: string; message: string }>;
  fixedIssues: Array<{ stepIndex: number; phase: string; message: string }>;
  planChanges: Array<{ stepIndex: number; message: string }>;
  unchangedCount: number;
}

interface CompareResponse {
  taskA: { id: string; goal: string; status: string };
  taskB: { id: string; goal: string; status: string };
  diff: DiffResult;
}

export default function CompareView() {
  const [taskAId, setTaskAId] = useState('');
  const [taskBId, setTaskBId] = useState('');
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCompare = async () => {
    if (!taskAId.trim() || !taskBId.trim()) {
      setError('Please enter both task IDs');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await api.compare.run([taskAId.trim(), taskBId.trim()]) as CompareResponse;
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-zinc-100">
          <GitCompareArrows className="size-6 text-indigo-400" />
          Compare Tasks
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Compare two tasks to see differences in their execution results
        </p>
      </div>

      {/* Input form */}
      <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="task-a" className="mb-1.5 block text-xs font-medium text-zinc-400">
              Task A ID
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
            <label htmlFor="task-b" className="mb-1.5 block text-xs font-medium text-zinc-400">
              Task B ID
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
          {loading ? 'Comparing...' : 'Compare'}
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
          {/* Task summary */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <p className="mb-1 text-xs font-medium text-zinc-500">Task A</p>
              <p className="text-sm font-semibold text-zinc-100 truncate">{result.taskA.goal}</p>
              <p className="mt-1 text-xs text-zinc-400">
                Status: <span className="capitalize">{result.taskA.status}</span>
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <p className="mb-1 text-xs font-medium text-zinc-500">Task B</p>
              <p className="text-sm font-semibold text-zinc-100 truncate">{result.taskB.goal}</p>
              <p className="mt-1 text-xs text-zinc-400">
                Status: <span className="capitalize">{result.taskB.status}</span>
              </p>
            </div>
          </div>

          {/* Diff summary cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
              <p className="text-2xl font-bold text-red-400">{result.diff.newFailures.length}</p>
              <p className="mt-1 text-xs text-red-300">New Failures</p>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
              <p className="text-2xl font-bold text-emerald-400">{result.diff.fixedIssues.length}</p>
              <p className="mt-1 text-xs text-emerald-300">Fixed Issues</p>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
              <p className="text-2xl font-bold text-amber-400">{result.diff.planChanges.length}</p>
              <p className="mt-1 text-xs text-amber-300">Plan Changes</p>
            </div>
            <div className="rounded-xl border border-zinc-500/30 bg-zinc-500/10 p-4 text-center">
              <p className="text-2xl font-bold text-zinc-400">{result.diff.unchangedCount}</p>
              <p className="mt-1 text-xs text-zinc-300">Unchanged</p>
            </div>
          </div>

          {/* New Failures detail */}
          {result.diff.newFailures.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <AlertTriangle className="size-4 text-red-400" />
                New Failures
              </h3>
              <ul className="space-y-2">
                {result.diff.newFailures.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 rounded-lg bg-zinc-800/50 px-3 py-2">
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
                Fixed Issues
              </h3>
              <ul className="space-y-2">
                {result.diff.fixedIssues.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 rounded-lg bg-zinc-800/50 px-3 py-2">
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
                Plan Changes
              </h3>
              <ul className="space-y-2">
                {result.diff.planChanges.map((c, i) => (
                  <li key={i} className="rounded-lg bg-zinc-800/50 px-3 py-2">
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
