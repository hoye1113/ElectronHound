import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock recharts to avoid SVG rendering issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

import PassRateChart from '../components/charts/PassRateChart';
import TaskStatusChart from '../components/charts/TaskStatusChart';
import ExecutionTimeChart from '../components/charts/ExecutionTimeChart';

describe('PassRateChart', () => {
  it('renders without errors', () => {
    const data = [
      { date: '2026-05-27', passRate: 80 },
      { date: '2026-05-28', passRate: 90 },
      { date: '2026-05-29', passRate: 75 },
    ];

    render(<PassRateChart data={data} />);

    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('renders with empty data', () => {
    render(<PassRateChart data={[]} />);

    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });
});

describe('TaskStatusChart', () => {
  it('renders without errors', () => {
    const data = [
      { name: 'completed', value: 10 },
      { name: 'failed', value: 3 },
      { name: 'running', value: 2 },
    ];

    render(<TaskStatusChart data={data} />);

    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('renders with empty data', () => {
    render(<TaskStatusChart data={[]} />);

    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });
});

describe('ExecutionTimeChart', () => {
  it('renders without errors', () => {
    const data = [
      { date: '2026-05-27', avgDuration: 1500 },
      { date: '2026-05-28', avgDuration: 1200 },
      { date: '2026-05-29', avgDuration: 1800 },
    ];

    render(<ExecutionTimeChart data={data} />);

    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('renders with empty data', () => {
    render(<ExecutionTimeChart data={[]} />);

    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });
});
