import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Plus,
  X,
  Check,
  Loader2,
  Layers,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { api } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type BatchStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
type BatchPriority = 'low' | 'medium' | 'high';

interface StoredBatch {
  batchId: string;
  name: string | null;
  createdAt: string;
}

interface BatchData {
  id: string;
  name: string | null;
  status: BatchStatus;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  priority: string;
  createdAt: string;
  updatedAt: string;
  progress: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'eata-batches';

const STATUS_STYLES: Record<BatchStatus, string> = {
  pending: 'bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30',
  running: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',
  completed: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30',
  failed: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
  cancelled: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadStoredBatches(): StoredBatch[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StoredBatch[];
  } catch {
    return [];
  }
}

function saveStoredBatches(batches: StoredBatch[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
}

function formatTimeAgo(isoDate: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return t('taskCard.timeAgo_seconds', { count: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('taskCard.timeAgo_minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('taskCard.timeAgo_hours', { count: hours });
  const days = Math.floor(hours / 24);
  return t('taskCard.timeAgo_days', { count: days });
}

// ─── New Batch Dialog ─────────────────────────────────────────────────────────

interface NewBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (batch: StoredBatch) => void;
}

function NewBatchDialog({ open, onOpenChange, onSuccess }: NewBatchDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [taskCount, setTaskCount] = useState(3);
  const [priority, setPriority] = useState<BatchPriority>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName('');
      setGoal('');
      setTaskCount(3);
      setPriority('medium');
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const tasks = Array.from({ length: taskCount }, () => ({ goal: goal.trim() }));
      const result = await api.batches.create({
        name: name.trim() || undefined,
        tasks,
        priority,
      });

      const stored: StoredBatch = {
        batchId: result.batchId,
        name: name.trim() || null,
        createdAt: new Date().toISOString(),
      };
      onSuccess(stored);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('batch.createError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputBase =
    'w-full rounded-lg border bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-zinc-100">
              {t('batch.newBatch')}
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="batch-name" className="text-sm font-medium text-zinc-300">
                {t('batch.name')}
              </label>
              <input
                id="batch-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('batch.namePlaceholder')}
                className={`${inputBase} border-zinc-700`}
              />
            </div>

            {/* Goal */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="batch-goal" className="text-sm font-medium text-zinc-300">
                {t('batch.goal')} <span className="text-red-400">*</span>
              </label>
              <textarea
                id="batch-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={t('batch.goalPlaceholder')}
                rows={3}
                className={`${inputBase} resize-none border-zinc-700`}
                required
              />
            </div>

            {/* Task Count */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="batch-taskCount" className="text-sm font-medium text-zinc-300">
                {t('batch.taskCount')}
              </label>
              <input
                id="batch-taskCount"
                type="number"
                min={1}
                max={100}
                value={taskCount}
                onChange={(e) => setTaskCount(Math.max(1, Math.min(100, Number(e.target.value))))}
                className={`${inputBase} border-zinc-700`}
              />
            </div>

            {/* Priority */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-300">{t('batch.priority')}</label>
              <div className="flex gap-2">
                {(['low', 'medium', 'high'] as BatchPriority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      priority === p
                        ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {t(`batch.priority_${p}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="mt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !goal.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                {isSubmitting ? t('createTask.submitting') : t('batch.newBatch')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Cancel Confirm Dialog ────────────────────────────────────────────────────

interface CancelConfirmDialogProps {
  batch: BatchData | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function CancelConfirmDialog({ batch, onConfirm, onCancel }: CancelConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog.Root open={batch !== null} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          <Dialog.Title className="text-lg font-semibold text-zinc-100">
            {t('batch.cancel')}
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm text-zinc-400">
            {t('batch.cancelConfirm')}
          </Dialog.Description>
          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
            >
              <Trash2 className="size-4" />
              {t('batch.cancel')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Batch Row ────────────────────────────────────────────────────────────────

interface BatchRowProps {
  batch: BatchData;
  onCancel: (batch: BatchData) => void;
  onRemove: (batchId: string) => void;
}

function BatchRow({ batch, onCancel, onRemove }: BatchRowProps) {
  const { t } = useTranslation();
  const isActive = batch.status === 'pending' || batch.status === 'running';

  return (
    <div className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700">
      {/* Icon */}
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
        <Layers className="size-5 text-zinc-400" />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-zinc-100">
            {batch.name || batch.id.slice(0, 8)}
          </h3>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[batch.status]}`}>
            {t(`batch.status_${batch.status}`)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
          <span>
            {t('batch.tasks')}: {batch.completedTasks}/{batch.totalTasks}
            {batch.failedTasks > 0 && <span className="text-red-400"> ({batch.failedTasks} failed)</span>}
          </span>
          <span className="text-zinc-700">|</span>
          <span>{formatTimeAgo(batch.createdAt, t)}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="hidden w-24 sm:block">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full transition-all ${
              batch.status === 'failed' ? 'bg-red-500' : batch.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${batch.progress}%` }}
          />
        </div>
        <p className="mt-1 text-center text-[10px] text-zinc-500">{batch.progress}%</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {isActive && (
          <button
            type="button"
            onClick={() => onCancel(batch)}
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-amber-400"
            title={t('batch.cancel')}
          >
            <X className="size-4" />
          </button>
        )}
        {!isActive && (
          <button
            type="button"
            onClick={() => onRemove(batch.id)}
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-red-400"
            title={t('common.delete')}
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BatchList() {
  const { t } = useTranslation();
  const [storedBatches, setStoredBatches] = useState<StoredBatch[]>([]);
  const [batchDataMap, setBatchDataMap] = useState<Map<string, BatchData>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<BatchData | null>(null);

  // Load stored batches and fetch their status
  const refreshBatches = useCallback(async () => {
    const stored = loadStoredBatches();
    setStoredBatches(stored);

    const dataMap = new Map<string, BatchData>();
    await Promise.allSettled(
      stored.map(async (s) => {
        try {
          const data = await api.batches.get(s.batchId);
          dataMap.set(s.batchId, data as unknown as BatchData);
        } catch {
          // Batch may have been deleted from the server; keep the stored entry
          // so the user can manually remove it
        }
      })
    );
    setBatchDataMap(dataMap);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refreshBatches();
  }, [refreshBatches]);

  // Auto-refresh running batches
  useEffect(() => {
    const hasActive = Array.from(batchDataMap.values()).some(
      (b) => b.status === 'pending' || b.status === 'running'
    );
    if (!hasActive) return;

    const interval = setInterval(refreshBatches, 10_000);
    return () => clearInterval(interval);
  }, [batchDataMap, refreshBatches]);

  const handleCreateSuccess = (stored: StoredBatch) => {
    const updated = [stored, ...storedBatches];
    setStoredBatches(updated);
    saveStoredBatches(updated);
    // Fetch the new batch status
    api.batches.get(stored.batchId).then((data) => {
      setBatchDataMap((prev) => new Map(prev).set(stored.batchId, data as unknown as BatchData));
    });
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    try {
      await api.batches.cancel(cancelTarget.id);
      setCancelTarget(null);
      refreshBatches();
    } catch {
      // Silently fail; user can retry
      setCancelTarget(null);
    }
  };

  const handleRemove = (batchId: string) => {
    const updated = storedBatches.filter((b) => b.batchId !== batchId);
    setStoredBatches(updated);
    saveStoredBatches(updated);
    setBatchDataMap((prev) => {
      const next = new Map(prev);
      next.delete(batchId);
      return next;
    });
  };

  // Sort: active first, then by creation date descending
  const sortedBatches = storedBatches
    .map((s) => ({ stored: s, data: batchDataMap.get(s.batchId) }))
    .sort((a, b) => {
      const aActive = a.data && (a.data.status === 'pending' || a.data.status === 'running');
      const bActive = b.data && (b.data.status === 'pending' || b.data.status === 'running');
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return new Date(b.stored.createdAt).getTime() - new Date(a.stored.createdAt).getTime();
    });

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{t('batch.title')}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {storedBatches.length} batch{storedBatches.length !== 1 ? 'es' : ''}
          </p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <Plus className="size-4" />
          {t('batch.newBatch')}
        </button>
      </div>

      {/* Batch list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-sm text-zinc-500">{t('common.loading')}</p>
          </div>
        </div>
      ) : sortedBatches.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-20">
          <Layers className="mb-3 size-10 text-zinc-700" />
          <p className="text-sm text-zinc-500">{t('batch.noBatches')}</p>
          <button
            onClick={() => setDialogOpen(true)}
            className="mt-3 text-sm font-medium text-indigo-400 hover:text-indigo-300"
          >
            {t('batch.noBatchesHint')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sortedBatches.map(({ stored, data }) => {
            if (!data) {
              // Still loading or fetch failed; show minimal info
              return (
                <div
                  key={stored.batchId}
                  className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
                    <Layers className="size-5 text-zinc-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-zinc-100">
                      {stored.name || stored.batchId.slice(0, 8)}
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500">{formatTimeAgo(stored.createdAt, t)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(stored.batchId)}
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-red-400"
                    title={t('common.delete')}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            }

            return (
              <BatchRow
                key={stored.batchId}
                batch={data}
                onCancel={setCancelTarget}
                onRemove={handleRemove}
              />
            );
          })}
        </div>
      )}

      {/* New Batch Dialog */}
      <NewBatchDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleCreateSuccess}
      />

      {/* Cancel Confirmation */}
      <CancelConfirmDialog
        batch={cancelTarget}
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
