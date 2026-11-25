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
type Draft = Record<string, string>;

const parse = (s: string | undefined) => {
  if (s === undefined || s.trim() === '') return null;
  return Number(s.replace(',', '.'));
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

  // Resume after leaving. Browser-only convenience; the page works without it.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of a saved draft
      if (raw) setDraft(JSON.parse(raw));
    } catch {}
  }, [key]);
  function update(next: Draft) {
    setDraft(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
  }

  const counted = items.filter((i) => parse(draft[i.id]) !== null).length;
  const invalid = items.filter((i) => bad(draft[i.id]));
  const left = items.length - counted;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) =>
      (!needle || i.name.toLowerCase().includes(needle)) &&
      (!leftOnly || parse(draft[i.id]) === null));
  }, [items, q, leftOnly, draft]);

  function step(i: CountItem, by: number) {
    const cur = parse(draft[i.id]) ?? i.expected;
    const next = Math.max(0, Math.round((cur + by) * 1000) / 1000);
    update({ ...draft, [i.id]: String(next) });
  }

  function save() {
    if (invalid.length) { toast.error(`${invalid[0].name}: enter zero or more.`); return; }
    start(async () => {
      const res = await saveCount(
        items.map((i) => ({ item_id: i.id, counted: parse(draft[i.id]) })),
      );
      if (!res.ok) { toast.error(res.error); return; }
      update({});
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
            onClick={() => setLeftOnly(!leftOnly)} className="h-11 shrink-0"
          >
            Not counted
          </Button>
        </div>
      </div>

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

      <ul>
        {shown.map((i, idx) => {
          const header = idx === 0 || shown[idx - 1].category !== i.category ? i.category : null;
          const val = draft[i.id];
          const n = parse(val);
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
                  <p className="truncate font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Expected {i.expected} {i.unit}
                    {diff !== null && diff !== 0 && (
                      <span className={diff < 0 ? ' text-destructive' : ' text-primary'}>
                        {' '}({diff > 0 ? '+' : ''}{diff})
                      </span>
                    )}
                  </p>
                  {bad(val) && <p className="text-xs text-destructive">Enter zero or more.</p>}
                </div>
                {n === null ? (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline" className="h-11 min-w-11 px-3"
                      aria-label={`${i.name} matches expected`}
                      onClick={() => update({ ...draft, [i.id]: String(i.expected) })}
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
                      aria-label={`Counted ${i.name}`} inputMode="decimal" value={val}
                      onChange={(e) => update({ ...draft, [i.id]: e.target.value })}
                      className="h-11 w-16 text-center tabular-nums"
                    />
                    <Button variant="outline" className="h-11 w-11" aria-label={`More ${i.name}`} onClick={() => step(i, 1)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-above-nav z-[46] border-t sm:bottom-0 border-border/60 bg-background px-4 py-3 pb-3">
        <Button className="h-12 w-full" disabled={pending || counted === 0} onClick={save}>
          {pending ? 'Saving…' : counted === 0 ? 'Count something to save' : `Save count (${counted} items)`}
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
