import { Skeleton } from '@/components/ui/skeleton';

export default function RepsLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1.5">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="rounded-xl border overflow-hidden">
        <div className="border-b px-5 py-3 flex gap-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-4 flex-1" />)}
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="border-b last:border-b-0 px-5 py-4 flex gap-4 items-center">
            <Skeleton className="h-4 flex-[2]" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-6 w-12 rounded-full" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
