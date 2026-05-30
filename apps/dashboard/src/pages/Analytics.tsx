import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  TrendingUp,
  Clock,
  PieChart as PieChartIcon,
  Zap,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../lib/api';

// ── Types ────────────────────────────────────────────────────────────

interface CompletionRateEntry {
  date: string;
  completed: number;
  failed: number;
}

interface AvgDurationEntry {
  date: string;
  avgSeconds: number;
}

interface StatusDistribution {
  completed: number;
  failed: number;
  cancelled: number;
  queued: number;
}

interface TokenUsageEntry {
  date: string;
  tokens: number;
}

interface AnalyticsData {
  completionRate: CompletionRateEntry[];
  avgDuration: AvgDurationEntry[];
  statusDistribution: StatusDistribution;
  tokenUsage: TokenUsageEntry[];
}

// ── Constants ────────────────────────────────────────────────────────

const PIE_COLORS: Record<string, string> = {
  completed: '#22c55e',
  failed: '#ef4444',
  cancelled: '#f59e0b',
  queued: '#6366f1',
};

// ── Helpers ──────────────────────────────────────────────────────────

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ── Main Page ────────────────────────────────────────────────────────

export default function Analytics() {
  const { t } = useTranslation();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.analytics.get(days);
      setData(result);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Transform status distribution for pie chart
  const pieData = data
    ? Object.entries(data.statusDistribution)
        .filter(([, value]) => value > 0)
        .map(([name, value]) => ({ name: t(`analytics.status_${name}`), value }))
    : [];

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('analytics.title')}</h1>
          <p className="mt-1 text-sm text-zinc-400">{t('analytics.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="analytics-days" className="text-sm text-zinc-400">
            {t('analytics.period')}
          </label>
          <select
            id="analytics-days"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          >
            <option value={7}>7 {t('analytics.days')}</option>
            <option value={14}>14 {t('analytics.days')}</option>
            <option value={30}>30 {t('analytics.days')}</option>
            <option value={90}>90 {t('analytics.days')}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="size-6 animate-spin text-zinc-400" />
        </div>
      ) : data ? (
        <div className="space-y-8">
          {/* Task Completion Rate */}
          <ChartCard
            icon={<TrendingUp className="size-4 text-zinc-400" />}
            title={t('analytics.completionRate')}
            subtitle={t('analytics.completionRateDesc')}
          >
            {data.completionRate.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.completionRate}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                      color: '#f4f4f5',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="completed"
                    stroke="#22c55e"
                    strokeWidth={2}
                    name={t('analytics.status_completed')}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="failed"
                    stroke="#ef4444"
                    strokeWidth={2}
                    name={t('analytics.status_failed')}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>

          {/* Average Execution Duration */}
          <ChartCard
            icon={<Clock className="size-4 text-zinc-400" />}
            title={t('analytics.avgDuration')}
            subtitle={t('analytics.avgDurationDesc')}
          >
            {data.avgDuration.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.avgDuration}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: '#a1a1aa', fontSize: 12 }}
                    tickFormatter={(val) => formatSeconds(Number(val))}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                      color: '#f4f4f5',
                    }}
                    formatter={(val) => [formatSeconds(Number(val)), t('analytics.avgDuration')]}
                  />
                  <Bar dataKey="avgSeconds" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>

          {/* Bottom row: Status Distribution + Token Usage */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Status Distribution */}
            <ChartCard
              icon={<PieChartIcon className="size-4 text-zinc-400" />}
              title={t('analytics.statusDistribution')}
              subtitle={t('analytics.statusDistributionDesc')}
            >
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }: { name?: string; percent?: number }) =>
                        `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                    >
                      {pieData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={
                            PIE_COLORS[
                              Object.keys(PIE_COLORS).find((k) =>
                                t(`analytics.status_${k}`) === entry.name
                              ) ?? ''
                            ] ?? '#71717a'
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid #3f3f46',
                        borderRadius: '8px',
                        color: '#f4f4f5',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState />
              )}
            </ChartCard>

            {/* Token Usage */}
            <ChartCard
              icon={<Zap className="size-4 text-zinc-400" />}
              title={t('analytics.tokenUsage')}
              subtitle={t('analytics.tokenUsageDesc')}
            >
              {data.tokenUsage.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.tokenUsage}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                    <YAxis
                      tick={{ fill: '#a1a1aa', fontSize: 12 }}
                      tickFormatter={(val) => formatNumber(Number(val))}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid #3f3f46',
                        borderRadius: '8px',
                        color: '#f4f4f5',
                      }}
                      formatter={(val) => [formatNumber(Number(val)), t('analytics.tokens')]}
                    />
                    <Line
                      type="monotone"
                      dataKey="tokens"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      name={t('analytics.tokens')}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState />
              )}
            </ChartCard>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center p-12">
          <p className="text-sm text-zinc-500">{t('analytics.loadError')}</p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

interface ChartCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

function ChartCard({ icon, title, subtitle, children }: ChartCardProps) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center gap-2.5 mb-1">
        {icon}
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
      </div>
      <p className="text-xs text-zinc-500 mb-4">{subtitle}</p>
      {children}
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center h-[300px]">
      <p className="text-sm text-zinc-500">{t('analytics.noData')}</p>
    </div>
  );
}
