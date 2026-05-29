import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Plus, X, Send, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { api } from '../lib/api';
import type { NotificationConfig, NotificationLogEntry } from '../lib/api';

const AVAILABLE_EVENTS = [
  'task.completed',
  'task.failed',
  'task.created',
  'batch.completed',
  'batch.failed',
];

export default function NotificationSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<NotificationConfig | null>(null);
  const [log, setLog] = useState<NotificationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [configRes, logRes] = await Promise.all([
        api.notifications.getConfig(),
        api.notifications.history(),
      ]);
      setConfig(configRes);
      setLog(logRes.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('notifications.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addWebhook = () => {
    if (!newUrl.trim() || !config) return;
    const updated = { ...config, webhookUrls: [...config.webhookUrls, newUrl.trim()] };
    setConfig(updated);
    setNewUrl('');
  };

  const removeWebhook = (index: number) => {
    if (!config) return;
    const updated = {
      ...config,
      webhookUrls: config.webhookUrls.filter((_, i) => i !== index),
    };
    setConfig(updated);
  };

  const toggleEvent = (eventType: string) => {
    if (!config) return;
    const events = config.eventTypes.includes(eventType)
      ? config.eventTypes.filter((e) => e !== eventType)
      : [...config.eventTypes, eventType];
    setConfig({ ...config, eventTypes: events });
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.notifications.updateConfig({
        webhookUrls: config.webhookUrls,
        sseEnabled: config.sseEnabled,
        eventTypes: config.eventTypes,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.notifications.test();
      setTestResult(result);
      // Refresh log after test
      const logRes = await api.notifications.history();
      setLog(logRes.data);
    } catch (err: unknown) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : t('notifications.testFailed') });
    } finally {
      setTesting(false);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-emerald-500/15 text-emerald-400';
      case 'failed':
        return 'bg-red-500/15 text-red-400';
      default:
        return 'bg-yellow-500/15 text-yellow-400';
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <AlertTriangle className="size-5 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-zinc-100">
          <Bell className="size-6 text-indigo-400" />
          {t('notifications.title')}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">{t('notifications.subtitle')}</p>
      </div>

      {/* Webhook URLs */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-100">
          {t('notifications.webhookSection')}
        </h2>
        <div className="mb-3 flex gap-2">
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder={t('notifications.webhookPlaceholder')}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            onKeyDown={(e) => e.key === 'Enter' && addWebhook()}
          />
          <button
            onClick={addWebhook}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <Plus className="size-4" />
            {t('notifications.addWebhook')}
          </button>
        </div>
        {config?.webhookUrls.length === 0 && (
          <p className="text-xs text-zinc-500">No webhook URLs configured</p>
        )}
        <div className="flex flex-wrap gap-2">
          {config?.webhookUrls.map((url, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300"
            >
              {url}
              <button
                onClick={() => removeWebhook(i)}
                className="rounded-full p-0.5 hover:bg-zinc-700 hover:text-zinc-100"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* SSE Toggle */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-100">
          {t('notifications.sseSection')}
        </h2>
        <label className="flex cursor-pointer items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={config?.sseEnabled ?? false}
            onClick={() => config && setConfig({ ...config, sseEnabled: !config.sseEnabled })}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              config?.sseEnabled ? 'bg-indigo-600' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`inline-block size-4 rounded-full bg-white transition-transform ${
                config?.sseEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span className="text-sm text-zinc-300">{t('notifications.sseEnabled')}</span>
        </label>
      </div>

      {/* Event Types */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-100">
          {t('notifications.eventSection')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_EVENTS.map((eventType) => {
            const selected = config?.eventTypes.includes(eventType) ?? false;
            return (
              <button
                key={eventType}
                onClick={() => toggleEvent(eventType)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  selected
                    ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/50'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'
                }`}
              >
                {t(`notifications.event_${eventType}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? t('common.loading') : t('notifications.saveConfig')}
        </button>
        <button
          onClick={sendTest}
          disabled={testing}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {testing ? (
            <div className="size-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          ) : (
            <Send className="size-4" />
          )}
          {t('notifications.sendTest')}
        </button>
      </div>

      {/* Test Result */}
      {testResult && (
        <div
          className={`flex items-center gap-3 rounded-xl border p-4 ${
            testResult.success
              ? 'border-emerald-500/30 bg-emerald-500/10'
              : 'border-red-500/30 bg-red-500/10'
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="size-5 text-emerald-400" />
          ) : (
            <AlertTriangle className="size-5 text-red-400" />
          )}
          <p className={`text-sm ${testResult.success ? 'text-emerald-300' : 'text-red-300'}`}>
            {testResult.message}
          </p>
        </div>
      )}

      {/* Notification Log */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-100">
          {t('notifications.logSection')}
        </h2>
        {log.length === 0 ? (
          <p className="text-center text-sm text-zinc-500">{t('notifications.logEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-4">Time</th>
                  <th className="pb-2 pr-4">Event</th>
                  <th className="pb-2 pr-4">Channel</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {log.map((entry) => (
                  <tr key={entry.id} className="text-zinc-300">
                    <td className="py-2 pr-4 text-xs text-zinc-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" />
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{entry.eventType}</td>
                    <td className="py-2 pr-4 text-xs">{entry.channel}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(entry.status)}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate py-2 text-xs text-zinc-500">
                      {entry.target ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
