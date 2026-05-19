import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LogPanel, { type LogEntry } from '../components/LogPanel';

const mockLog = (overrides: Partial<LogEntry> = {}): LogEntry => ({
  timestamp: '2026-05-19T10:00:00Z',
  level: 'info',
  message: 'Task started',
  ...overrides,
});

describe('LogPanel', () => {
  it('renders empty state when no logs', () => {
    render(<LogPanel logs={[]} />);
    expect(screen.getByText('No log entries')).toBeInTheDocument();
  });

  it('renders log message', () => {
    const logs = [mockLog({ message: 'Browser launched' })];
    render(<LogPanel logs={logs} />);
    expect(screen.getByText('Browser launched')).toBeInTheDocument();
  });

  it('renders info level with correct label', () => {
    const logs = [mockLog({ level: 'info' })];
    render(<LogPanel logs={logs} />);
    expect(screen.getByText('INFO')).toBeInTheDocument();
  });

  it('renders warn level with correct label', () => {
    const logs = [mockLog({ level: 'warn' })];
    render(<LogPanel logs={logs} />);
    expect(screen.getByText('WARN')).toBeInTheDocument();
  });

  it('renders error level with correct label', () => {
    const logs = [mockLog({ level: 'error' })];
    render(<LogPanel logs={logs} />);
    expect(screen.getByText('ERROR')).toBeInTheDocument();
  });

  it('renders debug level with correct label', () => {
    const logs = [mockLog({ level: 'debug' })];
    render(<LogPanel logs={logs} />);
    expect(screen.getByText('DBG')).toBeInTheDocument();
  });

  it('renders multiple log entries', () => {
    const logs = [
      mockLog({ message: 'Step 1 started' }),
      mockLog({ message: 'Step 1 completed' }),
      mockLog({ message: 'Step 2 started' }),
    ];
    render(<LogPanel logs={logs} />);
    expect(screen.getByText('Step 1 started')).toBeInTheDocument();
    expect(screen.getByText('Step 1 completed')).toBeInTheDocument();
    expect(screen.getByText('Step 2 started')).toBeInTheDocument();
  });

  it('renders timestamp', () => {
    const logs = [mockLog({ timestamp: '2026-05-19T14:30:45Z' })];
    const { container } = render(<LogPanel logs={logs} />);
    // Timestamp is rendered in local timezone, so check that a time span exists
    const timeSpan = container.querySelector('.text-zinc-600');
    expect(timeSpan).toBeInTheDocument();
    expect(timeSpan?.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('uses monospace font for log content', () => {
    const logs = [mockLog({ message: 'Test log' })];
    const { container } = render(<LogPanel logs={logs} />);
    const logContainer = container.querySelector('[role="log"]');
    expect(logContainer).toHaveClass('font-mono');
  });

  it('has correct aria attributes for accessibility', () => {
    const logs = [mockLog()];
    const { container } = render(<LogPanel logs={logs} />);
    const logContainer = container.querySelector('[role="log"]');
    expect(logContainer).toHaveAttribute('aria-label', 'Task log output');
    expect(logContainer).toHaveAttribute('aria-live', 'polite');
  });
});
