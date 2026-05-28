import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Database,
  Cpu,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { api, type HealthResponse } from '../lib/api';

const REFRESH_INTERVAL = 30_000;

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remainingMinutes}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

// ─── Status Indicator ───────────────────────────────────────────────────────

function StatusDot({ status }: { status: 'ok' | 'degraded' | 'error' | string }) {
  const color =
    status === 'ok'
      ? 'bg-emerald-500'
      : status === 'degraded'
        ? 'bg-amber-500'
        : 'bg-red-500';
  return <span className={`inline-block size-2.5 rounded-full ${color}`} />;
}

// ─── Health Card ─────────────────────────────────────────────────────────────

interface HealthCardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function HealthCard({ title, icon, children }: HealthCardProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-zinc-800">
          {icon}
        </div>
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function SystemHealth() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await api.health.check();
      setHealth(data);
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError(t('systemHealth.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchHealth();
    const timer = setInterval(fetchHealth, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-zinc-500">{t('systemHealth.loading')}</p>
        </div>
      </div>
    );
  }

  if (error && !health) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <XCircle className="mb-3 size-10 text-red-500" />
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={fetchHealth}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
        >
          <RefreshCw className="size-4" />
          {t('common.retry', 'Retry')}
        </button>
      </div>
    );
  }

  const statusIcon =
    health?.status === 'ok' ? (
      <CheckCircle2 className="size-5 text-emerald-400" />
    ) : health?.status === 'degraded' ? (
      <AlertTriangle className="size-5 text-amber-400" />
    ) : (
      <XCircle className="size-5 text-red-400" />
    );

  const statusLabel =
    health?.status === 'ok'
      ? t('systemHealth.status_ok')
      : health?.status === 'degraded'
        ? t('systemHealth.status_degraded')
        : t('systemHealth.status_error');

  const statusBg =
    health?.status === 'ok'
      ? 'border-emerald-500/30 bg-emerald-500/10'
      : health?.status === 'degraded'
        ? 'border-amber-500/30 bg-amber-500/10'
        : 'border-red-500/30 bg-red-500/10';

  const statusText =
    health?.status === 'ok'
      ? 'text-emerald-300'
      : health?.status === 'degraded'
        ? 'text-amber-300'
        : 'text-red-300';

  return (
    <div className="mx-auto max-w-3xl p-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            {t('systemHealth.title')}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">{t('systemHealth.subtitle')}</p>
        </div>
        <button
          onClick={fetchHealth}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Overall status */}
      {health && (
        <div className={`mb-6 rounded-xl border p-5 ${statusBg}`}>
          <div className="flex items-center gap-3">
            {statusIcon}
            <div>
              <p className={`text-sm font-semibold ${statusText}`}>
                {t('systemHealth.overallStatus')}: {statusLabel}
              </p>
              {lastUpdated && (
                <p className="mt-0.5 text-xs text-zinc-500">
                  {t('systemHealth.lastUpdated')}: {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cards grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Database */}
        <HealthCard
          title={t('systemHealth.database')}
          icon={<Database className="size-4 text-zinc-400" />}
        >
          <div className="flex items-center gap-2.5">
            <StatusDot status={health?.checks.database.status === 'ok' ? 'ok' : 'error'} />
            <span className="text-sm text-zinc-300">
              {health?.checks.database.status === 'ok'
                ? t('systemHealth.dbStatus_ok')
                : t('systemHealth.dbStatus_error')}
            </span>
          </div>
          {health?.checks.database.message && (
            <p className="mt-2 text-xs text-zinc-500">{health.checks.database.message}</p>
          )}
        </HealthCard>

        {/* Worker Pool */}
        <HealthCard
          title={t('systemHealth.workerPool')}
          icon={<Cpu className="size-4 text-zinc-400" />}
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">{t('systemHealth.running')}</span>
              <span className="text-sm font-semibold text-zinc-100">
                {health?.checks.workerPool.running ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">{t('systemHealth.queued')}</span>
              <span className="text-sm font-semibold text-zinc-100">
                {health?.checks.workerPool.queued ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">{t('systemHealth.maxWorkers')}</span>
              <span className="text-sm font-semibold text-zinc-100">
                {health?.checks.workerPool.maxWorkers ?? 0}
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{
                    width: `${
                      health?.checks.workerPool.maxWorkers
                        ? Math.min(
                            100,
                            (health.checks.workerPool.running / health.checks.workerPool.maxWorkers) * 100,
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        </HealthCard>

        {/* Uptime */}
        <HealthCard
          title={t('systemHealth.uptime')}
          icon={<Clock className="size-4 text-zinc-400" />}
        >
          <p className="text-2xl font-bold text-zinc-100">
            {health ? formatUptime(health.uptime) : '--'}
          </p>
        </HealthCard>

        {/* Auto-refresh indicator */}
        <HealthCard
          title={t('systemHealth.autoRefreshTitle', 'Auto Refresh')}
          icon={<Activity className="size-4 text-zinc-400" />}
        >
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs text-zinc-400">{t('systemHealth.autoRefresh')}</span>
          </div>
          {health?.timestamp && (
            <p className="mt-2 text-xs text-zinc-600">
              Server: {formatTimestamp(health.timestamp)}
            </p>
          )}
        </HealthCard>
      </div>
    </div>
  );
}
