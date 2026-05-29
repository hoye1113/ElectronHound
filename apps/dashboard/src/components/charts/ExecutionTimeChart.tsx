import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export interface ExecutionTimeChartProps {
  data: Array<{ date: string; avgDuration: number }>;
  className?: string;
}

export default function ExecutionTimeChart({ data, className }: ExecutionTimeChartProps) {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            className="fill-neutral-600 dark:fill-neutral-400"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            className="fill-neutral-600 dark:fill-neutral-400"
            unit="ms"
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: '1px solid #e5e5e5',
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="avgDuration"
            name="Avg Duration"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
