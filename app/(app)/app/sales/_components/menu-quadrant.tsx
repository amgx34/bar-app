import { MENU_CLASS_LABEL, type MenuBoard, type MenuClass } from '@/lib/pos/menu-engineering';

const ORDER: MenuClass[] = ['star', 'plowhorse', 'puzzle', 'dog'];

const TONE: Record<MenuClass, string> = {
  star: 'border-l-emerald-600 dark:border-l-emerald-400',
  plowhorse: 'border-l-sky-600 dark:border-l-sky-400',
  puzzle: 'border-l-amber-600 dark:border-l-amber-400',
  dog: 'border-l-rose-600 dark:border-l-rose-400',
  unknown: 'border-l-muted',
};

/**
 * Which drinks earn their place.
 *
 * Grouped rather than plotted on a scatter: the four groups ARE the answer, and
 * a scatter would invite reading precision into a split that is a median, not a
 * measurement.
 *
 * The medians are shown because the classification is only meaningful against
 * them — an operator who cannot see where the line was drawn cannot judge
 * whether an item sitting just the wrong side of it really is a dog.
 */
export function MenuQuadrant({ board }: { board: MenuBoard }) {
  const grouped = ORDER.map((cls) => ({
    cls,
    items: board.items
      .filter((i) => i.menuClass === cls)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6),
  })).filter((g) => g.items.length > 0);

  if (grouped.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nothing sold in this period has a cost price yet, so no drink can be
        classified. Price your items to see this.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Split at this bar&rsquo;s own median — {Math.round(board.medianUnits)} sold and{' '}
        {board.medianMarginPct === null ? '—' : `${board.medianMarginPct.toFixed(0)}%`} margin.
        Not an industry target: a dive bar and a cocktail bar sit in different
        ranges and both have stars.
        {board.uncosted > 0 && (
          <>
            {' '}
            {board.uncosted} item{board.uncosted === 1 ? '' : 's'} could not be
            classified for want of a cost price.
          </>
        )}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {grouped.map(({ cls, items }) => (
          <div key={cls} className={`rounded-xl border border-l-4 bg-card p-4 ${TONE[cls]}`}>
            <p className="text-sm font-semibold">{MENU_CLASS_LABEL[cls]}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{items[0].advice}</p>
            <ul className="mt-3 space-y-1">
              {items.map((i) => (
                <li key={i.matchKey} className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{i.itemName}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {Math.round(i.unitsSold).toLocaleString()}
                    {i.marginPct !== null && ` · ${i.marginPct.toFixed(0)}%`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
