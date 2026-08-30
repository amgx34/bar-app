import { Skeleton } from '@/components/ui/skeleton';

export default function BooksLoading() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="flex gap-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-24" />)}
        </div>
      </div>

      {/* Pure profit band, then the six inputs behind it. */}
      <Skeleton className="h-40 rounded-xl" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="lg:col-span-2 h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}
