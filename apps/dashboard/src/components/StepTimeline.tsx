import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, Lightbulb, Play, CheckCircle2, AlertCircle } from 'lucide-react';
import type { StepRecord, StepPhase, StepStatus } from '@eata/shared-types';

interface StepTimelineProps {
  steps: StepRecord[];
  currentStepIndex: number;
}

const phaseConfig: Record<StepPhase, { icon: typeof Eye; labelKey: string }> = {
  observe: { icon: Eye, labelKey: 'stepTimeline.phase_observe' },
  plan: { icon: Lightbulb, labelKey: 'stepTimeline.phase_plan' },
  execute: { icon: Play, labelKey: 'stepTimeline.phase_execute' },
  verify: { icon: CheckCircle2, labelKey: 'stepTimeline.phase_verify' },
};

const statusConfig: Record<StepStatus, { labelKey: string; classes: string }> = {
  success: { labelKey: 'stepTimeline.status_pass', classes: 'bg-emerald-500/20 text-emerald-300' },
  retry: { labelKey: 'stepTimeline.status_retry', classes: 'bg-amber-500/20 text-amber-300' },
  failed: { labelKey: 'stepTimeline.status_fail', classes: 'bg-red-500/20 text-red-300' },
  skipped: { labelKey: 'stepTimeline.status_skip', classes: 'bg-zinc-600 text-zinc-400' },
};

const lineColors: Record<StepStatus, string> = {
  success: 'bg-emerald-500/40',
  retry: 'bg-amber-500/40',
  failed: 'bg-red-500/40',
  skipped: 'bg-zinc-600',
};

export default function StepTimeline({ steps, currentStepIndex }: StepTimelineProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [steps.length]);

  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-zinc-800/60">
          <Eye className="size-5 text-zinc-500" />
        </div>
        <p className="text-sm text-zinc-500">{t('stepTimeline.empty')}</p>
        <p className="mt-1 text-xs text-zinc-600">{t('stepTimeline.emptyHint')}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex max-h-[calc(100vh-280px)] flex-col gap-0 overflow-y-auto pr-2"
      role="list"
      aria-label={t('common.stepTimeline')}
    >
      {steps.map((step, index) => {
        const isCurrent = index === currentStepIndex;
        const phase = phaseConfig[step.phase];
        const status = statusConfig[step.status];
        const Icon = phase.icon;
        const isLast = index === steps.length - 1;

        return (
          <div key={step.id ?? index} role="listitem" className="relative flex gap-3">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div
                className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  isCurrent
                    ? 'border-indigo-400 bg-indigo-500/20 text-indigo-300'
                    : step.status === 'success'
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                      : step.status === 'failed'
                        ? 'border-red-500/50 bg-red-500/10 text-red-400'
                        : step.status === 'retry'
                          ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                          : 'border-zinc-600 bg-zinc-800 text-zinc-500'
                }`}
              >
                <Icon className="size-3.5" />
              </div>
              {!isLast && (
                <div className={`h-full w-0.5 ${lineColors[step.status]}`} />
              )}
            </div>

            {/* Step content */}
            <div
              className={`flex-1 rounded-lg border p-3 transition-colors ${
                isCurrent
                  ? 'border-indigo-500/30 bg-indigo-500/5'
                  : 'border-zinc-800/60 bg-zinc-900/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-400">
                    {t('common.stepPrefix')} {index + 1}
                  </span>
                  <span className="text-xs text-zinc-500">·</span>
                  <span className="text-xs font-medium text-zinc-300">
                    {t(phase.labelKey)}
                  </span>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.classes}`}
                >
                  {step.status === 'retry' && (
                    <AlertCircle className="size-3" />
                  )}
                  {t(status.labelKey)}
                </span>
              </div>

              {step.observation && (
                <p className="mt-1.5 line-clamp-2 text-xs text-zinc-400">
                  {step.observation}
                </p>
              )}

              {step.action?.name && (
                <p className="mt-1 text-xs font-mono text-zinc-500">
                  → {step.action.name}
                </p>
              )}

              <div className="mt-1.5 flex items-center gap-3 text-xs text-zinc-600">
                <span>{step.duration}ms</span>
                <span>·</span>
                <span>{formatTimestamp(step.timestamp)}</span>
              </div>

              {isCurrent && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-indigo-400" />
                  </span>
                  <span className="text-xs font-medium text-indigo-400">
                    {t('stepTimeline.running')}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
