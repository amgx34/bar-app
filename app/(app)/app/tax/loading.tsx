import { Skeleton } from '@/components/ui/skeleton';

export default function TaxLoading() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="space-y-1.5">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-20 rounded-xl" />
      <div className="flex gap-8 border-b pb-0">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-5 w-24 mb-3" />)}
      </div>
      <div className="rounded-xl border p-5 space-y-4">
        <Skeleton className="h-4 w-40" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9" />)}
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9" />)}
        </div>
      </div>
    </div>
  );
}
