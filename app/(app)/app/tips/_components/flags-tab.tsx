'use client';

import { AlertTriangle, ShieldCheck, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface ServerTipStats {
  name: string;
  shifts: number;
  totalSales: number;
  totalTips: number;
  avgTipPct: number;
  flagged: boolean;
}

interface FlagsTabProps {
  serverStats: ServerTipStats[];
  populationMean: number;
  populationStdDev: number;
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function diffLabel(val: number, mean: number) {
  const diff = val - mean;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${(diff * 100).toFixed(1)}pp`;
}

export default function FlagsTab({ serverStats, populationMean, populationStdDev }: FlagsTabProps) {
  const flagged = serverStats.filter((s) => s.flagged);
  const threshold = populationMean + 2 * populationStdDev;

  if (serverStats.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-14 text-center">
        <p className="text-muted-foreground font-medium">No server tip data yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Import daily Z reports (text format) to enable tip analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <Card className="bg-muted/40">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">How Flags Work</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 text-sm text-muted-foreground space-y-1">
          <p>
            Each bartender's nightly tip % (tips ÷ sales) is compared against the bar's
            overall distribution. Servers whose <strong className="text-foreground">average
            tip %</strong> sits more than <strong className="text-foreground">2 standard
            deviations</strong> above the mean are flagged as potential anomalies.
          </p>
          <p className="tabular-nums">
            Bar mean: <span className="text-foreground font-medium">{pct(populationMean)}</span>
            {' '}· Std dev: <span className="text-foreground font-medium">{pct(populationStdDev)}</span>
            {' '}· Flag threshold: <span className="text-yellow-400 font-medium">{pct(threshold)}</span>
          </p>
        </CardContent>
      </Card>

      {/* Flagged banner */}
      {flagged.length > 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4">
          <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
          <p className="text-sm font-medium text-yellow-400">
            {flagged.length} bartender{flagged.length > 1 ? 's' : ''} flagged:{' '}
            {flagged.map((s) => s.name).join(', ')}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
          <ShieldCheck className="h-5 w-5 text-green-500 flex-shrink-0" />
          <p className="text-sm font-medium text-green-400">
            No bartenders flagged — all tip percentages within normal range
          </p>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Server</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Shifts</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total Sales</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total Tips</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Avg Tip %</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">vs Bar Avg</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {serverStats.map((s, i) => (
              <tr
                key={s.name}
                className={[
                  i % 2 === 1 ? 'bg-muted/20' : '',
                  s.flagged ? 'bg-yellow-500/5' : '',
                ].join(' ')}
              >
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {s.shifts}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  ${s.totalSales.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-cyan-400">
                  ${s.totalTips.toFixed(2)}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums font-semibold ${s.flagged ? 'text-yellow-400' : ''}`}>
                  {pct(s.avgTipPct)}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums text-xs ${
                  s.avgTipPct > populationMean ? 'text-yellow-500' : 'text-muted-foreground'
                }`}>
                  {diffLabel(s.avgTipPct, populationMean)}
                </td>
                <td className="px-4 py-3 text-center">
                  {s.flagged ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2.5 py-0.5 text-xs font-medium text-yellow-400">
                      <AlertTriangle className="h-3 w-3" />
                      Flagged
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-500">
                      <ShieldCheck className="h-3 w-3" />
                      Normal
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
