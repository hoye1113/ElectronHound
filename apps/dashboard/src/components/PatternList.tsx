import type { FeedbackPattern } from '@eata/shared-types';

interface PatternListProps {
  patterns: FeedbackPattern[];
  maxFrequency: number;
}

export default function PatternList({ patterns, maxFrequency }: PatternListProps) {
  if (patterns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-12">
        <p className="text-sm text-zinc-500">No patterns found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {patterns.map((pattern) => {
        const barWidth = maxFrequency > 0 ? (pattern.frequency / maxFrequency) * 100 : 0;

        return (
          <div
            key={pattern.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition-colors hover:border-zinc-700"
          >
            {/* Header: errorType + frequency */}
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-300 ring-1 ring-red-500/20">
                {pattern.errorType}
              </span>
              <span className="text-sm font-mono text-zinc-400">
                {pattern.frequency}×
              </span>
            </div>

            {/* Frequency bar */}
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all"
                style={{ width: `${barWidth}%` }}
              />
            </div>

            {/* Target description */}
            <p className="mt-3 text-sm text-zinc-300">{pattern.targetDescription}</p>

            {/* Remediation hint */}
            <div className="mt-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3">
              <p className="text-xs text-zinc-400">
                <span className="font-medium text-zinc-300">Fix: </span>
                {pattern.remediationHint}
              </p>
            </div>

            {/* Similarity keywords */}
            {pattern.similarityKeywords.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {pattern.similarityKeywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded bg-zinc-800/60 px-2 py-0.5 text-[11px] text-zinc-500"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            )}

            {/* Last seen */}
            <p className="mt-2 text-[11px] text-zinc-600">
              Last seen: {formatDate(pattern.lastSeen)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
