import { Skeleton } from '@/components/ui/skeleton';

export default function TipsLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* Title */}
      <div className="space-y-1.5">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Tab nav */}
      <div className="flex gap-8 border-b pb-0">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-5 w-24 mb-3" />)}
      </div>

      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>

      {/* Trend chart */}
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
