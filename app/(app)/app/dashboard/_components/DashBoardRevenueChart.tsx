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
      // null, not 0: a night with no sales has no rate, and a 0% dot reads as a real reading.
      'Tip %': d.totalSales > 0 ? parseFloat(d.tipPercent.toFixed(1)) : null,
    }));

  return (
    <div
      className={`w-full h-56 min-h-56 ${className}`}
      role="img"
      aria-label={`Sales and tips for the last ${chartData.length} nights. The same figures are listed below the chart.`}
    >
      {/* initialDimension: the container is measured before layout settles, which
          logged "width(-1) and height(-1) should be greater than 0" on every load. */}
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 224 }}>
        <ComposedChart accessibilityLayer={false} data={chartData} margin={{ top: 4, right: 20, left: -10, bottom: 0 }}>
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
            tickFormatter={(v: number) => (v === 0 ? '$0' : `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`)}
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
          {/* The system's chart tokens (verified ≥3:1 in both themes), not loose hex. */}
          <Bar yAxisId="dollars" dataKey="Sales" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false} />
          <Bar yAxisId="dollars" dataKey="Tips" fill="var(--chart-3)" radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false} />
          <Line
            yAxisId="pct"
            type="linear"
            dataKey="Tip %"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--chart-2)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
