'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Daypart } from '@/lib/pos/daypart';

/**
 * The night's trade, hour by hour.
 *
 * Hours that have not traded are dropped from the series rather than plotted
 * at zero. A zero-height bar says "this hour took nothing"; an hour the bar was
 * shut, or an hour that has not happened yet on a night still in progress, is a
 * different fact and must not draw the same mark. The axis still spans the
 * whole night, so the shape of the evening stays readable.
 */
export function HourlyCurve({ daypart }: { daypart: Daypart }) {
  const data = daypart.hours.map((h) => ({
    label: h.label,
    // null, not 0 — Recharts leaves a gap for null and draws a bar for 0.
    net: h.traded ? h.netSales : null,
    peak: daypart.peak?.hour === h.hour,
  }));

  return (
    <div className="h-48 w-full sm:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {/*
            preserveStartEnd + a minimum gap, not a fixed interval={2}: a fixed
            count that reads well at desktop width collides into an unreadable
            smear at 360px, and the hours that get dropped are chosen by
            arithmetic rather than by what fits. Recharts already knows the
            width.
          */}
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            interval="preserveStartEnd"
            minTickGap={20}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            tickFormatter={(v: number) => `$${Math.round(v / 100) / 10}k`}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          {/*
            A touch device has no hover, so the tooltip only appears on tap and
            only while the finger is down. `trigger="click"` makes a tap select
            the bar and keep it selected, which is the behaviour a thumb
            expects; the cursor highlight makes it obvious which bar is being
            read.
          */}
          <Tooltip
            trigger="click"
            formatter={(v) => [`$${(Number(v) || 0).toFixed(2)}`, 'Net sales']}
            cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
            contentStyle={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: 12,
            }}
          />
          <Bar dataKey="net" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell
                key={i}
                className={d.peak ? 'fill-primary' : 'fill-primary/40'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
