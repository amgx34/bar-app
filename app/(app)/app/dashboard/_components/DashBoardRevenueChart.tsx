'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type NightlyData = {
  nightDate: string;
  totalSales: number;
  totalTips: number;
  tipPercent: number;
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(iso: string) {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

interface Props {
  data: NightlyData[];
  className?: string;
}

export default function DashboardRevenueChart({ data, className = '' }: Props) {
  const chartData = [...data]
    .sort((a, b) => a.nightDate.localeCompare(b.nightDate))
    .map((d) => ({
      date: fmtDate(d.nightDate),
      Sales: d.totalSales,
      Tips: d.totalTips,
      'Tip %': parseFloat(d.tipPercent.toFixed(1)),
    }));

  return (
    <div className={`w-full h-56 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 4, right: 20, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="dollars"
            orientation="left"
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}%`}
            domain={[0, (max: number) => Math.ceil(max + 3)]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: 12,
            }}
            formatter={(value, name) => {
              const v = value as number;
              if (name === 'Tip %') return [`${v}%`, name];
              return [`$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, name];
            }}
          />
          <Bar yAxisId="dollars" dataKey="Sales" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={40} />
          <Bar yAxisId="dollars" dataKey="Tips" fill="#22d3ee" radius={[3, 3, 0, 0]} maxBarSize={40} />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="Tip %"
            stroke="#a78bfa"
            strokeWidth={2}
            dot={{ r: 3, fill: '#a78bfa', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
