import { InventorySubNav } from './_components/inventory-sub-nav';

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col flex-1">
      {/* Restored: the sidebar carries these too, but on a phone the sidebar is
          a sheet, so without this there was no on-screen cue that /weigh and
          /analytics live under Inventory. */}
      <InventorySubNav />
      {children}
    </div>
  );
}