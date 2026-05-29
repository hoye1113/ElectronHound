import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import { X, ExternalLink } from 'lucide-react';
import type { ScheduleRun } from '../lib/api';
import { api } from '../lib/api';

interface ScheduleHistoryProps {
  scheduleId: string;
  onClose: () => void;
}

export default function ScheduleHistory({ scheduleId, onClose }: ScheduleHistoryProps) {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.schedules.history(scheduleId)
      .then((res) => setRuns(res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [scheduleId]);

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-500/15 text-emerald-400';
      case 'failed': return 'bg-red-500/15 text-red-400';
      case 'running': return 'bg-yellow-500/15 text-yellow-400';
      default: return 'bg-zinc-500/15 text-zinc-400';
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 max-h-[80vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-zinc-100">
              {t('scheduleHistory.title')}
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            </div>
          ) : runs.length === 0 ? (
            <p className="mt-6 text-center text-sm text-zinc-500">{t('scheduleHistory.empty')}</p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {runs.map((run) => (
                <div key={run.id} className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor(run.status)}`}>
                      {run.status}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {new Date(run.startedAt).toLocaleString()}
                    </span>
                  </div>
                  {run.taskId && (
                    <a
                      href={`/task/${run.taskId}`}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      {t('scheduleHistory.viewTask')} <ExternalLink className="size-3" />
                    </a>
                  )}
                  {run.error && (
                    <p className="mt-1.5 text-xs text-red-400 line-clamp-2">{run.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
