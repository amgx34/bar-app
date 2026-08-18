'use client';

import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import type { MonthlyFinancials } from '../actions';

const fmtDollar = (v: number) =>
  v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`;

const tooltipStyle = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  fontSize: 12,
};

// Colours come straight from the design tokens as `var(--token)`.
//
// They were previously written as `hsl(var(--token))`, which was invalid: the
// tokens in globals.css are colour LITERALS (#1E40AF today, oklch(...) before
// the redesign), not the bare HSL triplets that syntax expects. `hsl(#1E40AF)`
// does not parse, so every bar, line, gridline and axis label fell back to the
// SVG default fill — black. Enabling dark mode is what made it obvious, but the
// charts had been rendering black since well before that.
//
// If the palette ever moves back to HSL triplets, these must change together.
const tickStyle = { fontSize: 11, fill: 'var(--muted-foreground)' };

export function MonthlyChart({ data }: { data: MonthlyFinancials[] }) {
  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
          <YAxis tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={fmtDollar} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => {
              const v = value as number;
              return [`$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="revenue"     name="Revenue"      fill="var(--primary)" radius={[3,3,0,0]} maxBarSize={36} />
          <Bar dataKey="cogs"        name="COGS"         fill="#f59e0b"              radius={[3,3,0,0]} maxBarSize={36} />
          <Bar dataKey="labor"       name="Labor"        fill="#e11d48"              radius={[3,3,0,0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MarginChart({ data }: { data: MonthlyFinancials[] }) {
  const chartData = data.map((d) => ({
    month: d.month,
    'Gross Margin %': d.revenue > 0 ? +((d.grossProfit / d.revenue) * 100).toFixed(1) : 0,
    'Labor %':        d.revenue > 0 ? +((d.labor       / d.revenue) * 100).toFixed(1) : 0,
  }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
          <YAxis tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [`${(value as number).toFixed(1)}%`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="Gross Margin %" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3, fill: 'var(--primary)', strokeWidth: 0 }} />
          <Line type="monotone" dataKey="Labor %"        stroke="#e11d48"              strokeWidth={2} dot={{ r: 3, fill: '#e11d48',              strokeWidth: 0 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
