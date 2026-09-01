import { Skeleton } from '@/components/ui/skeleton';

/** Matches the shape of the period-driven Sales screen: header, band, one tall
 *  card, one table card. */
export default function SalesLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      {/* Header row: title + period toggle */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-9 w-64 rounded-lg" />
      </div>

      {/* Date navigator */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>

      {/* Live band */}
      <Skeleton className="h-32 rounded-xl" />

      {/* One tall card */}
      <Skeleton className="h-64 rounded-xl" />

      {/* One table card */}
      <div className="rounded-xl border overflow-hidden">
        <div className="border-b px-4 py-3 flex gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-4 flex-1" />)}
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="border-b last:border-b-0 px-4 py-3.5 flex gap-4">
            {[...Array(4)].map((_, j) => <Skeleton key={j} className="h-4 flex-1" />)}
          </div>
        ))}
      </div>
    </div>
  );
}
