'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Minus, Plus, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveCount } from '../actions';

export type CountItem = { id: string; name: string; unit: string; expected: number; category: string };

// Counted values by item id; absent means not counted yet. Kept as strings so
// "1." and an empty box survive typing.
// A key that is present means the row was touched, even when its box is empty.
// MATCH is the Matches tap: no change, never a number that goes stale.
type Draft = Record<string, string>;
const MATCH = '=';
const MAX_AGE_MS = 2 * 24 * 3600 * 1000;

const parse = (s: string | undefined) => {
  if (s === undefined || s.trim() === '') return null;
  return Number(s.replace(',', '.'));
};
const num = (i: CountItem, d: Draft) => (d[i.id] === MATCH ? i.expected : parse(d[i.id]));
const save1 = (key: string, draft: Draft) => {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), draft })); } catch {}
};
const bad = (s: string | undefined) => {
  const n = parse(s);
  return n !== null && (!Number.isFinite(n) || n < 0);
};

export function CountSession({ orgId, items }: { orgId: string; items: CountItem[] }) {
  const key = `rail-count-draft:${orgId}`;
  const [draft, setDraft] = useState<Draft>({});
  const [q, setQ] = useState('');
  const [leftOnly, setLeftOnly] = useState(false);
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [restored, setRestored] = useState<number | null>(null);
  // Rows touched this session stay visible in the Not counted filter until it is toggled.
  const [touched, setTouched] = useState<Set<string>>(new Set());

  // Resume after leaving. Browser-only convenience; the page works without it.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved.at === 'number' && Date.now() - saved.at < MAX_AGE_MS && saved.draft
        && Object.keys(saved.draft).length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of a saved draft
        setDraft(saved.draft);
        setRestored(saved.at);
      } else if (raw) localStorage.removeItem(key);
    } catch {}
  }, [key]);
  function update(next: Draft) {
    setDraft(next);
    save1(key, next);
  }

  function edit(id: string, next: Draft) {
    setTouched((t) => new Set(t).add(id));
    update(next);
  }
  function clear(id: string) {
    const rest = { ...draft };
    delete rest[id];
    update(rest);
  }
  const counted = items.filter((i) => num(i, draft) !== null).length;
  const invalid = items.filter((i) => bad(draft[i.id]));
  const left = items.length - counted;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) =>
      (!needle || i.name.toLowerCase().includes(needle)) &&
      (!leftOnly || num(i, draft) === null || touched.has(i.id)));
  }, [items, q, leftOnly, draft, touched]);

  function step(i: CountItem, by: number) {
    const cur = num(i, draft) ?? i.expected;
    const next = Math.max(0, Math.round((cur + by) * 1000) / 1000);
    edit(i.id, { ...draft, [i.id]: String(next) });
  }

  function save() {
    if (invalid.length) { toast.error(`${invalid[0].name}: enter zero or more.`); return; }
    start(async () => {
      const res = await saveCount(
        items.map((i) => ({ item_id: i.id, counted: num(i, draft), matches: draft[i.id] === MATCH })),
      );
      if (!res.ok) { toast.error(res.error); return; }
      setDraft({});
      try { localStorage.removeItem(key); } catch {}
      setDone(`Saved. ${res.changed} changed, ${res.unchanged} matched, ${res.skipped} not counted.`);
    });
  }

  if (done) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Count saved</h1>
        <p className="text-sm text-muted-foreground">{done}</p>
        <Button render={<Link href="/app/inventory" />}>Back to inventory</Button>
      </div>
    );
  }

  return (
    <div className="pb-44">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background px-4 py-3 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-lg font-bold">Count stock</h1>
          <p className="text-sm tabular-nums" aria-live="polite">
            <strong>{left}</strong> left of {items.length}
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            aria-label="Search items" placeholder="Search items" value={q}
            onChange={(e) => setQ(e.target.value)} className="h-11"
          />
          <Button
            variant={leftOnly ? 'default' : 'outline'} aria-pressed={leftOnly}
            onClick={() => { setLeftOnly(!leftOnly); setTouched(new Set()); }} className="h-11 shrink-0"
          >
            Not counted
          </Button>
        </div>
      </div>

      {restored !== null && (
        <div className="flex items-center justify-between gap-3 bg-muted/50 px-4 py-2 text-sm">
          <span>Restored a draft from {new Date(restored).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.</span>
          <Button variant="outline" size="sm" onClick={() => { update({}); try { localStorage.removeItem(key); } catch {} setRestored(null); }}>
            Discard
          </Button>
        </div>
      )}

      {items.length === 0 && (
        <p className="p-6 text-sm text-muted-foreground">
          No items to count yet. <Link className="underline" href="/app/inventory">Add items first</Link>.
        </p>
      )}
      {items.length > 0 && shown.length === 0 && (
        <p className="p-6 text-sm text-muted-foreground">
          {leftOnly && !q ? 'Everything is counted.' : 'No item matches that search.'}
        </p>
      )}

      <ul className="mx-auto max-w-3xl">
        {shown.map((i, idx) => {
          const header = idx === 0 || shown[idx - 1].category !== i.category ? i.category : null;
          const val = draft[i.id];
          const n = num(i, draft);
          const touchedRow = val !== undefined;
          const diff = n !== null && Number.isFinite(n) ? Math.round((n - i.expected) * 1000) / 1000 : null;
          return (
            <li key={i.id}>
              {header && (
                <p className="bg-muted/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {header}
                </p>
              )}
              <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Expected: {i.expected} {i.unit}
                    {diff !== null && diff !== 0 && (
                      <span className={diff < 0 ? ' font-semibold text-destructive' : ' font-semibold text-primary'}>
                        {' '}({diff > 0 ? '+' : ''}{diff})
                      </span>
                    )}
                  </p>
                  {bad(val) && <p id={`err-${i.id}`} className="text-xs text-destructive">Enter zero or more.</p>}
                </div>
                {!touchedRow ? (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline" className="h-11 min-w-11 px-3"
                      aria-label={`${i.name} matches expected`}
                      onClick={() => edit(i.id, { ...draft, [i.id]: MATCH })}
                    >
                      <Check className="h-4 w-4" /> Matches
                    </Button>
                    <Button
                      variant="outline" className="h-11 w-11" aria-label={`Start counting ${i.name}`}
                      onClick={() => step(i, 0)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="outline" className="h-11 w-11" aria-label={`Less ${i.name}`} onClick={() => step(i, -1)}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      aria-label={`Counted ${i.name}`} inputMode="decimal"
                      value={val === MATCH ? String(i.expected) : val}
                      aria-invalid={bad(val) || undefined}
                      aria-describedby={bad(val) ? `err-${i.id}` : undefined}
                      onChange={(e) => edit(i.id, { ...draft, [i.id]: e.target.value })}
                      className="h-11 w-16 text-center tabular-nums"
                    />
                    <Button variant="outline" className="h-11 w-11" aria-label={`More ${i.name}`} onClick={() => step(i, 1)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" className="h-11 px-2 text-xs" aria-label={`Clear ${i.name}`} onClick={() => clear(i.id)}>
                      Clear
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-above-nav z-[46] border-t md:bottom-0 border-border/60 bg-background px-4 py-3 pb-3">
        <Button className="h-12 w-full" disabled={pending || counted === 0} onClick={save}>
          {pending ? 'Saving…' : counted === 0 ? 'Count something to save' : `Save count (${counted} ${counted === 1 ? 'item' : 'items'})`}
        </Button>
        {left > 0 && counted > 0 && (
          <p className="mt-1 text-center text-xs text-muted-foreground">
            {left} not counted will stay as they are.
          </p>
        )}
      </div>
    </div>
  );
}
