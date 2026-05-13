import { Skeleton } from '@/components/ui/skeleton';

export default function PayrollLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* Title */}
      <div className="space-y-1.5">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Tab nav */}
      <div className="flex gap-8 border-b pb-0">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-5 w-20 mb-3" />)}
      </div>

      {/* Week navigator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-32 rounded-md" />
          <Skeleton className="h-8 w-32 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="border-b px-4 py-3 flex gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-4 flex-1" />)}
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="border-b last:border-b-0 px-4 py-3.5 flex gap-4">
            {[...Array(6)].map((_, j) => <Skeleton key={j} className="h-4 flex-1" />)}
          </div>
        ))}
      </div>
    </div>
  );
}
