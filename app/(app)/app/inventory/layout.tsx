import { InventorySubNav } from './_components/inventory-sub-nav';

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col flex-1">
      {/* Restored: the sidebar carries these too, but on a phone the sidebar is
          a sheet, so without this there was no on-screen cue that /weigh and
          /analytics live under Inventory. */}
      <InventorySubNav />
      {/* min-w-0 is load-bearing, not tidying. A flex item defaults to
          min-width:auto, so the page below sized itself to its min-content and
          grew past the viewport — Analytics came out 388px wide inside a 369px
          phone and the whole page scrolled sideways. */}
      <div className="min-w-0">{children}</div>
    </div>
  );
}