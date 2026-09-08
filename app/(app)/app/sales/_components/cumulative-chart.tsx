'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CumulativePoint } from '@/lib/pos/cumulative';

const fmt = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`);

const tickStyle = { fontSize: 11, fill: 'var(--muted-foreground)' };

/**
 * The night as a running total.
 *
 * Answers the question the bar chart cannot: not "when was it busy" but "how is
 * this going". The line stops at the last hour that traded — see
 * lib/pos/cumulative.ts — so a night in progress reads as unfinished rather
 * than as a bar that died at 10pm.
 *
 * `interval="preserveStartEnd"` rather than a fixed tick count: on a 360px
 * phone a fixed interval either collides the labels or drops the two that
 * matter, and Recharts already knows how much room it has.
 */
export function CumulativeChart({ points }: { points: CumulativePoint[] }) {
  if (points.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nothing has been rung up yet tonight.
      </p>
    );
  }

  return (
    <div className="h-48 w-full sm:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="cumulative-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={tickStyle}
            interval="preserveStartEnd"
            minTickGap={24}
            tickLine={false}
            axisLine={false}
          />
          <YAxis tick={tickStyle} tickFormatter={fmt} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            formatter={(v) => [`$${(Number(v) || 0).toFixed(2)}`, 'Taken so far']}
            contentStyle={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#cumulative-fill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
