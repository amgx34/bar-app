'use client';

import {
  ComposedChart,
  Area,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export type NightlyPoint = { date: string; tipPct: number; sales: number };

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(iso: string) {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

interface Props {
  data: NightlyPoint[];
  average: number;
}

export default function NightlyTipChart({ data, average }: Props) {
  const chartData = [...data]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: fmtDate(d.date),
      'Tip %': parseFloat((d.tipPct * 100).toFixed(1)),
    }));

  const avgPct = parseFloat((average * 100).toFixed(1));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={{ top: 8, right: 20, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="tipAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v}%`}
          domain={['auto', 'auto']}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: 12,
          }}
          formatter={(value) => [`${value as number}%`, 'Tip %']}
        />
        <ReferenceLine
          y={avgPct}
          stroke="var(--muted-foreground)"
          strokeDasharray="5 4"
          strokeWidth={1}
          label={{
            value: `avg ${avgPct}%`,
            position: 'insideTopRight',
            fontSize: 10,
            fill: 'var(--muted-foreground)',
          }}
        />
        <Area
          type="monotone"
          dataKey="Tip %"
          stroke="#a78bfa"
          strokeWidth={2}
          fill="url(#tipAreaGradient)"
          dot={false}
          activeDot={{ r: 4, fill: '#a78bfa' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
