import type { Task, TaskStatus } from '@eata/shared-types';
import { useNavigate } from 'react-router-dom';
import { Clock, Trash2, XCircle, Loader2 } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';

const statusConfig: Record<TaskStatus, { label: string; classes: string }> = {
  queued: { label: 'Queued', classes: 'bg-zinc-700 text-zinc-300' },
  running: { label: 'Running', classes: 'bg-blue-500/20 text-blue-300' },
  completed: { label: 'Completed', classes: 'bg-emerald-500/20 text-emerald-300' },
  failed: { label: 'Failed', classes: 'bg-red-500/20 text-red-300' },
  cancelled: { label: 'Cancelled', classes: 'bg-amber-500/20 text-amber-300' },
  aborted: { label: 'Aborted', classes: 'bg-zinc-600 text-zinc-400' },
};

interface TaskCardProps {
  task: Task;
}

export default function TaskCard({ task }: TaskCardProps) {
  const navigate = useNavigate();
  const cancelTask = useTaskStore((s) => s.cancelTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const config = statusConfig[task.status];

  const isCancelable = task.status === 'queued' || task.status === 'running';
  const isDeletable =
    task.status === 'completed' ||
    task.status === 'failed' ||
    task.status === 'cancelled' ||
    task.status === 'aborted';

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Cancel this task?')) {
      await cancelTask(task.id);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this task? This cannot be undone.')) {
      await deleteTask(task.id);
    }
  };

  const handleClick = () => {
    navigate(`/task/${task.id}`);
  };

  const timeAgo = getTimeAgo(task.createdAt);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Task: ${task.goal}`}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/task/${task.id}`);
        }
      }}
      className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
    >
      {/* Header: status + actions */}
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.classes}`}>
          {task.status === 'running' && <Loader2 className="mr-1 size-3 animate-spin" />}
          {config.label}
        </span>

        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {isCancelable && (
            <button
              onClick={handleCancel}
              aria-label="Cancel task"
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-amber-300"
            >
              <XCircle className="size-4" />
            </button>
          )}
          {isDeletable && (
            <button
              onClick={handleDelete}
              aria-label="Delete task"
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-red-300"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Goal */}
      <p className="line-clamp-2 text-sm font-medium text-zinc-100">{task.goal}</p>

      {/* Meta */}
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span className="font-mono text-zinc-400">{task.llmModel}</span>
        <span>{task.stepCount} steps</span>
        <span className="flex items-center gap-1">
          <Clock className="size-3" />
          {timeAgo}
        </span>
      </div>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
