import { Skeleton } from '@/components/ui/skeleton';

export default function WeighLoading() {
  return (
    <main className="p-6 space-y-4">
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-28" />
      </div>
      <Skeleton className="h-9 w-36" />
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </main>
  );
}
