import { Skeleton } from '@/components/ui/skeleton';

export default function InventoryLoading() {
  return (
    <main className="p-6 space-y-4">
      {/* Header controls */}
      <div className="flex items-center gap-3 pb-2">
        <Skeleton className="h-9 flex-1 max-w-xs" />
        <Skeleton className="h-9 w-40" />
        <div className="flex gap-1.5 ml-auto">
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="border-b px-4 py-3 flex gap-4">
          {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-4 flex-1" />)}
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="border-b last:border-b-0 px-4 py-3.5 flex gap-4 items-center">
            <Skeleton className="h-4 flex-[2]" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-6 rounded" />
          </div>
        ))}
      </div>
    </main>
  );
}
