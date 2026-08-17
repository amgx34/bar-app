import { Skeleton } from '@/components/ui/skeleton';

export default function PayrollReviewLoading() {
  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="space-y-1.5">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* The review table is the page — everything else is chrome. */}
      <div className="space-y-2">
        <Skeleton className="h-10 rounded-lg" />
        {[...Array(10)].map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>

      <div className="flex gap-3">
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-10 w-24 rounded-lg" />
      </div>
    </div>
  );
}
