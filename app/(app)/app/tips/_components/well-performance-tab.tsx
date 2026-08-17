'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAvailableWellDates, getWellDaySales, WellDaySales } from '../actions';
import WellSettingsDialog, {
  WellConfig,
  WellSettings,
  DEFAULT_WELL_COUNT,
  buildDefaultWells,
} from './well-settings-dialog';

// ── localStorage helpers ──────────────────────────────────────────────────────

const SETTINGS_KEY = 'well-settings';
const assignmentKey = (date: string) => `well-assignments-${date}`;

function loadSettings(): WellSettings {
  if (typeof window === 'undefined') return { count: DEFAULT_WELL_COUNT, wells: buildDefaultWells(DEFAULT_WELL_COUNT) };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as WellSettings;
  } catch {}
  return { count: DEFAULT_WELL_COUNT, wells: buildDefaultWells(DEFAULT_WELL_COUNT) };
}

function saveSettings(s: WellSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function loadAssignments(date: string): Record<number, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(assignmentKey(date));
    if (raw) return JSON.parse(raw) as Record<number, string>;
  } catch {}
  return {};
}

function saveAssignments(date: string, a: Record<number, string>) {
  localStorage.setItem(assignmentKey(date), JSON.stringify(a));
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function toLocalDateStr(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function fmtDate(iso: string): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(iso + 'T00:00:00');
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ── Performance helpers ───────────────────────────────────────────────────────

function performanceColor(ratio: number) {
  if (ratio >= 1.0) return 'text-primary';
  if (ratio >= 0.85) return 'text-amber-700 dark:text-amber-300';
  return 'text-red-700 dark:text-red-300';
}

function PerformanceIcon({ ratio }: { ratio: number }) {
  if (ratio >= 1.0) return <TrendingUp className="h-3.5 w-3.5" />;
  if (ratio >= 0.85) return <Minus className="h-3.5 w-3.5" />;
  return <TrendingDown className="h-3.5 w-3.5" />;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function WellPerformanceTab() {
  const [settings, setSettings] = useState<WellSettings>({ count: DEFAULT_WELL_COUNT, wells: buildDefaultWells(DEFAULT_WELL_COUNT) });
  const [showSettings, setShowSettings] = useState(false);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(toLocalDateStr(new Date()));
  const [daySales, setDaySales] = useState<WellDaySales | null>(null);
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load settings + dates on mount
  useEffect(() => {
    setSettings(loadSettings());
    getAvailableWellDates().then((dates) => {
      setAvailableDates(dates);
      if (dates.length > 0) {
        setSelectedDate(dates[0]); // most recent
      }
    });
  }, []);

  // Load day data + assignments when date changes
  useEffect(() => {
    setIsLoading(true);
    setDaySales(null);
    setAssignments(loadAssignments(selectedDate));
    getWellDaySales(selectedDate).then((data) => {
      setDaySales(data);
      setIsLoading(false);
    });
  }, [selectedDate]);

  const handleSaveSettings = useCallback((next: WellSettings) => {
    setSettings(next);
    saveSettings(next);
    setShowSettings(false);
  }, []);

  const handleAssign = (wellId: number, name: string) => {
    const next = { ...assignments, [wellId]: name };
    setAssignments(next);
    saveAssignments(selectedDate, next);
  };

  const navigateDate = (dir: 'prev' | 'next') => {
    if (availableDates.length === 0) return;
    const idx = availableDates.indexOf(selectedDate);
    if (dir === 'next' && idx > 0) setSelectedDate(availableDates[idx - 1]);
    if (dir === 'prev' && idx < availableDates.length - 1) setSelectedDate(availableDates[idx + 1]);
  };

  // Compute well metrics
  const wells = settings.wells.slice(0, settings.count);
  const totalWeight = wells.reduce((s, w) => s + w.weight, 0);
  const totalSales = daySales?.totalSales ?? 0;

  const assignedNames = new Set(Object.values(assignments).filter(Boolean));

  const wellMetrics = wells.map((w) => {
    const expectedShare = totalWeight > 0 ? w.weight / totalWeight : 0;
    const expectedSales = expectedShare * totalSales;
    const bartender = assignments[w.id] ?? '';
    const serverData = daySales?.servers.find(
      (s) => s.name.toLowerCase() === bartender.toLowerCase()
    );
    const actualSales = serverData?.totalSales ?? null;
    const ratio = actualSales !== null && expectedSales > 0 ? actualSales / expectedSales : null;
    return { well: w, expectedShare, expectedSales, bartender, actualSales, ratio };
  });

  // Servers in the Z report not assigned to any well
  const unassignedServers = (daySales?.servers ?? []).filter(
    (s) => !assignedNames.has(s.name)
  );

  const dateIdx = availableDates.indexOf(selectedDate);
  const canGoPrev = dateIdx < availableDates.length - 1;
  const canGoNext = dateIdx > 0;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        {/* Date navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => navigateDate('prev')} disabled={!canGoPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[200px] text-center">
            {fmtDate(selectedDate)}
          </span>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => navigateDate('next')} disabled={!canGoNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Settings button */}
        <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
          <Settings className="h-4 w-4 mr-1.5" />
          Options
        </Button>
      </div>

      {/* Summary bar */}
      {daySales && (
        <div className="rounded-xl border bg-muted/30 px-4 py-3 flex items-center gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Total Sales</span>
            <span className="ml-2 font-semibold tabular-nums">${daySales.totalSales.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Total Tips</span>
            <span className="ml-2 font-semibold tabular-nums text-cyan-700 dark:text-cyan-300">${daySales.totalTips.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Wells</span>
            <span className="ml-2 font-semibold">{settings.count}</span>
          </div>
        </div>
      )}

      {/* No data state */}
      {!isLoading && !daySales && (
        <div className="rounded-xl border border-dashed py-14 text-center">
          <p className="text-muted-foreground font-medium">No Z report data for {fmtDate(selectedDate)}</p>
          <p className="text-sm text-muted-foreground mt-1">Import a Z report to see well performance.</p>
        </div>
      )}

      {/* Well grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {wellMetrics.map(({ well, expectedSales, bartender, actualSales, ratio }) => (
          <div
            key={well.id}
            className="rounded-xl border bg-card p-4 space-y-3"
          >
            {/* Well header */}
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{well.name}</span>
              <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                Weight {well.weight}
              </span>
            </div>

            {/* Bartender input */}
            <div>
              <input
                list={`servers-${well.id}`}
                value={bartender}
                onChange={(e) => handleAssign(well.id, e.target.value)}
                placeholder="Assign bartender…"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {daySales && (
                <datalist id={`servers-${well.id}`}>
                  {daySales.servers.map((s) => (
                    <option key={s.name} value={s.name} />
                  ))}
                </datalist>
              )}
            </div>

            {/* Sales comparison */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Expected</span>
                <span className="tabular-nums">${expectedSales.toFixed(2)}</span>
              </div>

              {actualSales !== null ? (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Actual</span>
                    <span className={`tabular-nums font-medium ${ratio !== null ? performanceColor(ratio) : ''}`}>
                      ${actualSales.toFixed(2)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  {ratio !== null && (
                    <div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            ratio >= 1.0 ? 'bg-primary' : ratio >= 0.85 ? 'bg-amber-400' : 'bg-red-400'
                          }`}
                          style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                        />
                      </div>
                      <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${performanceColor(ratio)}`}>
                        <PerformanceIcon ratio={ratio} />
                        {(ratio * 100).toFixed(1)}% of target
                      </div>
                    </div>
                  )}
                </>
              ) : (
                bartender && daySales ? (
                  <p className="text-xs text-muted-foreground italic">No sales data for {bartender}</p>
                ) : null
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Unassigned servers from the Z report */}
      {unassignedServers.length > 0 && (
        <div className="rounded-xl border p-4 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Not assigned to a well</p>
          <div className="flex flex-wrap gap-2">
            {unassignedServers.map((s) => (
              <span key={s.name} className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1 text-sm">
                {s.name}
                <span className="text-muted-foreground tabular-nums">${s.totalSales.toFixed(2)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Settings dialog */}
      {showSettings && (
        <WellSettingsDialog
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
