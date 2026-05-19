import { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

interface LogPanelProps {
  logs: LogEntry[];
}

const levelColors: Record<LogEntry['level'], string> = {
  info: 'text-blue-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
  debug: 'text-zinc-500',
};

const levelLabels: Record<LogEntry['level'], string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DBG',
};

export default function LogPanel({ logs }: LogPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs.length]);

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Terminal className="mb-2 size-6 text-zinc-600" />
        <p className="text-sm text-zinc-500">No log entries</p>
        <p className="mt-1 text-xs text-zinc-600">Logs will appear here as the task runs</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="max-h-64 overflow-y-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs"
      role="log"
      aria-label="Task log output"
      aria-live="polite"
    >
      {logs.map((log, index) => (
        <div
          key={index}
          className="flex gap-2 leading-relaxed"
        >
          <span className="shrink-0 text-zinc-600">
            {formatTime(log.timestamp)}
          </span>
          <span className={`shrink-0 font-semibold ${levelColors[log.level]}`}>
            {levelLabels[log.level]}
          </span>
          <span className="break-all text-zinc-300">{log.message}</span>
        </div>
      ))}
    </div>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
