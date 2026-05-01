import { InventorySubNav } from './_components/inventory-sub-nav';

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col flex-1">
      {/* No more InventorySubNav at top if you want it in sidebar */}
      {children}
    </div>
  );
}