'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { TrendPoint } from '@/lib/pos/sales-analytics';

const fmtDollar = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`);

// `var(--token)` directly — the tokens in globals.css are colour literals, not
// bare HSL triplets, so hsl(var(--token)) does not parse and renders black.
const tickStyle = { fontSize: 11, fill: 'var(--muted-foreground)' };
const tooltipStyle = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  fontSize: 12,
};

export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No sales in this window.
      </p>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={tickStyle} axisLine={false} tickLine={false}
            tickFormatter={(d: string) => d.slice(5)} />
          <YAxis tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={fmtDollar} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v, n) => [fmtDollar(Number(v) || 0), String(n)]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="revenue" name="Revenue" stroke="var(--primary)"
            strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="margin" name="Margin" stroke="var(--chart-2, #10b981)"
            strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
