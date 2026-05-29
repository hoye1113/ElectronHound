import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Filter, Download, CheckSquare, Square, X } from 'lucide-react';
import type { TaskStatus } from '@eata/shared-types';
import { useTaskStore } from '../stores/taskStore';
import TaskCard from '../components/TaskCard';
import CreateTaskForm from '../components/CreateTaskForm';
import { api } from '../lib/api';

const STATUS_FILTERS: { labelKey: string; value: TaskStatus | 'all' }[] = [
  { labelKey: 'taskList.filter_all', value: 'all' },
  { labelKey: 'taskList.filter_queued', value: 'queued' },
  { labelKey: 'taskList.filter_running', value: 'running' },
  { labelKey: 'taskList.filter_completed', value: 'completed' },
  { labelKey: 'taskList.filter_failed', value: 'failed' },
  { labelKey: 'taskList.filter_cancelled', value: 'cancelled' },
];

const PAGE_SIZE = 10;

export default function TaskList() {
  const { t } = useTranslation();
  const tasks = useTaskStore((s) => s.tasks);
  const isLoading = useTaskStore((s) => s.isLoading);
  const error = useTaskStore((s) => s.error);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);

  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const toggleTask = useCallback((id: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const filtered = statusFilter === 'all' ? tasks : tasks.filter((t) => t.status === statusFilter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectAll = useCallback(() => {
    setSelectedTasks(new Set(paginated.map((t) => t.id)));
  }, [paginated]);

  const deselectAll = useCallback(() => {
    setSelectedTasks(new Set());
  }, []);

  const handleBatchExport = useCallback(async (format: 'json' | 'csv' | 'html' | 'pdf') => {
    if (selectedTasks.size === 0) return;
    setExporting(true);
    try {
      const blob = await api.tasks.batchExport(Array.from(selectedTasks), format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tasks-export.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Batch export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [selectedTasks]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{t('taskList.title')}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {filtered.length} task{filtered.length !== 1 ? 's' : ''}
            {statusFilter !== 'all' && ` · ${statusFilter}`}
          </p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <Plus className="size-4" />
          {t('taskList.newTask')}
        </button>
      </div>

      {/* Status filter bar */}
      <div className="flex items-center gap-2 overflow-x-auto">
        <Filter className="size-4 shrink-0 text-zinc-500" />
        {STATUS_FILTERS.map(({ labelKey, value }) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === value
                ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30'
                : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={selectAll}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
            title="Select all on page"
          >
            <CheckSquare className="size-3.5" />
          </button>
          {selectedTasks.size > 0 && (
            <button
              onClick={deselectAll}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
              title="Deselect all"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Batch export toolbar */}
      {selectedTasks.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-4 py-2.5">
          <span className="text-sm text-indigo-300">
            {selectedTasks.size} task{selectedTasks.size !== 1 ? 's' : ''} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => handleBatchExport('json')}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
            >
              <Download className="size-3.5" />
              JSON
            </button>
            <button
              onClick={() => handleBatchExport('csv')}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
            >
              <Download className="size-3.5" />
              CSV
            </button>
            <button
              onClick={() => handleBatchExport('html')}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
            >
              <Download className="size-3.5" />
              HTML
            </button>
            <button
              onClick={() => handleBatchExport('pdf')}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-zinc-700 disabled:opacity-50"
            >
              <Download className="size-3.5" />
              PDF
            </button>
          </div>
        </div>
      )}

      {/* Task grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-sm text-zinc-500">{t('taskList.loading')}</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-sm text-red-400">{t('taskList.error', 'Failed to load tasks')}</p>
          <button
            onClick={() => fetchTasks()}
            className="mt-3 text-sm font-medium text-indigo-400 hover:text-indigo-300"
          >
            {t('common.retry', 'Retry')}
          </button>
        </div>
      ) : paginated.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-20">
          <p className="text-sm text-zinc-500">{t('taskList.empty')}</p>
          <button
            onClick={() => setDialogOpen(true)}
            className="mt-3 text-sm font-medium text-indigo-400 hover:text-indigo-300"
          >
            {t('taskList.emptyHint')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {paginated.map((task) => (
            <div key={task.id} className="relative group">
              <button
                onClick={() => toggleTask(task.id)}
                className="absolute top-3 left-3 z-10 rounded-md bg-zinc-900/80 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {selectedTasks.has(task.id) ? (
                  <CheckSquare className="size-4 text-indigo-400" />
                ) : (
                  <Square className="size-4 text-zinc-500" />
                )}
              </button>
              {selectedTasks.has(task.id) && (
                <div className="absolute inset-0 rounded-xl border-2 border-indigo-500/50 pointer-events-none z-10" />
              )}
              <TaskCard task={task} />
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            {t('common.pageOf', { current: page, total: totalPages })}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('common.previous')}
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('common.next')}
            </button>
          </div>
        </div>
      )}

      {/* Create task dialog */}
      <CreateTaskForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => fetchTasks()}
      />
    </div>
  );
}
