'use client';

import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export type WeeklyPoint = { weekLabel: string; sales: number; tips: number };

interface Props {
  data: WeeklyPoint[];
}

function fmtDollar(v: number) {
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export default function WeeklyTrendChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="weekLabel"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmtDollar}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: 12,
          }}
          formatter={(value, name) => [
            `$${(value as number).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
            name,
          ]}
        />
        <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="sales" name="Sales" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={40} />
        <Bar dataKey="tips" name="Tips" fill="#22d3ee" radius={[3, 3, 0, 0]} maxBarSize={40} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
