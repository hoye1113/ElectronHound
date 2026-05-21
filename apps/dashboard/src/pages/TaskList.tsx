import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Filter } from 'lucide-react';
import type { TaskStatus } from '@eata/shared-types';
import { useTaskStore } from '../stores/taskStore';
import TaskCard from '../components/TaskCard';
import CreateTaskForm from '../components/CreateTaskForm';

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
  const fetchTasks = useTaskStore((s) => s.fetchTasks);

  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const filtered = statusFilter === 'all' ? tasks : tasks.filter((t) => t.status === statusFilter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
      </div>

      {/* Task grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-sm text-zinc-500">{t('taskList.loading')}</p>
          </div>
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
            <TaskCard key={task.id} task={task} />
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
