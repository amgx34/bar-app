import { SectionTabs } from '../_components/section-tabs';

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* The sidebar carries these too, but on a phone the sidebar is a sheet,
          so without this there is no on-screen cue that /weigh, /setup and
          /analytics live under Inventory. */}
      <SectionTabs />

      {/* min-w-0 is load-bearing, not tidying. A flex item defaults to
          min-width:auto, so the page below sized itself to its min-content and
          grew past the viewport — Analytics came out 388px wide inside a 369px
          phone and the whole page scrolled sideways. */}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
