'use client';

import { useRef, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Everything about how barbacks are paid out of the nightly pool.
 *
 * These settings arrived one at a time and each took a slab of the Tip & Pay
 * tab, so the screen read as several unrelated controls that happen to say
 * "barback" — while the thing an operator actually wants to answer, "what do my
 * barbacks make", was not visible anywhere. They are one arrangement and they
 * belong on one surface.
 *
 * What is NOT here: whether an individual barback is on tips or a flat wage.
 * That is `employees.pay_type`, a fact about a person rather than about the
 * bar, and it stays on the employee dialog next to their rate.
 */
export type BarbackConfig = {
  /** The flat cut, and the fallback for any headcount no tier covers. */
  barback_tip_pct: number;
  barback_split_method: 'hours' | 'equal';
  barback_tiers_enabled: boolean;
  barback_tip_tiers: Array<{ minCount: number; pct: number }>;
};

/** The span of cuts the tiers can produce, for the collapsed summary line. */
function tierRange(cfg: BarbackConfig): { low: number; high: number } | null {
  const rows = cfg.barback_tip_tiers.filter((t) => Number.isFinite(t.pct));
  if (!cfg.barback_tiers_enabled || rows.length === 0) return null;
  const pcts = rows.map((t) => t.pct);
  return { low: Math.min(...pcts), high: Math.max(...pcts) };
}

/**
 * The arrangement in one line, for the collapsed row on the settings tab.
 *
 * A settings row that collapses to a button and nothing else makes people open
 * the dialog to find out what they already chose, so the summary carries the
 * actual numbers.
 */
export function describeBarbackConfig(cfg: BarbackConfig): string {
  const divided = cfg.barback_split_method === 'hours' ? 'split by hours' : 'split equally';
  const range = tierRange(cfg);
  if (!range) return `${cfg.barback_tip_pct}% of tips · ${divided}`;
  return range.low === range.high
    ? `Tiered · ${range.high}% of tips · ${divided}`
    : `Tiered · ${range.low}–${range.high}% of tips · ${divided}`;
}

// ── Custom drag slider (no native input quirks on mobile) ────────────────────

function DragSlider({
  value, min, max, step = 1, disabled, onChange, color = '#f59e0b',
}: {
  value: number; min: number; max: number; step?: number;
  disabled?: boolean; onChange: (v: number) => void; color?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = ((value - min) / (max - min)) * 100;

  const resolve = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const { left, width } = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - left) / width));
    const raw   = min + ratio * (max - min);
    onChange(Math.max(min, Math.min(max, Math.round(raw / step) * step)));
  }, [min, max, step, onChange]);

  function onMouseDown(e: React.MouseEvent) {
    if (disabled) return;
    e.preventDefault();
    resolve(e.clientX);
    const move = (ev: MouseEvent) => resolve(ev.clientX);
    const up   = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  function onTouchStart(e: React.TouchEvent) {
    if (disabled) return;
    resolve(e.touches[0].clientX);
    const move = (ev: TouchEvent) => resolve(ev.touches[0].clientX);
    const end  = () => { document.removeEventListener('touchmove', move); document.removeEventListener('touchend', end); };
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', end);
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={disabled ? -1 : 0}
      className={`relative h-8 flex items-center ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   onChange(Math.min(max, value + step));
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') onChange(Math.max(min, value - step));
      }}
    >
      {/* Track fill */}
      <div className="absolute inset-x-0 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-none" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      {/* Thumb — centered exactly on the fill edge */}
      <div
        className="absolute h-5 w-5 rounded-full border-2 border-white shadow-md transition-none z-10"
        style={{ left: `${pct}%`, transform: 'translateX(-50%)', backgroundColor: color }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  saving: boolean;
  value: BarbackConfig;
  /** Edits are live — the parent owns the draft, as it does for every other field. */
  onChange: (next: BarbackConfig) => void;
  /** Persists the whole Tip &amp; Pay form, so this dialog saves on its own. */
  onSave: () => Promise<void>;
}

export function BarbackSettingsDialog({
  open, onOpenChange, canEdit, saving, value, onChange, onSave,
}: Props) {
  const bartenderPool = 100 - value.barback_tip_pct;
  const tiers = value.barback_tip_tiers;
  const divided = value.barback_split_method === 'hours'
    ? 'split between them by hours worked'
    : 'split equally between them';

  function set<K extends keyof BarbackConfig>(key: K, v: BarbackConfig[K]) {
    onChange({ ...value, [key]: v });
  }

  function setTier(index: number, patch: Partial<{ minCount: number; pct: number }>) {
    set('barback_tip_tiers', tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function addTier() {
    // One more barback than the highest row already covers, so a new row is
    // always reachable — two rows for the same headcount would mean one of them
    // silently never applies.
    const nextCount = tiers.reduce((max, t) => Math.max(max, t.minCount), 0) + 1;
    set('barback_tip_tiers', [...tiers, { minCount: nextCount, pct: value.barback_tip_pct }]);
  }

  function toggleTiers(on: boolean) {
    // Turning tiers on must not move anybody's pay by itself. Seeding the first
    // row from the flat cut means the night pays exactly what it paid before,
    // until the operator deliberately changes a number.
    if (on && tiers.length === 0) {
      onChange({
        ...value,
        barback_tiers_enabled: true,
        barback_tip_tiers: [{ minCount: 1, pct: value.barback_tip_pct }],
      });
      return;
    }
    set('barback_tiers_enabled', on);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Barback Tip Share</DialogTitle>
          <DialogDescription>
            What barbacks take out of the nightly tip pool, and how it is divided
            between them. Their hourly wage is set per employee.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Flat cut */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>
                {value.barback_tiers_enabled ? 'Default share of tip pool' : 'Barback share of tip pool'}
              </Label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={50}
                  disabled={!canEdit}
                  value={value.barback_tip_pct}
                  onChange={(e) => set('barback_tip_pct', Math.min(50, Math.max(0, Number(e.target.value))))}
                  className="w-14 h-7 rounded-md border border-input bg-background px-2 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>

            <DragSlider
              value={value.barback_tip_pct}
              min={0}
              max={50}
              step={1}
              disabled={!canEdit}
              onChange={(v) => set('barback_tip_pct', v)}
              color="#f59e0b"
            />

            {/* Visual split bar */}
            <div>
              <div className="h-3 rounded-full overflow-hidden flex">
                <div className="bg-primary h-full transition-all duration-150" style={{ width: `${bartenderPool}%` }} />
                <div className="bg-amber-400 h-full transition-all duration-150" style={{ width: `${value.barback_tip_pct}%` }} />
              </div>
              <div className="flex justify-between text-xs mt-1.5">
                <span className="text-primary font-semibold">Bartenders — {bartenderPool}%</span>
                <span className="text-amber-500 font-semibold">Barbacks — {value.barback_tip_pct}%</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {value.barback_tiers_enabled
                ? `Used on any night the tiers below do not cover. Barbacks receive ${value.barback_tip_pct}% of the tip pool, ${divided}.`
                : `Each night, barbacks collectively receive ${value.barback_tip_pct}% of the tip pool, ${divided}. The remaining ${bartenderPool}% goes to the bartender pool, distributed by hours worked.`}
            </p>
          </div>

          {/* Headcount tiers */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Label htmlFor="barback-tiers" className="text-sm">A bigger cut when more barbacks work</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  One barback covering the bar alone is not the same job as one of
                  three. Set the cut per headcount and the right one is picked each
                  night, from who actually worked.
                </p>
              </div>
              <button
                id="barback-tiers"
                type="button"
                role="switch"
                aria-checked={value.barback_tiers_enabled}
                aria-label="A bigger cut when more barbacks work"
                disabled={!canEdit}
                onClick={() => canEdit && toggleTiers(!value.barback_tiers_enabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
                  value.barback_tiers_enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  value.barback_tiers_enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {value.barback_tiers_enabled && (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <span>Barbacks working</span>
                  <span className="text-right">Cut of tips</span>
                  <span className="w-8" />
                </div>

                {tiers.map((tier, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        disabled={!canEdit}
                        value={tier.minCount}
                        onChange={(e) => setTier(i, { minCount: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                        className="w-16 tabular-nums"
                        aria-label={`Tier ${i + 1} — barbacks working`}
                      />
                      <span className="text-sm text-muted-foreground">or more</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        disabled={!canEdit}
                        value={tier.pct}
                        onChange={(e) => setTier(i, { pct: Math.min(50, Math.max(0, Number(e.target.value))) })}
                        className="w-16 tabular-nums"
                        aria-label={`Tier ${i + 1} — cut of tips`}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={!canEdit}
                      aria-label={`Remove tier ${i + 1}`}
                      onClick={() => set('barback_tip_tiers', tiers.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}

                {canEdit && (
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addTier}>
                    <Plus className="h-3.5 w-3.5" />
                    Add a tier
                  </Button>
                )}

                <p className="text-xs text-muted-foreground">
                  The highest row at or below the night&rsquo;s headcount wins, so the last
                  row means &ldquo;that many or more&rdquo;. Barbacks paid an hourly wage still
                  count toward the headcount &mdash; their share returns to the bartenders.
                </p>
              </div>
            )}
          </div>

          {/* How the cut is divided */}
          <div className="space-y-2 border-t pt-4">
            <Label className="text-sm">How the barback cut is divided</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ['hours', 'By hours worked', 'Same rule as the bartender pool. Somebody who worked eight hours takes four times what somebody who worked two did.'],
                ['equal', 'Equally between them', 'A flat tip-out per barback, whatever the length of the shift.'],
              ] as const).map(([v, label, desc]) => (
                <button
                  key={v}
                  type="button"
                  disabled={!canEdit}
                  aria-pressed={value.barback_split_method === v}
                  onClick={() => canEdit && set('barback_split_method', v)}
                  className={`rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${
                    value.barback_split_method === v
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/40'
                  }`}
                >
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          {canEdit && (
            // Saves on its own rather than deferring to the tab's Save button — a
            // popup that quietly needs a second click somewhere else is how
            // settings get lost.
            <Button type="button" disabled={saving} onClick={() => void onSave()}>
              {saving ? 'Saving…' : 'Save barback settings'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
