import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Play, Trash2, Clock, History, ToggleLeft, ToggleRight } from 'lucide-react';
import type { Schedule } from '../lib/api';
import { api } from '../lib/api';
import CreateScheduleForm from '../components/CreateScheduleForm';
import ScheduleHistory from '../components/ScheduleHistory';

export default function ScheduleList() {
  const { t } = useTranslation();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.schedules.list();
      setSchedules(res.data ?? []);
    } catch {
      // fetch failed
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      await api.schedules.run(id);
      fetchSchedules();
    } catch {
      // run failed
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('scheduleList.deleteConfirm'))) return;
    try {
      await api.schedules.delete(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // delete failed
    }
  };

  const handleToggle = async (schedule: Schedule) => {
    try {
      await api.schedules.update(schedule.id, { enabled: !schedule.enabled });
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedule.id ? { ...s, enabled: !s.enabled } : s)),
      );
    } catch {
      // toggle failed
    }
  };

  const statusColor = (status: string | null) => {
    switch (status) {
      case 'completed': return 'bg-emerald-500/15 text-emerald-400';
      case 'failed': return 'bg-red-500/15 text-red-400';
      case 'running': return 'bg-yellow-500/15 text-yellow-400';
      default: return 'bg-zinc-500/15 text-zinc-400';
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{t('scheduleList.title')}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t('scheduleList.subtitle')}</p>
        </div>
        <button
          onClick={() => { setEditingSchedule(null); setDialogOpen(true); }}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <Plus className="size-4" />
          {t('scheduleList.newSchedule')}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-sm text-zinc-500">{t('common.loading')}</p>
          </div>
        </div>
      ) : schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-20">
          <Clock className="mb-3 size-10 text-zinc-600" />
          <p className="text-sm text-zinc-500">{t('scheduleList.empty')}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-zinc-100 truncate">{schedule.name}</h3>
                  <p className="mt-1 font-mono text-xs text-zinc-500">{schedule.cronExpression}</p>
                </div>
                <button
                  onClick={() => handleToggle(schedule)}
                  className="shrink-0 text-zinc-400 hover:text-zinc-200"
                  title={schedule.enabled ? t('scheduleList.disable') : t('scheduleList.enable')}
                >
                  {schedule.enabled ? (
                    <ToggleRight className="size-6 text-indigo-400" />
                  ) : (
                    <ToggleLeft className="size-6" />
                  )}
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2">
                {schedule.lastStatus && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor(schedule.lastStatus)}`}>
                    {schedule.lastStatus}
                  </span>
                )}
                <span className="text-[10px] text-zinc-500">
                  {t('scheduleList.runCount', { count: schedule.runCount })}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-zinc-500">
                <div>
                  <span className="text-zinc-400">{t('scheduleList.lastRun')}</span>{' '}
                  {schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleString() : '—'}
                </div>
                <div>
                  <span className="text-zinc-400">{t('scheduleList.nextRun')}</span>{' '}
                  {schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : '—'}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => { setEditingSchedule(schedule); setDialogOpen(true); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
                >
                  {t('common.edit')}
                </button>
                <button
                  onClick={() => handleRun(schedule.id)}
                  disabled={runningId === schedule.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 disabled:opacity-50"
                >
                  <Play className="size-3" />
                  {runningId === schedule.id ? t('scheduleList.running') : t('scheduleList.runNow')}
                </button>
                <button
                  onClick={() => setHistoryId(schedule.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                >
                  <History className="size-3" />
                </button>
                <button
                  onClick={() => handleDelete(schedule.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:border-red-500/50 hover:text-red-400"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateScheduleForm
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingSchedule(null); }}
        schedule={editingSchedule}
        onSuccess={fetchSchedules}
      />

      {historyId && (
        <ScheduleHistory scheduleId={historyId} onClose={() => setHistoryId(null)} />
      )}
    </div>
  );
}
